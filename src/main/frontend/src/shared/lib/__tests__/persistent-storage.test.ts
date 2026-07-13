import { beforeEach, describe, expect, it } from "vitest"
import { readJson, writeJson, removeJson } from "@/shared/lib/persistent-storage"

type Sample = { name: string; count: number }

function isSample(value: unknown): value is Sample {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).name === "string" &&
    typeof (value as Record<string, unknown>).count === "number"
  )
}

describe("persistent-storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("round-trips a valid value", () => {
    const fallback: Sample = { name: "", count: 0 }
    writeJson("test.key", { name: "alpha", count: 3 })
    expect(readJson("test.key", isSample, fallback)).toEqual({ name: "alpha", count: 3 })
  })

  it("returns the fallback when the key is missing", () => {
    const fallback: Sample = { name: "default", count: -1 }
    expect(readJson("missing.key", isSample, fallback)).toBe(fallback)
  })

  it("returns the fallback when the stored JSON is corrupt", () => {
    const fallback: Sample = { name: "default", count: -1 }
    localStorage.setItem("corrupt.key", "{ not json")
    expect(readJson("corrupt.key", isSample, fallback)).toBe(fallback)
  })

  it("returns the fallback when the stored value fails the guard", () => {
    const fallback: Sample = { name: "default", count: -1 }
    writeJson("wrong.shape", { name: "alpha" }) // missing count
    expect(readJson("wrong.shape", isSample, fallback)).toBe(fallback)
  })

  it("removes a key", () => {
    const fallback: Sample = { name: "default", count: -1 }
    writeJson("test.key", { name: "alpha", count: 3 })
    removeJson("test.key")
    expect(readJson("test.key", isSample, fallback)).toBe(fallback)
  })
})
