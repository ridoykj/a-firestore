import { describe, expect, it } from "vitest"
import { eventToShortcut, isEditableTarget } from "@/shared/lib/keyboard"

describe("keyboard helpers", () => {
  describe("isEditableTarget", () => {
    it("returns false for a plain element", () => {
      const div = document.createElement("div")
      expect(isEditableTarget(div)).toBe(false)
    })

    it("returns true for inputs, textareas, and selects", () => {
      expect(isEditableTarget(document.createElement("input"))).toBe(true)
      expect(isEditableTarget(document.createElement("textarea"))).toBe(true)
      expect(isEditableTarget(document.createElement("select"))).toBe(true)
    })

    it("returns true inside a Monaco editor container", () => {
      const editor = document.createElement("div")
      editor.className = "monaco-editor"
      const inner = document.createElement("span")
      editor.appendChild(inner)
      expect(isEditableTarget(inner)).toBe(true)
    })

    it("returns false for null", () => {
      expect(isEditableTarget(null)).toBe(false)
    })
  })

  describe("eventToShortcut", () => {
    it("maps ctrl/meta to mod", () => {
      expect(eventToShortcut(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))).toBe("mod+k")
      expect(eventToShortcut(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }))).toBe(
        "mod+enter",
      )
    })

    it("includes shift and alt modifiers", () => {
      expect(eventToShortcut(new KeyboardEvent("keydown", { key: "A", shiftKey: true }))).toBe(
        "shift+a",
      )
      expect(
        eventToShortcut(new KeyboardEvent("keydown", { key: "p", altKey: true, ctrlKey: true })),
      ).toBe("mod+alt+p")
    })
  })
})
