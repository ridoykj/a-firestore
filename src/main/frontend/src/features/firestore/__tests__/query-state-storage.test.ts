import { beforeEach, describe, expect, it } from "vitest"
import {
  loadQueryState,
  saveQueryState,
  clearQueryState,
  type PersistedQueryState,
} from "@/features/firestore/api/query-state-storage"
import { DEFAULT_WHERE_ROW } from "@/features/firestore/schemas/FirestoreSchema"

const SAMPLE: PersistedQueryState = {
  queryPath: "/users",
  whereRows: [{ ...DEFAULT_WHERE_ROW, id: 1, field: "status", value: "active", groupId: 0 }],
  filterCombinator: "and",
  collectionGroup: false,
  orderBy: [{ field: "createdAt", direction: "desc" }],
  limit: 25,
}

describe("query-state-storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("round-trips per-tab query state", () => {
    saveQueryState("proj:db", SAMPLE)
    expect(loadQueryState("proj:db")).toEqual(SAMPLE)
  })

  it("keeps state isolated per tab id", () => {
    saveQueryState("proj:db", SAMPLE)
    expect(loadQueryState("other:db")).toBeNull()
  })

  it("returns null for an empty tab id", () => {
    expect(loadQueryState("")).toBeNull()
  })

  it("clears a tab's query state", () => {
    saveQueryState("proj:db", SAMPLE)
    clearQueryState("proj:db")
    expect(loadQueryState("proj:db")).toBeNull()
  })

  it("rejects a malformed stored payload", () => {
    localStorage.setItem("a-firestore.tab.proj:db.query.v1", JSON.stringify({ queryPath: 5 }))
    expect(loadQueryState("proj:db")).toBeNull()
  })

  it("never contains credential-like fields", () => {
    saveQueryState("proj:db", SAMPLE)
    const raw = localStorage.getItem("a-firestore.tab.proj:db.query.v1") ?? ""
    expect(raw.toLowerCase()).not.toContain("credential")
    expect(raw.toLowerCase()).not.toContain("private_key")
    expect(raw.toLowerCase()).not.toContain("service_account")
  })
})
