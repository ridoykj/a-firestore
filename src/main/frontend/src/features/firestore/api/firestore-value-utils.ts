/**
 * FFP-101/FFP-102/FFP-103: Canonical Firestore wire-value handling.
 *
 * The backend speaks the Firestore REST value model: every value node is an object with
 * exactly one explicit kind, e.g. `{"integerValue": "42"}` or `{"mapValue": {"fields": {...}}}`.
 * These helpers unwrap that model into editor-friendly plain JSON and re-wrap edited JSON for
 * saving while preserving the original native types of untouched values (timestamps, references,
 * geo points, bytes, and the integer/double distinction).
 */

export type FirestoreWireValue = Record<string, unknown>

/**
 * DUP-005: The value-kind taxonomy, declared once. It mirrors the backend's sealed
 * `FirestoreValue` interface, which the compiler enforces there; on this side the union below is
 * what links the guard, the unwrapper, the wrapper, and the diff's type mapping. Adding a kind to
 * this list makes every exhaustive site fail to compile instead of silently degrading through a
 * `default:` arm.
 */
export const FIRESTORE_VALUE_KINDS = [
  "nullValue",
  "booleanValue",
  "integerValue",
  "doubleValue",
  "stringValue",
  "timestampValue",
  "geoPointValue",
  "referenceValue",
  "bytesValue",
  "arrayValue",
  "mapValue",
] as const

export type FirestoreValueKind = (typeof FIRESTORE_VALUE_KINDS)[number]

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFirestoreValueKind(key: string): key is FirestoreValueKind {
  return (FIRESTORE_VALUE_KINDS as readonly string[]).includes(key)
}

/**
 * DUP-005: Compile-time exhaustiveness with a runtime fallback. If a kind is added to
 * {@link FIRESTORE_VALUE_KINDS} and a switch does not handle it, `kind` is no longer `never` and
 * the call fails to compile; at runtime an unexpected kind still degrades to `fallback` rather than
 * throwing inside a render.
 */
function assertAllKindsHandled<T>(kind: never, fallback: T): T {
  void kind
  return fallback
}

export function isWireValue(value: unknown): value is FirestoreWireValue {
  return kindOf(value) !== null
}

/** The single kind of a canonical wire value, or `null` if this is not one. */
export function kindOf(value: unknown): FirestoreValueKind | null {
  if (!isPlainObject(value)) {
    return null
  }
  const keys = Object.keys(value)
  if (keys.length !== 1) {
    return null
  }
  return isFirestoreValueKind(keys[0]) ? keys[0] : null
}

/**
 * Returns the value if it is already a canonical wire value, otherwise `null`.
 *
 * DUP-006: This used to carry a second decoder for the backend's old record-component encoding
 * (`{"value": x}`, `{"items": […]}`, `{"fields": {…}}`, `{"base64": …}`, `{"path": …}`, a bare
 * `{latitude, longitude}`, `{}` for null), from when Jackson 3 ignored the Jackson 2 annotations.
 * `FirestoreValue` now carries `tools.jackson` annotations and `DocumentDtoWireFormatTest` pins the
 * canonical single-kind form through the real HTTP stack, so that branch was unreachable for API
 * responses — while remaining a hazard for anything else routed through
 * {@link normalizeFirestoreFields}, because it decoded on generic key names: a legitimate map field
 * named `value`, `path`, `fields`, or `items` was reinterpreted as a typed Firestore value.
 */
export function normalizeWireValue(value: unknown): FirestoreWireValue | null {
  return isWireValue(value) ? value : null
}

/** Normalizes a document `fields` map to canonical wire values (see normalizeWireValue). */
export function normalizeFirestoreFields(fields: unknown): Record<string, FirestoreWireValue> {
  const result: Record<string, FirestoreWireValue> = {}
  if (!isPlainObject(fields)) {
    return result
  }
  for (const [key, value] of Object.entries(fields)) {
    const normalized = normalizeWireValue(value)
    if (normalized) {
      result[key] = normalized
    }
  }
  return result
}

