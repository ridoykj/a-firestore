/**
 * FFP-204: Per-collection result-table column preferences (visibility, order, width, pin).
 *
 * Preferences are persisted per tab + collection path and merged with the server-inferred
 * columns each time results load, so new fields appear (visible) at the end.
 */
import { STORAGE_PREFIX, readJson, writeJson } from "@/shared/lib/persistent-storage"

export type ColumnPrefs = {
  order: string[]
  hidden: string[]
  widths: Record<string, number>
  pinned: string[]
}

export const EMPTY_COLUMN_PREFS: ColumnPrefs = { order: [], hidden: [], widths: {}, pinned: [] }

export type ResolvedColumn = {
  name: string
  hidden: boolean
  pinned: boolean
  width: number | null
}

export const DEFAULT_COLUMN_WIDTH = 208

function columnPrefsKey(tabId: string, collectionPath: string): string {
  return `${STORAGE_PREFIX}.tab.${tabId}.columns.${collectionPath}.v1`
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isColumnPrefs(value: unknown): value is ColumnPrefs {
  if (!value || typeof value !== "object") {
    return false
  }
  const prefs = value as Record<string, unknown>
  return (
    isStringArray(prefs.order) &&
    isStringArray(prefs.hidden) &&
    isStringArray(prefs.pinned) &&
    !!prefs.widths &&
    typeof prefs.widths === "object" &&
    Object.values(prefs.widths as Record<string, unknown>).every((v) => typeof v === "number")
  )
}

export function loadColumnPrefs(tabId: string, collectionPath: string): ColumnPrefs {
  if (!tabId || !collectionPath) {
    return EMPTY_COLUMN_PREFS
  }
  return readJson<ColumnPrefs>(columnPrefsKey(tabId, collectionPath), isColumnPrefs, EMPTY_COLUMN_PREFS)
}

export function saveColumnPrefs(tabId: string, collectionPath: string, prefs: ColumnPrefs): void {
  if (!tabId || !collectionPath) {
    return
  }
  writeJson(columnPrefsKey(tabId, collectionPath), prefs)
}

/**
 * Merges the server column names with saved prefs: ordered per prefs (unknown columns appended),
 * pinned columns first, hidden columns flagged. New columns are visible by default.
 */
export function resolveColumns(serverColumnNames: string[], prefs: ColumnPrefs): ResolvedColumn[] {
  const known = new Set(serverColumnNames)
  const ordered = [
    ...prefs.order.filter((name) => known.has(name)),
    ...serverColumnNames.filter((name) => !prefs.order.includes(name)),
  ]
  const pinnedSet = new Set(prefs.pinned)
  const hiddenSet = new Set(prefs.hidden)

  const decorate = (name: string): ResolvedColumn => ({
    name,
    hidden: hiddenSet.has(name),
    pinned: pinnedSet.has(name),
    width: typeof prefs.widths[name] === "number" ? prefs.widths[name] : null,
  })

  // Pinned columns render first, preserving their relative order.
  const pinned = ordered.filter((name) => pinnedSet.has(name)).map(decorate)
  const rest = ordered.filter((name) => !pinnedSet.has(name)).map(decorate)
  return [...pinned, ...rest]
}
