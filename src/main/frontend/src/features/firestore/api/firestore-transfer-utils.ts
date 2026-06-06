import type { FirestoreDocument } from "@/features/firestore/schemas/FirestoreSchema"
import { getPayloadOnly, normalizePath } from "@/features/firestore/api/firestore-utils"

export type FirestoreTransferRecord = {
  id: string
  path?: string
  payload: Record<string, unknown>
}

type CollectionTransferFile = {
  scope: "collection"
  formatVersion: 1
  path: string
  exportedAt: string
  documents: FirestoreTransferRecord[]
}

type DocumentTransferFile = {
  scope: "document"
  formatVersion: 1
  path: string
  id: string
  payload: Record<string, unknown>
}

const CSV_HEADERS = ["id", "path", "payload_json"] as const

export function documentIdFromPath(path: string): string {
  const normalized = normalizePath(path)
  if (!normalized) {
    return ""
  }
  const segments = normalized.split("/")
  return segments[segments.length - 1] ?? ""
}

export function toTransferRecord(
  document: FirestoreDocument,
  fallbackCollectionPath?: string,
): FirestoreTransferRecord {
  const normalizedDocPath =
    typeof document._path === "string" ? normalizePath(document._path) : ""
  const normalizedCollectionPath = normalizePath(fallbackCollectionPath ?? "")
  const pathDocId = documentIdFromPath(normalizedDocPath)
  const valueDocId = typeof document.id === "string" ? document.id.trim() : ""
  const docId = valueDocId || pathDocId

  if (!docId) {
    throw new Error("Document is missing an id and cannot be exported.")
  }

  const resolvedPath = normalizedDocPath || (normalizedCollectionPath ? `${normalizedCollectionPath}/${docId}` : "")
  const payload = getPayloadOnly(document)

  return {
    id: docId,
    path: resolvedPath || undefined,
    payload,
  }
}

export function buildCollectionTransferJson(
  collectionPath: string,
  records: FirestoreTransferRecord[],
): string {
  const normalizedCollectionPath = normalizePath(collectionPath)
  const payload: CollectionTransferFile = {
    scope: "collection",
    formatVersion: 1,
    path: normalizedCollectionPath,
    exportedAt: new Date().toISOString(),
    documents: records,
  }
  return JSON.stringify(payload, null, 2)
}

export function buildDocumentTransferJson(
  documentPath: string,
  id: string,
  payload: Record<string, unknown>,
): string {
  const normalizedPath = normalizePath(documentPath)
  const transfer: DocumentTransferFile = {
    scope: "document",
    formatVersion: 1,
    path: normalizedPath,
    id: id.trim(),
    payload,
  }
  return JSON.stringify(transfer, null, 2)
}

function ensureRecord(value: unknown, label: string): FirestoreTransferRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }

  const candidate = value as Record<string, unknown>
  const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
  if (!id) {
    throw new Error(`${label}.id is required.`)
  }

  const pathValue = typeof candidate.path === "string" ? normalizePath(candidate.path) : ""
  const payloadRaw = candidate.payload
  if (!payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) {
    throw new Error(`${label}.payload must be a JSON object.`)
  }

  return {
    id,
    path: pathValue || undefined,
    payload: payloadRaw as Record<string, unknown>,
  }
}

export function parseCollectionTransferJson(content: string): {
  path: string
  records: FirestoreTransferRecord[]
} {
  const parsed = JSON.parse(content) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Collection import JSON must be an object.")
  }

  const candidate = parsed as Record<string, unknown>
  if (candidate.scope !== "collection") {
    throw new Error("Collection import JSON must have scope='collection'.")
  }
  if (candidate.formatVersion !== 1) {
    throw new Error("Unsupported collection formatVersion.")
  }

  const path = typeof candidate.path === "string" ? normalizePath(candidate.path) : ""
  if (!path) {
    throw new Error("Collection import JSON is missing a valid path.")
  }

  if (!Array.isArray(candidate.documents)) {
    throw new Error("Collection import JSON must include a documents array.")
  }

  const records = candidate.documents.map((doc, index) =>
    ensureRecord(doc, `documents[${index}]`),
  )
  if (records.length === 0) {
    throw new Error("Collection import JSON has no documents.")
  }

  return { path, records }
}

