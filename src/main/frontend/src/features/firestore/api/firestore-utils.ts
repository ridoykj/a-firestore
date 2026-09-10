import type { FirestoreDocument } from "@/features/firestore/schemas/FirestoreSchema"
import { normalizeFirestoreFields, unwrapFirestoreFields } from "@/features/firestore/api/firestore-value-utils"

const FIRESTORE_AUTO_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

/** Firestore's name for the unnamed database — the wire and key form of a blank database id. */
export const DEFAULT_DATABASE_ID = "(default)"

/**
 * DUP-004: The one place a blank database id becomes `(default)`. This mapping keys the backend
 * connection registry, the tab id, and every localStorage context key, so the three must agree
 * exactly — a copy that trimmed differently produced a tab whose requests hit one connection while
 * its persisted state lived under another key. Mirrors the backend's `FirestoreIds`.
 */
export function normalizeDatabaseId(databaseId?: string | null): string {
  const trimmed = (databaseId ?? "").trim()
  return trimmed ? trimmed : DEFAULT_DATABASE_ID
}

/**
 * DUP-004: The inverse direction. Tabs and requests carry a blank database id for the unnamed
 * database; only ids and labels use the explicit `(default)` spelling.
 */
export function toStoredDatabaseId(databaseId?: string | null): string {
  const normalized = normalizeDatabaseId(databaseId)
  return normalized === DEFAULT_DATABASE_ID ? "" : normalized
}

/** DUP-004: A workspace tab id — also the backend connection key's shape. */
export function tabIdFor(projectId: string, databaseId?: string | null): string {
  return `${projectId.trim()}:${normalizeDatabaseId(databaseId)}`
}

/** DUP-004: The connection scope for query caches and localStorage keys. */
export function contextKeyFor(projectId: string, databaseId?: string | null): string {
  return `${projectId}::${normalizeDatabaseId(databaseId)}`
}

/**
 * DUP-004/DUP-009: The connection headers every backend request carries. Built here so axios calls
 * and SSE streams cannot disagree about which connection they are addressing.
 */
export function firestoreContextHeaders(
  projectId: string,
  databaseId?: string | null,
): Record<string, string> {
  return {
    "X-Project-Id": projectId,
    "X-Database-Id": normalizeDatabaseId(databaseId),
  }
}

/**
 * Drops every empty path segment — leading, trailing, and interior — so this agrees with the
 * backend's `FirestorePaths.normalize` (DUP-001) and `users//alice` cannot be a document on one side
 * and a collection on the other.
 */
export function normalizePath(path: string): string {
  return path
    .trim()
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/")
}

export function encodePath(path: string): string {
  const normalized = normalizePath(path)
  if (!normalized) {
    return ""
  }
  return normalized.split("/").map(encodeURIComponent).join("/")
}

export function pathIsCollection(path: string): boolean {
  const normalized = normalizePath(path)
  if (!normalized) {
    return false
  }
  return normalized.split("/").length % 2 !== 0
}

export function extractApiMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value
  }

  if (value && typeof value === "object") {
    const maybeMessage = (value as Record<string, unknown>).message
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage
    }
  }

  return "Request failed."
}

export function parseJsonPayload(text: string): Record<string, unknown> {
  const raw = text.trim()
  if (!raw) {
    return {}
  }

  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object.")
  }

  return parsed as Record<string, unknown>
}

export function documentIdIsValid(docId: string): boolean {
  const normalized = docId.trim()
  if (!normalized) {
    return false
  }
  if (normalized === "." || normalized === "..") {
    return false
  }
  return !normalized.includes("/")
}

export function generateFirestoreDocumentId(length = 20): string {
  const size = Math.max(1, Math.floor(length))
  const alphabetSize = FIRESTORE_AUTO_ID_CHARS.length

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const randomBytes = new Uint8Array(size)
    crypto.getRandomValues(randomBytes)
    return Array.from(randomBytes, (value) => FIRESTORE_AUTO_ID_CHARS[value % alphabetSize]).join("")
  }

  let generated = ""
  for (let index = 0; index < size; index += 1) {
    const value = Math.floor(Math.random() * alphabetSize)
    generated += FIRESTORE_AUTO_ID_CHARS[value]
  }
  return generated
}

export function getPayloadOnly(document: FirestoreDocument): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(document)) {
    if (key === "id" || key.startsWith("_")) {
      continue
    }
    payload[key] = value
  }
  return payload
}

export function safePreviewValue(value: unknown): string {
  if (value === null) {
    return "null"
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export { unwrapFirestoreValue } from "@/features/firestore/api/firestore-value-utils"

/**
 * FFP-101: Maps a typed DocumentDto (canonical wire values) to the flat, display-friendly
 * document shape used by the results table. The typed fields and the concurrency token are
 * kept on underscore-prefixed keys, which are excluded from payload/export helpers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDocumentDtoToFirestoreDocument(dto: any): FirestoreDocument {
  const doc: FirestoreDocument = {
    id: dto.id,
    _path: dto.path || dto._path,
  }

  if (dto.fields && typeof dto.fields === "object" && !Array.isArray(dto.fields)) {
    doc._typedFields = normalizeFirestoreFields(dto.fields)
    doc._updateTime = typeof dto.updateTime === "string" ? dto.updateTime : null
    for (const [key, value] of Object.entries(unwrapFirestoreFields(dto.fields))) {
      doc[key] = value
    }
  } else {
    for (const [key, value] of Object.entries(dto)) {
      if (key !== "id" && key !== "path" && key !== "_path") {
        doc[key] = value
      }
    }
  }

  return doc
}
