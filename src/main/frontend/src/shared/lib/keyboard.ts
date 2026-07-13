/**
 * FFP-206: keyboard helpers shared by the global shortcut dispatcher.
 */

/** True when the event target is a text input, textarea, select, or contenteditable (e.g. Monaco). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor") !== null
}

/**
 * Normalizes a keyboard event to a shortcut string like "mod+enter" or "mod+k".
 * "mod" is Cmd on macOS and Ctrl elsewhere.
 */
export function eventToShortcut(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) {
    parts.push("mod")
  }
  if (event.altKey) {
    parts.push("alt")
  }
  if (event.shiftKey) {
    parts.push("shift")
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()
  parts.push(key)
  return parts.join("+")
}
