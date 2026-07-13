import { beforeEach, describe, expect, it } from "vitest"
import {
  EMPTY_COLUMN_PREFS,
  loadColumnPrefs,
  resolveColumns,
  saveColumnPrefs,
  type ColumnPrefs,
} from "@/features/firestore/api/column-prefs-storage"

describe("column-prefs-storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("round-trips prefs per tab and collection", () => {
    const prefs: ColumnPrefs = { order: ["b", "a"], hidden: ["c"], widths: { a: 300 }, pinned: ["a"] }
    saveColumnPrefs("tab1", "users", prefs)
    expect(loadColumnPrefs("tab1", "users")).toEqual(prefs)
    expect(loadColumnPrefs("tab1", "posts")).toEqual(EMPTY_COLUMN_PREFS)
  })

  it("appends unknown (new) columns at the end, visible", () => {
    const prefs: ColumnPrefs = { order: ["b", "a"], hidden: [], widths: {}, pinned: [] }
    const resolved = resolveColumns(["a", "b", "c"], prefs)
    expect(resolved.map((column) => column.name)).toEqual(["b", "a", "c"])
    expect(resolved.every((column) => !column.hidden)).toBe(true)
  })

  it("flags hidden columns and orders pinned first", () => {
    const prefs: ColumnPrefs = { order: ["a", "b", "c"], hidden: ["b"], widths: { c: 260 }, pinned: ["c"] }
    const resolved = resolveColumns(["a", "b", "c"], prefs)
    // Pinned "c" moves to the front.
    expect(resolved.map((column) => column.name)).toEqual(["c", "a", "b"])
    expect(resolved.find((column) => column.name === "b")?.hidden).toBe(true)
    expect(resolved.find((column) => column.name === "c")?.pinned).toBe(true)
    expect(resolved.find((column) => column.name === "c")?.width).toBe(260)
  })

  it("drops stale columns no longer present on the server", () => {
    const prefs: ColumnPrefs = { order: ["a", "gone"], hidden: [], widths: {}, pinned: [] }
    const resolved = resolveColumns(["a"], prefs)
    expect(resolved.map((column) => column.name)).toEqual(["a"])
  })
})
