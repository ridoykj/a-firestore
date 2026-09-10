import { describe, expect, it } from "vitest"
import {
  buildWriteFields,
  computeDeleteFieldPaths,
  computeWritePreview,
  deepEqualJson,
  inferWireValue,
  normalizeFirestoreFields,
  normalizeWireValue,
  unwrapFirestoreFields,
  unwrapFirestoreValue,
  wrapValueWithOriginal,
  type FirestoreWireValue,
} from "../api/firestore-value-utils"

// The canonical Firestore wire format, mirroring what DocumentDtoWireFormatTest pins through the
// real HTTP stack: every node is an object with exactly one explicit kind, and integers are strings.
const BACKEND_FIELDS = JSON.parse(`{
  "aString": {"stringValue": "Ada"},
  "anInteger": {"integerValue": "42"},
  "aBigInteger": {"integerValue": "9007199254740993"},
  "aDouble": {"doubleValue": 4.5},
  "aBoolean": {"booleanValue": true},
  "aNull": {"nullValue": null},
  "aTimestamp": {"timestampValue": "2026-07-07T01:02:03.456Z"},
  "aGeoPoint": {"geoPointValue": {"latitude": 1.5, "longitude": 2.5}},
  "someBytes": {"bytesValue": "AQID"},
  "anArray": {"arrayValue": {"values": [{"stringValue": "a"}, {"integerValue": "1"}]}},
  "aMap": {"mapValue": {"fields": {"inner": {"booleanValue": true}}}}
}`)

describe("canonical wire format from the backend", () => {
  it("unwraps every kind for display", () => {
    expect(unwrapFirestoreFields(BACKEND_FIELDS)).toEqual({
      aString: "Ada",
      anInteger: 42,
      // > 2^53: stays a string so no digits are lost.
      aBigInteger: "9007199254740993",
      aDouble: 4.5,
      aBoolean: true,
      aNull: null,
      aTimestamp: "2026-07-07T01:02:03.456Z",
      aGeoPoint: { latitude: 1.5, longitude: 2.5 },
      someBytes: "AQID",
      anArray: ["a", 1],
      aMap: { inner: true },
    })
  })

  it("passes canonical wire values through unchanged", () => {
    expect(normalizeWireValue({ stringValue: "x" })).toEqual({ stringValue: "x" })
    expect(normalizeWireValue({ integerValue: "42" })).toEqual({ integerValue: "42" })
    expect(normalizeWireValue({ nullValue: null })).toEqual({ nullValue: null })
  })

  /**
   * DUP-006: the old record-component decoder keyed on generic names, so a plain map field called
   * `value`, `path`, `fields`, or `items` was silently reinterpreted as a typed Firestore value.
   * Non-canonical input is now simply not a wire value.
   */
  it("does not reinterpret non-canonical objects as typed values", () => {
    expect(normalizeWireValue({ value: "Ada" })).toBeNull()
    expect(normalizeWireValue({ path: "users/a" })).toBeNull()
    expect(normalizeWireValue({ fields: { inner: true } })).toBeNull()
    expect(normalizeWireValue({ items: [1] })).toBeNull()
    expect(normalizeWireValue({ base64: "AQID" })).toBeNull()
    expect(normalizeWireValue({ latitude: 1.5, longitude: 2.5 })).toBeNull()
    expect(normalizeWireValue({})).toBeNull()
    // Two keys is never a wire value, even when one of them is a valid kind.
    expect(normalizeWireValue({ stringValue: "x", extra: 1 })).toBeNull()
  })

  it("keeps a map field named like a legacy key as a map", () => {
    const fields = normalizeFirestoreFields({
      config: { mapValue: { fields: { value: { integerValue: "1" } } } },
    })
    expect(unwrapFirestoreFields(fields)).toEqual({ config: { value: 1 } })
  })

  it("reports an unchanged draft as no-op in the write preview", () => {
    const typedFields = normalizeFirestoreFields(BACKEND_FIELDS)
    const edited = unwrapFirestoreFields(BACKEND_FIELDS) as Record<string, unknown>
    const preview = computeWritePreview(edited, typedFields, "MERGE")
    expect(preview).toEqual({ addedFields: [], changedFields: [], deletedFields: [] })
  })
})

