/**
 * FFP-201: Small localStorage helper for non-secret workspace state.
 *
 * Generalizes the direct `localStorage` idiom already used by the theme provider into a
 * keyed, type-guarded, crash-safe helper. Every read validates the stored shape through a
 * caller-supplied guard and falls back cleanly on missing/corrupt payloads, so a schema
 * change (bump the `.v1` suffix in the key) degrades to defaults instead of throwing.
 *
 * SECURITY: only ever pass non-secret values here. Credential files/JSON, access tokens, and
 * anything derived from them must never be persisted (see FUTURE_FEATURE_PLAN.md security
 * invariants).
 */

/** All persisted keys share this prefix so they are easy to find and clear. */
export const STORAGE_PREFIX = "a-firestore"

export type StorageGuard<T> = (value: unknown) => value is T

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

/**
 * Reads and validates a JSON payload. Returns `fallback` when storage is unavailable, the key
 * is missing, the JSON is unparseable, or the value fails the guard. Never throws.
 */
export function readJson<T>(key: string, guard: StorageGuard<T>, fallback: T): T {
  if (!hasStorage()) {
    return fallback
  }
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return fallback
  }
  if (raw === null) {
    return fallback
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/** Serializes and writes a value. Silently no-ops if storage is unavailable or full. */
export function writeJson<T>(key: string, value: T): void {
  if (!hasStorage()) {
    return
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota errors / disabled storage are non-fatal for optional workspace state.
  }
}

/** Removes a key. Never throws. */
export function removeJson(key: string): void {
  if (!hasStorage()) {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore.
  }
}
