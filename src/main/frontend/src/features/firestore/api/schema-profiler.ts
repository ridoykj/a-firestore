/**
 * FFP-302: Schema profiler and local validation rules.
 *
 * Profiles a bounded collection sample into per-field frequency, observed types (a field with
 * more than one non-null type is a "conflict"), and nullability. Rules derived from a profile
 * (or authored by hand) validate a document's fields locally before a write — this never touches
 * Firestore security rules.
 */
import { flattenTypedFields, type DiffValueType } from "@/features/firestore/api/firestore-diff"
import type { FirestoreWireValue } from "@/features/firestore/api/firestore-value-utils"

export type FieldProfile = {
  path: string
  presentCount: number
  nullCount: number
  /** Non-null observed type → occurrence count. More than one key means a type conflict. */
  types: Record<string, number>
}

export type SchemaProfile = {
  sampled: number
  fields: FieldProfile[]
}

export type ValidationRules = {
  requiredPaths: string[]
  expectedTypes: Record<string, DiffValueType>
}

export type ValidationIssue = {
  path: string
  kind: "missing-required" | "unexpected-type"
  message: string
}

export const EMPTY_RULES: ValidationRules = { requiredPaths: [], expectedTypes: {} }

/** Aggregates a typed sample into a per-field schema profile, sorted by field path. */
export function profileSample(samples: Array<Record<string, FirestoreWireValue>>): SchemaProfile {
  const byPath = new Map<string, FieldProfile>()
  for (const doc of samples) {
    for (const [path, leaf] of flattenTypedFields(doc)) {
      const entry = byPath.get(path) ?? { path, presentCount: 0, nullCount: 0, types: {} }
      entry.presentCount += 1
      if (leaf.type === "null") {
        entry.nullCount += 1
      } else {
        entry.types[leaf.type] = (entry.types[leaf.type] ?? 0) + 1
      }
      byPath.set(path, entry)
    }
  }
  const fields = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  return { sampled: samples.length, fields }
}

/** True when a field is observed with more than one non-null type across the sample. */
export function hasTypeConflict(field: FieldProfile): boolean {
  return Object.keys(field.types).length > 1
}

/**
 * Derives conservative rules from a profile: fields present in every sampled document are
 * required, and fields with a single observed non-null type get that expected type.
 */
export function deriveRules(profile: SchemaProfile): ValidationRules {
  const requiredPaths: string[] = []
  const expectedTypes: Record<string, DiffValueType> = {}
  for (const field of profile.fields) {
    if (profile.sampled > 0 && field.presentCount === profile.sampled) {
      requiredPaths.push(field.path)
    }
    const typeKeys = Object.keys(field.types)
    if (typeKeys.length === 1) {
      expectedTypes[field.path] = typeKeys[0] as DiffValueType
    }
  }
  return { requiredPaths, expectedTypes }
}

/** Validates a document's typed fields against local rules; returns issues (empty when valid). */
export function validateFields(
  typedFields: Record<string, FirestoreWireValue>,
  rules: ValidationRules,
): ValidationIssue[] {
  const leaves = flattenTypedFields(typedFields)
  const issues: ValidationIssue[] = []

  for (const path of rules.requiredPaths) {
    if (!leaves.has(path)) {
      issues.push({ path, kind: "missing-required", message: `Required field '${path}' is missing.` })
    }
  }

  for (const [path, expected] of Object.entries(rules.expectedTypes)) {
    const leaf = leaves.get(path)
    // Only flag present fields; nulls are allowed (nullability is not a type violation here).
    if (leaf && leaf.type !== "null" && leaf.type !== expected) {
      issues.push({
        path,
        kind: "unexpected-type",
        message: `Field '${path}' should be ${expected} but is ${leaf.type}.`,
      })
    }
  }

  return issues
}