describe("FFP-101: unwrapFirestoreValue", () => {
  it("unwraps every scalar kind", () => {
    expect(unwrapFirestoreValue({ nullValue: null })).toBeNull()
    expect(unwrapFirestoreValue({ booleanValue: true })).toBe(true)
    expect(unwrapFirestoreValue({ integerValue: "42" })).toBe(42)
    expect(unwrapFirestoreValue({ doubleValue: 42.5 })).toBe(42.5)
    expect(unwrapFirestoreValue({ stringValue: "hello" })).toBe("hello")
    expect(unwrapFirestoreValue({ timestampValue: "2026-07-06T10:00:00Z" })).toBe(
      "2026-07-06T10:00:00Z",
    )
    expect(unwrapFirestoreValue({ referenceValue: "users/a" })).toBe("users/a")
    expect(unwrapFirestoreValue({ bytesValue: "AQID" })).toBe("AQID")
    expect(unwrapFirestoreValue({ geoPointValue: { latitude: 1, longitude: 2 } })).toEqual({
      latitude: 1,
      longitude: 2,
    })
  })

  it("keeps unsafe int64 values as strings so digits are not lost", () => {
    expect(unwrapFirestoreValue({ integerValue: "9007199254740993" })).toBe("9007199254740993")
  })

  it("unwraps arrays and maps recursively", () => {
    const wire = {
      arrayValue: {
        values: [
          { integerValue: "1" },
          { mapValue: { fields: { name: { stringValue: "a" } } } },
        ],
      },
    }
    expect(unwrapFirestoreValue(wire)).toEqual([1, { name: "a" }])
  })

  it("unwraps a document fields map", () => {
    expect(
      unwrapFirestoreFields({ age: { integerValue: "30" }, active: { booleanValue: false } }),
    ).toEqual({ age: 30, active: false })
  })
})

describe("FFP-101: wrapValueWithOriginal preserves native types", () => {
  it("keeps the integer/double distinction for edited numbers", () => {
    expect(wrapValueWithOriginal(31, { integerValue: "30" })).toEqual({ integerValue: "31" })
    expect(wrapValueWithOriginal(3, { doubleValue: 2.5 })).toEqual({ doubleValue: 3 })
  })

  it("keeps timestamps, references, bytes, and geo points when still compatible", () => {
    expect(
      wrapValueWithOriginal("2027-01-01T00:00:00Z", { timestampValue: "2026-07-06T10:00:00Z" }),
    ).toEqual({ timestampValue: "2027-01-01T00:00:00Z" })
    expect(wrapValueWithOriginal("users/b", { referenceValue: "users/a" })).toEqual({
      referenceValue: "users/b",
    })
    expect(wrapValueWithOriginal("AQID", { bytesValue: "BAUG" })).toEqual({ bytesValue: "AQID" })
    expect(
      wrapValueWithOriginal({ latitude: 3, longitude: 4 }, { geoPointValue: { latitude: 1, longitude: 2 } }),
    ).toEqual({ geoPointValue: { latitude: 3, longitude: 4 } })
  })

  it("keeps big int64 strings as integers", () => {
    expect(wrapValueWithOriginal("9007199254740993", { integerValue: "9007199254740993" })).toEqual(
      { integerValue: "9007199254740993" },
    )
  })

  it("re-infers the type when the edited shape is incompatible", () => {
    expect(wrapValueWithOriginal("not-a-date", { timestampValue: "2026-07-06T10:00:00Z" })).toEqual(
      { stringValue: "not-a-date" },
    )
    expect(wrapValueWithOriginal(true, { integerValue: "1" })).toEqual({ booleanValue: true })
  })

  it("wraps array items pairwise against the original items", () => {
    const original: FirestoreWireValue = {
      arrayValue: { values: [{ integerValue: "1" }, { doubleValue: 2.0 }] },
    }
    expect(wrapValueWithOriginal([5, 6, 7], original)).toEqual({
      arrayValue: {
        values: [{ integerValue: "5" }, { doubleValue: 6 }, { integerValue: "7" }],
      },
    })
  })

  it("wraps nested maps against the original fields", () => {
    const original: FirestoreWireValue = {
      mapValue: { fields: { created: { timestampValue: "2026-01-01T00:00:00Z" } } },
    }
    expect(wrapValueWithOriginal({ created: "2026-02-02T00:00:00Z", extra: 1 }, original)).toEqual({
      mapValue: {
        fields: {
          created: { timestampValue: "2026-02-02T00:00:00Z" },
          extra: { integerValue: "1" },
        },
      },
    })
  })

  it("infers types for brand new values", () => {
    expect(inferWireValue(1)).toEqual({ integerValue: "1" })
    expect(inferWireValue(1.5)).toEqual({ doubleValue: 1.5 })
    expect(inferWireValue(null)).toEqual({ nullValue: null })
    expect(inferWireValue([true])).toEqual({ arrayValue: { values: [{ booleanValue: true }] } })
  })

  it("builds full write field maps", () => {
    const original = { age: { integerValue: "30" } }
    expect(buildWriteFields({ age: 31, name: "a" }, original)).toEqual({
      age: { integerValue: "31" },
      name: { stringValue: "a" },
    })
  })
})

