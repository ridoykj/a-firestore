/**
 * FFP-302: Local, per-collection validation rules storage. Rules are non-secret metadata and
 * are stored via the shared persistence helper. They never affect Firestore security rules.
 */
import { STORAGE_PREFIX, readJson, writeJson, removeJson } from "@/shared/lib/persistent-storage"
import { EMPTY_RULES, type ValidationRules } from "@/features/firestore/api/schema-profiler"
import { contextKeyFor } from "@/features/firestore/api/firestore-utils"

function rulesKey(projectId: string, databaseId: string, collectionPath: string): string {
  return `${STORAGE_PREFIX}.rules.${contextKeyFor(projectId, databaseId)}.${collectionPath}.v1`
}

function isValidationRules(value: unknown): value is ValidationRules {
  if (!value || typeof value !== "object") {
    return false
  }
  const rules = value as Record<string, unknown>
  return (
    Array.isArray(rules.requiredPaths) &&
    rules.requiredPaths.every((item) => typeof item === "string") &&
    !!rules.expectedTypes &&
    typeof rules.expectedTypes === "object"
  )
}

export function loadRules(
  projectId: string,
  databaseId: string,
  collectionPath: string,
): ValidationRules {
  if (!collectionPath) {
    return EMPTY_RULES
  }
  return readJson<ValidationRules>(rulesKey(projectId, databaseId, collectionPath), isValidationRules, EMPTY_RULES)
}

export function hasRules(projectId: string, databaseId: string, collectionPath: string): boolean {
  const rules = loadRules(projectId, databaseId, collectionPath)
  return rules.requiredPaths.length > 0 || Object.keys(rules.expectedTypes).length > 0
}

export function saveRules(
  projectId: string,
  databaseId: string,
  collectionPath: string,
  rules: ValidationRules,
): void {
  if (!collectionPath) {
    return
  }
  writeJson(rulesKey(projectId, databaseId, collectionPath), rules)
}

export function clearRules(projectId: string, databaseId: string, collectionPath: string): void {
  if (!collectionPath) {
    return
  }
  removeJson(rulesKey(projectId, databaseId, collectionPath))
}
