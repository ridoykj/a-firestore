import { describe, expect, it } from "vitest"
import {
  deriveRules,
  hasTypeConflict,
  profileSample,
  validateFields,
} from "@/features/firestore/api/schema-profiler"
import type { FirestoreWireValue } from "@/features/firestore/api/firestore-value-utils"

const s = (v: string): FirestoreWireValue => ({ stringValue: v })
const i = (v: number): FirestoreWireValue => ({ integerValue: String(v) })
const nul = (): FirestoreWireValue => ({ nullValue: null })

describe("schema-profiler", () => {
  const sample: Array<Record<string, FirestoreWireValue>> = [
    { name: s("a"), age: i(1), nick: s("x") },
    { name: s("b"), age: i(2), nick: nul() },
    { name: s("c"), age: s("oops") }, // age type conflict; nick absent
  ]

  it("profiles field frequency, types, and nullability", () => {
    const profile = profileSample(sample)
    expect(profile.sampled).toBe(3)

    const name = profile.fields.find((f) => f.path === "name")!
    expect(name.presentCount).toBe(3)
    expect(name.types).toEqual({ string: 3 })

    const age = profile.fields.find((f) => f.path === "age")!
    expect(age.presentCount).toBe(3)
    expect(age.types).toEqual({ integer: 2, string: 1 })
    expect(hasTypeConflict(age)).toBe(true)

    const nick = profile.fields.find((f) => f.path === "nick")!
    expect(nick.presentCount).toBe(2)
    expect(nick.nullCount).toBe(1)
    expect(nick.types).toEqual({ string: 1 })
  })

  it("derives conservative rules (required when always present, type when unambiguous)", () => {
    const rules = deriveRules(profileSample(sample))
    expect(rules.requiredPaths.sort()).toEqual(["age", "name"])
    expect(rules.expectedTypes.name).toBe("string")
    // age is ambiguous → no expected type
    expect(rules.expectedTypes.age).toBeUndefined()
  })

  it("validates missing required fields and unexpected types", () => {
    const rules = { requiredPaths: ["name", "age"], expectedTypes: { name: "string" as const } }

    expect(validateFields({ name: s("ok"), age: i(3) }, rules)).toEqual([])

    const missing = validateFields({ age: i(3) }, rules)
    expect(missing).toHaveLength(1)
    expect(missing[0].kind).toBe("missing-required")

    const wrongType = validateFields({ name: i(3), age: i(3) }, rules)
    expect(wrongType.find((issue) => issue.kind === "unexpected-type")?.path).toBe("name")
  })
})
