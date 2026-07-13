import { beforeEach, describe, expect, it } from "vitest"
import {
  HISTORY_LIMIT,
  addSavedQuery,
  clearHistory,
  loadHistory,
  loadSavedQueries,
  recordHistory,
  removeSavedQuery,
  renameSavedQuery,
  toggleSavedQueryFavorite,
} from "@/features/firestore/api/saved-queries-storage"
import type { PersistedQueryState } from "@/features/firestore/api/query-state-storage"
import { DEFAULT_WHERE_ROW } from "@/features/firestore/schemas/FirestoreSchema"

const PROJECT = "proj"
const DB = "db"

function query(path: string): PersistedQueryState {
  return {
    queryPath: path,
    whereRows: [{ ...DEFAULT_WHERE_ROW }],
    filterCombinator: "and",
    collectionGroup: false,
    orderBy: [],
    limit: 50,
  }
}

describe("saved-queries-storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("adds, lists, renames, favorites, and deletes saved queries", () => {
    let saved = addSavedQuery(PROJECT, DB, "By status", query("/users"))
    expect(saved).toHaveLength(1)
    const id = saved[0].id
    expect(saved[0].favorite).toBe(false)

    saved = renameSavedQuery(PROJECT, DB, id, "Renamed")
    expect(saved[0].name).toBe("Renamed")

    saved = toggleSavedQueryFavorite(PROJECT, DB, id)
    expect(saved[0].favorite).toBe(true)

    expect(loadSavedQueries(PROJECT, DB)).toHaveLength(1)

    saved = removeSavedQuery(PROJECT, DB, id)
    expect(saved).toHaveLength(0)
  })

  it("isolates saved queries per project/database", () => {
    addSavedQuery(PROJECT, DB, "A", query("/a"))
    expect(loadSavedQueries("other", DB)).toHaveLength(0)
  })

  it("records history newest-first, de-duplicating consecutive identical runs", () => {
    recordHistory(PROJECT, DB, query("/users"))
    recordHistory(PROJECT, DB, query("/users")) // duplicate, skipped
    recordHistory(PROJECT, DB, query("/posts"))

    const history = loadHistory(PROJECT, DB)
    expect(history).toHaveLength(2)
    expect(history[0].query.queryPath).toBe("/posts")
    expect(history[1].query.queryPath).toBe("/users")
  })

  it("bounds history to the configured limit", () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
      recordHistory(PROJECT, DB, query(`/c-${i}`))
    }
    expect(loadHistory(PROJECT, DB)).toHaveLength(HISTORY_LIMIT)
  })

  it("clears history", () => {
    recordHistory(PROJECT, DB, query("/users"))
    clearHistory(PROJECT, DB)
    expect(loadHistory(PROJECT, DB)).toHaveLength(0)
  })

  it("never persists credential-like fields", () => {
    addSavedQuery(PROJECT, DB, "A", query("/users"))
    const raw = JSON.stringify(localStorage)
    expect(raw.toLowerCase()).not.toContain("private_key")
    expect(raw.toLowerCase()).not.toContain("credential")
  })
})