/** Unwraps a wire value into plain JSON for display and editing. */
export function unwrapFirestoreValue(value: unknown): unknown {
  if (value == null) {
    return null
  }
  if (!isPlainObject(value)) {
    return value
  }

  const kind = kindOf(value)
  if (!kind) {
    // Not a recognizable value encoding; show the raw object rather than dropping it.
    return value
  }
  const body = value[kind]

  switch (kind) {
    case "nullValue":
      return null
    case "booleanValue":
      return body
    case "integerValue": {
      const parsed = typeof body === "string" ? Number(body) : (body as number)
      // Large int64 values do not fit a JS number; keep them as strings so no digits are lost.
      if (typeof body === "string" && !Number.isSafeInteger(parsed)) {
        return body
      }
      return parsed
    }
    case "doubleValue":
      return body
    case "stringValue":
      return body
    case "timestampValue":
      return body
    case "referenceValue":
      return body
    case "bytesValue":
      return body
    case "geoPointValue":
      return isPlainObject(body)
        ? { latitude: body.latitude, longitude: body.longitude }
        : body
    case "arrayValue": {
      const values = isPlainObject(body) && Array.isArray(body.values) ? body.values : []
      return values.map((item) => unwrapFirestoreValue(item))
    }
    case "mapValue": {
      const fields = isPlainObject(body) && isPlainObject(body.fields) ? body.fields : {}
      const result: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(fields)) {
        result[key] = unwrapFirestoreValue(item)
      }
      return result
    }
    default:
      return assertAllKindsHandled(kind, null)
  }
}

/** Unwraps a full `fields` map from a DocumentDto. */
export function unwrapFirestoreFields(fields: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (!isPlainObject(fields)) {
    return result
  }
  for (const [key, value] of Object.entries(fields)) {
    result[key] = unwrapFirestoreValue(value)
  }
  return result
}

/** Infers a wire value for JSON without a typed original (new fields). */
export function inferWireValue(value: unknown): FirestoreWireValue {
  if (value === null || value === undefined) {
    return { nullValue: null }
  }
  if (typeof value === "boolean") {
    return { booleanValue: value }
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value }
  }
  if (typeof value === "string") {
    return { stringValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => inferWireValue(item)) } }
  }
  if (isPlainObject(value)) {
    const fields: Record<string, FirestoreWireValue> = {}
    for (const [key, item] of Object.entries(value)) {
      fields[key] = inferWireValue(item)
    }
    return { mapValue: { fields } }
  }
  throw new Error(`Unsupported JSON value: ${String(value)}`)
}

function isIsoInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false
  }
  return !Number.isNaN(Date.parse(value))
}

function isBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64_PATTERN.test(value)
}

function isGeoPointShape(value: unknown): value is { latitude: number; longitude: number } {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 2 &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number"
  )
}

function isIntegerString(value: string): boolean {
  return /^-?\d+$/.test(value)
}

export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqualJson(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => key in b && deepEqualJson(a[key], b[key]))
    )
  }
  return false
}

/**
 * Wraps an edited plain-JSON value into a wire value, preserving the original native type
 * whenever the edited value is still compatible with it.
 */
export function wrapValueWithOriginal(
  edited: unknown,
  original?: FirestoreWireValue,
): FirestoreWireValue {
  const kind = kindOf(original)
  if (!original || !kind) {
    return inferWireValue(edited)
  }

  switch (kind) {
    case "nullValue":
      if (edited === null) {
        return { nullValue: null }
      }
      break
    case "booleanValue":
      if (typeof edited === "boolean") {
        return { booleanValue: edited }
      }
      break
    case "integerValue":
      if (typeof edited === "number" && Number.isInteger(edited)) {
        return { integerValue: String(edited) }
      }
      // Large int64 values are unwrapped as strings; keep them integers when still all digits.
      if (typeof edited === "string" && isIntegerString(edited)) {
        return { integerValue: edited }
      }
      break
    case "doubleValue":
      if (typeof edited === "number") {
        return { doubleValue: edited }
      }
      break
    case "stringValue":
      if (typeof edited === "string") {
        return { stringValue: edited }
      }
      break
    case "timestampValue":
      if (typeof edited === "string" && isIsoInstant(edited)) {
        return { timestampValue: edited }
      }
      break
    case "referenceValue":
      if (typeof edited === "string" && edited.trim()) {
        return { referenceValue: edited }
      }
      break
    case "bytesValue":
      if (typeof edited === "string" && isBase64(edited)) {
        return { bytesValue: edited }
      }
      break
    case "geoPointValue":
      if (isGeoPointShape(edited)) {
        return { geoPointValue: { latitude: edited.latitude, longitude: edited.longitude } }
      }
      break
    case "arrayValue":
      if (Array.isArray(edited)) {
        const originalItems = (() => {
          const body = original.arrayValue
          return isPlainObject(body) && Array.isArray(body.values)
            ? (body.values as FirestoreWireValue[])
            : []
        })()
        return {
          arrayValue: {
            values: edited.map((item, index) => wrapValueWithOriginal(item, originalItems[index])),
          },
        }
      }
      break
    case "mapValue":
      if (isPlainObject(edited)) {
        const body = original.mapValue
        const originalFields =
          isPlainObject(body) && isPlainObject(body.fields)
            ? (body.fields as Record<string, FirestoreWireValue>)
            : {}
        const fields: Record<string, FirestoreWireValue> = {}
        for (const [key, item] of Object.entries(edited)) {
          fields[key] = wrapValueWithOriginal(item, originalFields[key])
        }
        return { mapValue: { fields } }
      }
      break
    default:
      assertAllKindsHandled(kind, undefined)
      break
  }

  // The value changed to an incompatible shape; infer a fresh type.
  return inferWireValue(edited)
}

