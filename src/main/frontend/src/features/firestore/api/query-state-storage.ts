/**
 * FFP-201/FFP-203: Per-tab query form persistence.
 *
 * Persists only the serializable query *form* (path, grouped filters, order clauses, page size,
 * collection-group flag) so a browser refresh restores what the user was building. It never
 * stores results, cursors, or anything credential-derived, and restored state is not auto-run
 * (the tab must be reattached first).
 */
import { STORAGE_PREFIX, readJson, writeJson, removeJson } from "@/shared/lib/persistent-storage"
import type { FilterCombinator, OrderClause, WhereRow } from "@/features/firestore/schemas/FirestoreSchema"

export type PersistedQueryState = {
  queryPath: string
  whereRows: WhereRow[]
  filterCombinator: FilterCombinator
  collectionGroup: boolean
  orderBy: OrderClause[]
  limit: number
}

function queryStateKey(tabId: string): string {
  return `${STORAGE_PREFIX}.tab.${tabId}.query.v1`
}

function isOrderDirection(value: unknown): boolean {
  return value === "asc" || value === "desc"
}

function isWhereRow(value: unknown): value is WhereRow {
  if (!value || typeof value !== "object") {
    return false
  }
  const row = value as Record<string, unknown>
  return (
    typeof row.id === "number" &&
    typeof row.field === "string" &&
    typeof row.operator === "string" &&
    typeof row.value === "string" &&
    typeof row.type === "string" &&
    typeof row.groupId === "number"
  )
}

function isOrderClause(value: unknown): value is OrderClause {
  if (!value || typeof value !== "object") {
    return false
  }
  const clause = value as Record<string, unknown>
  return typeof clause.field === "string" && isOrderDirection(clause.direction)
}

export function isPersistedQueryState(value: unknown): value is PersistedQueryState {
  if (!value || typeof value !== "object") {
    return false
  }
  const state = value as Record<string, unknown>
  return (
    typeof state.queryPath === "string" &&
    Array.isArray(state.whereRows) &&
    state.whereRows.every(isWhereRow) &&
    (state.filterCombinator === "and" || state.filterCombinator === "or") &&
    typeof state.collectionGroup === "boolean" &&
    Array.isArray(state.orderBy) &&
    state.orderBy.every(isOrderClause) &&
    typeof state.limit === "number"
  )
}

export function loadQueryState(tabId: string): PersistedQueryState | null {
  if (!tabId) {
    return null
  }
  return readJson<PersistedQueryState | null>(queryStateKey(tabId), isPersistedQueryState, null)
}

export function saveQueryState(tabId: string, state: PersistedQueryState): void {
  if (!tabId) {
    return
  }
  writeJson(queryStateKey(tabId), state)
}

export function clearQueryState(tabId: string): void {
  if (!tabId) {
    return
  }
  removeJson(queryStateKey(tabId))
}
