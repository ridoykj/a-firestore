/**
 * FFP-202: Saved queries, favorites, and bounded history — persisted per project/database.
 *
 * Entries store only the serializable query form ({@link PersistedQueryState}), which carries no
 * credentials or results. History is bounded and de-duplicates consecutive identical runs.
 */
import { STORAGE_PREFIX, readJson, writeJson, removeJson } from "@/shared/lib/persistent-storage"
import {
  isPersistedQueryState,
  type PersistedQueryState,
} from "@/features/firestore/api/query-state-storage"
import { contextKeyFor } from "@/features/firestore/api/firestore-utils"

export type SavedQuery = {
  id: string
  name: string
  favorite: boolean
  createdAt: number
  query: PersistedQueryState
}

export type HistoryEntry = {
  id: string
  ranAt: number
  query: PersistedQueryState
}

export const HISTORY_LIMIT = 25

// DUP-004: the storage scope uses the same normalization as the connection key and the tab id.
const contextKey = contextKeyFor

function savedKey(projectId: string, databaseId: string): string {
  return `${STORAGE_PREFIX}.savedQueries.${contextKey(projectId, databaseId)}.v1`
}

function historyKey(projectId: string, databaseId: string): string {
  return `${STORAGE_PREFIX}.history.${contextKey(projectId, databaseId)}.v1`
}

function isSavedQuery(value: unknown): value is SavedQuery {
  if (!value || typeof value !== "object") {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.favorite === "boolean" &&
    typeof entry.createdAt === "number" &&
    isPersistedQueryState(entry.query)
  )
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") {
    return false
  }
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === "string" &&
    typeof entry.ranAt === "number" &&
    isPersistedQueryState(entry.query)
  )
}

function isSavedQueryList(value: unknown): value is SavedQuery[] {
  return Array.isArray(value) && value.every(isSavedQuery)
}

function isHistoryList(value: unknown): value is HistoryEntry[] {
  return Array.isArray(value) && value.every(isHistoryEntry)
}

function newId(): string {
  // App-runtime id; Date.now/Math.random are acceptable here (not a workflow script).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ----------------------------------------------------------------- saved

export function loadSavedQueries(projectId: string, databaseId: string): SavedQuery[] {
  return readJson<SavedQuery[]>(savedKey(projectId, databaseId), isSavedQueryList, [])
}

export function saveSavedQueries(projectId: string, databaseId: string, queries: SavedQuery[]): void {
  writeJson(savedKey(projectId, databaseId), queries)
}

export function addSavedQuery(
  projectId: string,
  databaseId: string,
  name: string,
  query: PersistedQueryState,
): SavedQuery[] {
  const existing = loadSavedQueries(projectId, databaseId)
  const entry: SavedQuery = { id: newId(), name: name.trim() || "Untitled query", favorite: false, createdAt: Date.now(), query }
  const next = [entry, ...existing]
  saveSavedQueries(projectId, databaseId, next)
  return next
}

export function removeSavedQuery(projectId: string, databaseId: string, id: string): SavedQuery[] {
  const next = loadSavedQueries(projectId, databaseId).filter((entry) => entry.id !== id)
  saveSavedQueries(projectId, databaseId, next)
  return next
}

export function renameSavedQuery(
  projectId: string,
  databaseId: string,
  id: string,
  name: string,
): SavedQuery[] {
  const next = loadSavedQueries(projectId, databaseId).map((entry) =>
    entry.id === id ? { ...entry, name: name.trim() || entry.name } : entry,
  )
  saveSavedQueries(projectId, databaseId, next)
  return next
}

export function toggleSavedQueryFavorite(
  projectId: string,
  databaseId: string,
  id: string,
): SavedQuery[] {
  const next = loadSavedQueries(projectId, databaseId).map((entry) =>
    entry.id === id ? { ...entry, favorite: !entry.favorite } : entry,
  )
  saveSavedQueries(projectId, databaseId, next)
  return next
}

// ---------------------------------------------------------------- history

export function loadHistory(projectId: string, databaseId: string): HistoryEntry[] {
  return readJson<HistoryEntry[]>(historyKey(projectId, databaseId), isHistoryList, [])
}

export function recordHistory(
  projectId: string,
  databaseId: string,
  query: PersistedQueryState,
): HistoryEntry[] {
  const existing = loadHistory(projectId, databaseId)
  // Skip when the newest entry is identical (consecutive duplicate).
  if (existing.length > 0 && JSON.stringify(existing[0].query) === JSON.stringify(query)) {
    return existing
  }
  const entry: HistoryEntry = { id: newId(), ranAt: Date.now(), query }
  const next = [entry, ...existing].slice(0, HISTORY_LIMIT)
  writeJson(historyKey(projectId, databaseId), next)
  return next
}

export function clearHistory(projectId: string, databaseId: string): void {
  removeJson(historyKey(projectId, databaseId))
}