/** Wraps a full edited payload against the original typed fields of the document. */
export function buildWriteFields(
  edited: Record<string, unknown>,
  originalTypedFields: Record<string, FirestoreWireValue>,
): Record<string, FirestoreWireValue> {
  const fields: Record<string, FirestoreWireValue> = {}
  for (const [key, value] of Object.entries(edited)) {
    fields[key] = wrapValueWithOriginal(value, originalTypedFields[key])
  }
  return fields
}

function assertMergeDeletableSegment(segment: string, fullPath: string): void {
  if (segment.includes(".") || segment.includes("`")) {
    throw new Error(
      `Field '${fullPath}' contains characters that merge-mode deletion does not support. ` +
        "Use Replace mode to remove it.",
    )
  }
}

/**
 * FFP-103: Computes explicit dot-notation delete paths for fields that exist in the original
 * document but were removed from the edited payload. Recurses into nested maps so removing a
 * nested key produces `parent.child` rather than silently surviving a merge.
 */
export function computeDeleteFieldPaths(
  originalTypedFields: Record<string, FirestoreWireValue>,
  edited: Record<string, unknown>,
  prefix = "",
): string[] {
  const paths: string[] = []
  for (const [key, originalValue] of Object.entries(originalTypedFields)) {
    const fullPath = prefix ? `${prefix}.${key}` : key
    if (!(key in edited)) {
      assertMergeDeletableSegment(key, fullPath)
      paths.push(fullPath)
      continue
    }

    const editedValue = edited[key]
    const isOriginalMap = kindOf(originalValue) === "mapValue"
    if (isOriginalMap && isPlainObject(editedValue)) {
      const body = originalValue.mapValue
      const originalFields =
        isPlainObject(body) && isPlainObject(body.fields)
          ? (body.fields as Record<string, FirestoreWireValue>)
          : {}
      assertMergeDeletableSegment(key, fullPath)
      paths.push(...computeDeleteFieldPaths(originalFields, editedValue, fullPath))
    }
  }
  return paths
}

export type WritePreview = {
  addedFields: string[]
  changedFields: string[]
  deletedFields: string[]
}

/**
 * FFP-102: Summarizes which top-level fields a save would add or change, and which fields the
 * selected mode would delete, so the editor can preview the effect before writing.
 */
export function computeWritePreview(
  edited: Record<string, unknown>,
  originalTypedFields: Record<string, FirestoreWireValue>,
  mode: "MERGE" | "REPLACE",
): WritePreview {
  const addedFields: string[] = []
  const changedFields: string[] = []

  for (const [key, value] of Object.entries(edited)) {
    if (!(key in originalTypedFields)) {
      addedFields.push(key)
      continue
    }
    if (!deepEqualJson(unwrapFirestoreValue(originalTypedFields[key]), value)) {
      changedFields.push(key)
    }
  }

  const deletedFields =
    mode === "MERGE"
      ? computeDeleteFieldPaths(originalTypedFields, edited)
      : Object.keys(originalTypedFields).filter((key) => !(key in edited))

  return { addedFields, changedFields, deletedFields }
}
