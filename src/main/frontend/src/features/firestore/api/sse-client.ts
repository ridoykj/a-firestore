/**
 * DUP-009: The one SSE wire-up.
 *
 * `baseUrl` used to be re-declared in three modules, and two independent `fetchEventSource` calls
 * each repeated `openWhenHidden`, a silent `JSON.parse` guard, and the `throw error` inside
 * `onerror` that suppresses the library's reconnect loop. One of those wire-ups also built its
 * context headers inline (a fourth copy of DUP-004) while the other sent none at all — so if
 * `/api/jobs/**` ever starts requiring them, both callers now get them from the same builder.
 */
import { fetchEventSource } from "@microsoft/fetch-event-source"

/** The API origin; empty in dev, where Vite proxies to the backend. */
export const apiBaseUrl: string = import.meta.env.VITE_BASE_URL || ""

export type SseEvent<T> = {
  /** The SSE event name the backend set (`progress`, `change`, `error`, …). */
  name: string
  data: T
}

export type StreamSseOptions<T> = {
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Called for every message whose payload parsed as JSON. */
  onEvent: (event: SseEvent<T>) => void
  /** Called when the stream fails; the reconnect loop is always suppressed. */
  onError?: (error: Error) => void
  /** Called once the connection is established. */
  onOpen?: () => void
}

/**
 * Opens an SSE stream and delivers parsed events. Messages that are not valid JSON are skipped
 * rather than surfaced, matching what both previous call sites did. The returned promise settles
 * when the stream ends; failures are reported through `onError` and never reject.
 */
export function streamSse<T>(path: string, options: StreamSseOptions<T>): Promise<void> {
  const { headers, signal, onEvent, onError, onOpen } = options

  return fetchEventSource(`${apiBaseUrl}${path}`, {
    signal,
    // Keep streaming while the tab is in the background; a watch or job must not stall on blur.
    openWhenHidden: true,
    headers,
    onopen: async () => {
      onOpen?.()
    },
    onmessage(message) {
      let data: T
      try {
        data = JSON.parse(message.data) as T
      } catch {
        return
      }
      onEvent({ name: message.event ?? "", data })
    },
    onerror(error) {
      onError?.(error instanceof Error ? error : new Error("Stream error."))
      // Throwing stops the library's automatic reconnect; callers restart explicitly.
      throw error
    },
  }).catch((error: unknown) => {
    onError?.(error instanceof Error ? error : new Error("Stream failed."))
  })
}