describe("FFP-103: computeDeleteFieldPaths", () => {
  const original: Record<string, FirestoreWireValue> = {
    keep: { stringValue: "x" },
    stale: { stringValue: "y" },
    profile: {
      mapValue: {
        fields: {
          avatarUrl: { stringValue: "http://old" },
          bio: { stringValue: "hi" },
        },
      },
    },
  }

  it("returns removed top-level and nested fields as dot paths", () => {
    const edited = { keep: "x", profile: { bio: "hi" } }
    expect(computeDeleteFieldPaths(original, edited).sort()).toEqual([
      "profile.avatarUrl",
      "stale",
    ])
  })

  it("returns nothing when no fields were removed", () => {
    const edited = { keep: "x", stale: "y", profile: { avatarUrl: "a", bio: "b" }, added: 1 }
    expect(computeDeleteFieldPaths(original, edited)).toEqual([])
  })

  it("rejects removed field names that dot notation cannot express", () => {
    const dotted: Record<string, FirestoreWireValue> = { "a.b": { stringValue: "x" } }
    expect(() => computeDeleteFieldPaths(dotted, {})).toThrow(/Replace mode/)
  })
})

describe("FFP-102: computeWritePreview", () => {
  const original: Record<string, FirestoreWireValue> = {
    name: { stringValue: "alice" },
    age: { integerValue: "30" },
    stale: { booleanValue: true },
  }

  it("summarizes added, changed, and deleted fields in merge mode", () => {
    const preview = computeWritePreview({ name: "alice", age: 31, extra: 1 }, original, "MERGE")
    expect(preview.addedFields).toEqual(["extra"])
    expect(preview.changedFields).toEqual(["age"])
    expect(preview.deletedFields).toEqual(["stale"])
  })

  it("lists omitted fields as deleted in replace mode", () => {
    const preview = computeWritePreview({ name: "bob" }, original, "REPLACE")
    expect(preview.changedFields).toEqual(["name"])
    expect(preview.deletedFields.sort()).toEqual(["age", "stale"])
  })
})

describe("deepEqualJson", () => {
  it("compares nested structures", () => {
    expect(deepEqualJson({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqualJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqualJson([1, 2], [2, 1])).toBe(false)
  })
})