export function parseDocumentTransferJson(content: string): FirestoreTransferRecord {
  const parsed = JSON.parse(content) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Document import JSON must be an object.")
  }

  const candidate = parsed as Record<string, unknown>
  if (candidate.scope !== "document") {
    throw new Error("Document import JSON must have scope='document'.")
  }
  if (candidate.formatVersion !== 1) {
    throw new Error("Unsupported document formatVersion.")
  }

  const path = typeof candidate.path === "string" ? normalizePath(candidate.path) : ""
  const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
  if (!path) {
    throw new Error("Document import JSON is missing a valid path.")
  }
  if (!id) {
    throw new Error("Document import JSON is missing a valid id.")
  }

  const payloadRaw = candidate.payload
  if (!payloadRaw || typeof payloadRaw !== "object" || Array.isArray(payloadRaw)) {
    throw new Error("Document import JSON payload must be a JSON object.")
  }

  return {
    id,
    path,
    payload: payloadRaw as Record<string, unknown>,
  }
}

function escapeCsvCell(value: string): string {
  const needsQuotes = value.includes(",") || value.includes("\"") || value.includes("\n") || value.includes("\r")
  if (!needsQuotes) {
    return value
  }
  return `"${value.replace(/"/g, "\"\"")}"`
}

function unescapeCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]

    if (inQuotes) {
      if (char === "\"") {
        const nextChar = content[index + 1]
        if (nextChar === "\"") {
          field += "\""
          index += 1
          continue
        }
        inQuotes = false
        continue
      }
      field += char
      continue
    }

    if (char === "\"") {
      inQuotes = true
      continue
    }
    if (char === ",") {
      row.push(field)
      field = ""
      continue
    }
    if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      continue
    }
    if (char === "\r") {
      const nextChar = content[index + 1]
      if (nextChar === "\n") {
        index += 1
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      continue
    }

    field += char
  }

  if (inQuotes) {
    throw new Error("CSV file has unmatched quotes.")
  }

  row.push(field)
  const isTrailingEmptyLine = row.length === 1 && row[0] === ""
  if (!isTrailingEmptyLine || rows.length === 0) {
    rows.push(row)
  }

  return rows
}

export function serializeTransferRecordsToCsv(records: FirestoreTransferRecord[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")]
  for (const record of records) {
    const payloadJson = JSON.stringify(record.payload)
    const cells = [
      escapeCsvCell(record.id),
      escapeCsvCell(record.path ?? ""),
      escapeCsvCell(payloadJson),
    ]
    lines.push(cells.join(","))
  }
  return lines.join("\n")
}

export function parseTransferCsv(content: string): FirestoreTransferRecord[] {
  const rows = unescapeCsvRows(content)
  if (rows.length === 0) {
    throw new Error("CSV file is empty.")
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  if (header.length !== CSV_HEADERS.length) {
    throw new Error("CSV header must be: id,path,payload_json")
  }
  for (let index = 0; index < CSV_HEADERS.length; index += 1) {
    if (header[index] !== CSV_HEADERS[index]) {
      throw new Error("CSV header must be: id,path,payload_json")
    }
  }

  const records: FirestoreTransferRecord[] = []
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const allEmpty = row.every((cell) => cell.trim() === "")
    if (allEmpty) {
      continue
    }
    if (row.length !== CSV_HEADERS.length) {
      throw new Error(`CSV row ${rowIndex + 1} must have exactly 3 columns.`)
    }

    const id = row[0].trim()
    const path = normalizePath(row[1])
    const payloadCell = row[2].trim()
    if (!id) {
      throw new Error(`CSV row ${rowIndex + 1} is missing id.`)
    }
    if (!payloadCell) {
      throw new Error(`CSV row ${rowIndex + 1} is missing payload_json.`)
    }

    let parsedPayload: unknown
    try {
      parsedPayload = JSON.parse(payloadCell)
    } catch {
      throw new Error(`CSV row ${rowIndex + 1} has invalid payload_json.`)
    }
    if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
      throw new Error(`CSV row ${rowIndex + 1} payload_json must be a JSON object.`)
    }

    records.push({
      id,
      path: path || undefined,
      payload: parsedPayload as Record<string, unknown>,
    })
  }

  if (records.length === 0) {
    throw new Error("CSV file has no data rows.")
  }

  return records
}

export function triggerTextDownload(
  filename: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function sanitizeFileNamePart(input: string): string {
  const normalized = normalizePath(input).replaceAll("/", "_")
  const sanitized = normalized.replace(/[^a-zA-Z0-9._-]+/g, "_")
  return sanitized || "firestore"
}
