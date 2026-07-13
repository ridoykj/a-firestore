/**
 * FFP-304/FFP-305: Streams a durable job's progress over SSE and resolves when it reaches a
 * terminal state (complete / cancelled / failed). Cancellation is handled by the caller via
 * {@link firestoreService.cancelJob}; the job then emits a `cancelled` terminal event which
 * resolves this promise.
 */
import { fetchEventSource } from "@microsoft/fetch-event-source"
import type { JobSnapshot } from "@/features/firestore/api/firestore-service"

const baseUrl: string = import.meta.env.VITE_BASE_URL || ""

const TERMINAL_EVENTS = new Set(["complete", "completed", "cancelled", "failed", "error"])

export type StreamJobOptions = {
  onProgress?: (snapshot: JobSnapshot) => void
  signal?: AbortSignal
}

export async function streamJobEvents(
  jobId: string,
  { onProgress, signal }: StreamJobOptions = {},
): Promise<JobSnapshot> {
  return new Promise<JobSnapshot>((resolve, reject) => {
    let settled = false
    fetchEventSource(`${baseUrl}/api/jobs/${jobId}/events`, {
      signal,
      openWhenHidden: true,
      onmessage(event) {
        let snapshot: JobSnapshot
        try {
          snapshot = JSON.parse(event.data) as JobSnapshot
        } catch {
          return
        }
        onProgress?.(snapshot)
        if (event.event && TERMINAL_EVENTS.has(event.event)) {
          settled = true
          if (event.event === "failed" || event.event === "error") {
            reject(new Error(snapshot.message || "Job failed."))
          } else {
            resolve(snapshot)
          }
        }
      },
      onerror(error) {
        if (!settled) {
          reject(error instanceof Error ? error : new Error("Job stream error."))
        }
        // Throw to stop the default reconnect behavior.
        throw error
      },
    }).catch((error) => {
      if (!settled) {
        reject(error instanceof Error ? error : new Error("Job stream failed."))
      }
    })
  })
}
