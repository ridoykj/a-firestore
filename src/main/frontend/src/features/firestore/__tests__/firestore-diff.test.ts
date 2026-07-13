import { describe, expect, it } from "vitest"
import {
  diffCollectionSamples,
  diffTypedFields,
  flattenTypedFields,
} from "@/features/firestore/api/firestore-diff"
import type { FirestoreWireValue } from "@/features/firestore/api/firestore-value-utils"

const s = (v: string): FirestoreWireValue => ({ stringValue: v })
const i = (v: number): FirestoreWireValue => ({ integerValue: String(v) })
const d = (v: number): FirestoreWireValue => ({ doubleValue: v })

describe("firestore-diff", () => {
  it("flattens nested maps into dot paths", () => {
    const leaves = flattenTypedFields({
      name: s("alice"),
      profile: { mapValue: { fields: { age: i(30), city: s("NYC") } } },
    })
    expect([...leaves.keys()].sort()).toEqual(["name", "profile.age", "profile.city"])
    expect(leaves.get("profile.age")).toEqual({ value: 30, type: "integer" })
  })

  it("reports added, removed, and changed leaves", () => {
    const left = { name: s("alice"), age: i(30), city: s("NYC") }
    const right = { name: s("alice"), age: i(31), country: s("US") }
    const result = diffTypedFields(left, right)

    expect(result.unchanged).toBe(1) // name
    expect(result.entries.find((e) => e.path === "age")?.status).toBe("changed")
    expect(result.entries.find((e) => e.path === "city")?.status).toBe("removed")
    expect(result.entries.find((e) => e.path === "country")?.status).toBe("added")
    expect(result.added).toBe(1)
    expect(result.removed).toBe(1)
    expect(result.changed).toBe(1)
  })

  it("treats an integer→double change as a type change even with equal numeric value", () => {
    const result = diffTypedFields({ score: i(5) }, { score: d(5) })
    const entry = result.entries.find((e) => e.path === "score")
    expect(entry?.status).toBe("changed")
    expect(entry?.leftType).toBe("integer")
    expect(entry?.rightType).toBe("double")
  })

  it("compares collection samples by field schema", () => {
    const left: Array<Record<string, FirestoreWireValue>> = [{ name: s("a"), age: i(1) }, { name: s("b") }]
    const right: Array<Record<string, FirestoreWireValue>> = [{ name: s("c"), email: s("x@y.z") }]
    const result = diffCollectionSamples(left, right)

    expect(result.entries.find((e) => e.path === "age")?.status).toBe("removed")
    expect(result.entries.find((e) => e.path === "email")?.status).toBe("added")
    expect(result.entries.find((e) => e.path === "name")).toBeUndefined() // present both sides
  })
})
