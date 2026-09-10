/**
 * FFP-301: Type-aware document/collection comparison.
 *
 * Flattens typed Firestore field maps (canonical wire values) into leaf paths carrying both the
 * unwrapped value and its Firestore type, then reports added / removed / changed / unchanged
 * leaves. Because it reads the wire kind, an integer→double change (same numeric value) is still
 * reported as a type change, satisfying "type-aware" diffing.
 */
import {
  deepEqualJson,
  kindOf,
  unwrapFirestoreValue,
  type FirestoreValueKind,
  type FirestoreWireValue,
} from "@/features/firestore/api/firestore-value-utils"

export type DiffValueType =
  | "string"
  | "integer"
  | "double"
  | "boolean"
  | "null"
  | "timestamp"
  | "geopoint"
  | "reference"
  | "bytes"
  | "array"
  | "map"
  | "unknown"

export type DiffStatus = "added" | "removed" | "changed"

export type DiffEntry = {
  path: string
  status: DiffStatus
  left?: unknown
  right?: unknown
  leftType?: DiffValueType
  rightType?: DiffValueType
}

export type DiffResult = {
  added: number
  removed: number
  changed: number
  unchanged: number
  entries: DiffEntry[]
}

type Leaf = { value: unknown; type: DiffValueType }

/**
 * DUP-005: Keyed by the shared {@link FirestoreValueKind} union rather than by `string`, so a kind
 * added to the taxonomy fails to compile here instead of silently diffing as `"unknown"` — which
 * used to surface as a phantom type conflict in the schema profiler.
 */
const WIRE_KIND_TO_DIFF_TYPE: Record<FirestoreValueKind, DiffValueType> = {
  stringValue: "string",
  integerValue: "integer",
  doubleValue: "double",
  booleanValue: "boolean",
  nullValue: "null",
  timestampValue: "timestamp",
  geoPointValue: "geopoint",
  referenceValue: "reference",
  bytesValue: "bytes",
  arrayValue: "array",
  mapValue: "map",
}

/** Flattens a typed field map into leaf paths. Maps recurse; arrays are compared as whole leaves. */
export function flattenTypedFields(
  fields: Record<string, FirestoreWireValue>,
  prefix = "",
): Map<string, Leaf> {
  const leaves = new Map<string, Leaf>()
  for (const [key, rawValue] of Object.entries(fields)) {
    const kind = kindOf(rawValue)
    const path = prefix ? `${prefix}.${key}` : key
    if (!kind) {
      leaves.set(path, { value: rawValue, type: "unknown" })
      continue
    }
    if (kind === "mapValue") {
      const body = rawValue.mapValue as { fields?: Record<string, FirestoreWireValue> } | undefined
      const nested = body && body.fields ? body.fields : {}
      const nestedLeaves = flattenTypedFields(nested, path)
      if (nestedLeaves.size === 0) {
        // An empty map is itself a leaf so an added/removed empty map still shows.
        leaves.set(path, { value: {}, type: "map" })
      } else {
        for (const [nestedPath, leaf] of nestedLeaves) {
          leaves.set(nestedPath, leaf)
        }
      }
      continue
    }
    leaves.set(path, { value: unwrapFirestoreValue(rawValue), type: WIRE_KIND_TO_DIFF_TYPE[kind] })
  }
  return leaves
}

/** Compares two typed field maps and returns a sorted, type-aware diff. */
export function diffTypedFields(
  left: Record<string, FirestoreWireValue>,
  right: Record<string, FirestoreWireValue>,
): DiffResult {
  const leftLeaves = flattenTypedFields(left)
  const rightLeaves = flattenTypedFields(right)
  const allPaths = new Set<string>([...leftLeaves.keys(), ...rightLeaves.keys()])

  const entries: DiffEntry[] = []
  let unchanged = 0

  for (const path of [...allPaths].sort()) {
    const l = leftLeaves.get(path)
    const r = rightLeaves.get(path)
    if (l && !r) {
      entries.push({ path, status: "removed", left: l.value, leftType: l.type })
    } else if (!l && r) {
      entries.push({ path, status: "added", right: r.value, rightType: r.type })
    } else if (l && r) {
      if (l.type !== r.type || !deepEqualJson(l.value, r.value)) {
        entries.push({
          path,
          status: "changed",
          left: l.value,
          right: r.value,
          leftType: l.type,
          rightType: r.type,
        })
      } else {
        unchanged += 1
      }
    }
  }

  return {
    added: entries.filter((entry) => entry.status === "added").length,
    removed: entries.filter((entry) => entry.status === "removed").length,
    changed: entries.filter((entry) => entry.status === "changed").length,
    unchanged,
    entries,
  }
}

/**
 * Compares the aggregated field schema of two collection samples: which leaf paths appear on the
 * left, the right, or both. Types are reported as the set of observed types per path.
 */
export function diffCollectionSamples(
  left: Array<Record<string, FirestoreWireValue>>,
  right: Array<Record<string, FirestoreWireValue>>,
): DiffResult {
  const leftSchema = aggregateSchema(left)
  const rightSchema = aggregateSchema(right)
  const allPaths = new Set<string>([...leftSchema.keys(), ...rightSchema.keys()])

  const entries: DiffEntry[] = []
  let unchanged = 0

  for (const path of [...allPaths].sort()) {
    const l = leftSchema.get(path)
    const r = rightSchema.get(path)
    const leftTypes = l ? [...l].sort().join("|") : undefined
    const rightTypes = r ? [...r].sort().join("|") : undefined
    if (l && !r) {
      entries.push({ path, status: "removed", left: leftTypes })
    } else if (!l && r) {
      entries.push({ path, status: "added", right: rightTypes })
    } else if (leftTypes !== rightTypes) {
      entries.push({ path, status: "changed", left: leftTypes, right: rightTypes })
    } else {
      unchanged += 1
    }
  }

  return {
    added: entries.filter((entry) => entry.status === "added").length,
    removed: entries.filter((entry) => entry.status === "removed").length,
    changed: entries.filter((entry) => entry.status === "changed").length,
    unchanged,
    entries,
  }
}

function aggregateSchema(sample: Array<Record<string, FirestoreWireValue>>): Map<string, Set<DiffValueType>> {
  const schema = new Map<string, Set<DiffValueType>>()
  for (const doc of sample) {
    for (const [path, leaf] of flattenTypedFields(doc)) {
      const set = schema.get(path) ?? new Set<DiffValueType>()
      set.add(leaf.type)
      schema.set(path, set)
    }
  }
  return schema
}
