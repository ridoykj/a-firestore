import type { FirestoreDocument } from "@/dto/firestore/FirestoreSchema"

const FIRESTORE_AUTO_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

export function normalizePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, "")
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
    return true
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
