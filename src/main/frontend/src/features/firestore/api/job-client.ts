/**
 * FFP-304/FFP-305: Streams a durable job's progress over SSE and resolves when it reaches a
 * terminal state (complete / cancelled / failed). Cancellation is handled by the caller via
 * {@link firestoreService.cancelJob}; the job then emits a `cancelled` terminal event which
 * resolves this promise.
 *
 * DUP-009: the SSE plumbing (base URL, parse guard, reconnect suppression) lives in `sse-client`.
 */
import type { FirestoreContext, JobSnapshot } from "@/features/firestore/api/firestore-service"
import { firestoreContextHeaders } from "@/features/firestore/api/firestore-utils"
import { streamSse } from "@/features/firestore/api/sse-client"

const TERMINAL_EVENTS = new Set(["complete", "completed", "cancelled", "failed", "error"])
const FAILURE_EVENTS = new Set(["failed", "error"])

export type StreamJobOptions = {
  onProgress?: (snapshot: JobSnapshot) => void
  signal?: AbortSignal
  /**
   * The connection the job belongs to. `/api/jobs/**` currently resolves a job by id alone, but the
   * headers are sent so this stream does not silently break the day it stops doing that.
   */
  context?: FirestoreContext
}

export async function streamJobEvents(
  jobId: string,
  { onProgress, signal, context }: StreamJobOptions = {},
): Promise<JobSnapshot> {
  return new Promise<JobSnapshot>((resolve, reject) => {
    let settled = false

    const settle = (outcome: () => void) => {
      if (!settled) {
        settled = true
        outcome()
      }
    }

    void streamSse<JobSnapshot>(`/api/jobs/${jobId}/events`, {
      signal,
      headers: context ? firestoreContextHeaders(context.projectId, context.databaseId) : undefined,
      onEvent({ name, data }) {
        onProgress?.(data)
        if (!TERMINAL_EVENTS.has(name)) {
          return
        }
        settle(() =>
          FAILURE_EVENTS.has(name)
            ? reject(new Error(data.message || "Job failed."))
            : resolve(data),
        )
      },
      onError(error) {
        settle(() => reject(error))
      },
    })
  })
}
