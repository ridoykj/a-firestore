import { memo, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { JsonPathSegment, JsonTreeNodeMeta, StatusMessage } from "@/dto/firestore/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shadcn/components/ui/field"
import { Input } from "@/shadcn/components/ui/input"
import { cn } from "@/shadcn/lib/utils"
import {
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  List,
  MoreHorizontal,
  PencilLine,
  Search,
  X,
} from "lucide-react"

type FirestoreJsonTreeViewerProps = {
  draft: string
  onDraftChange: (nextDraft: string) => void
  disabled?: boolean
}

type TreeEditState =
  | {
      mode: "key"
      path: string
      draft: string
      error: string
    }
  | {
      mode: "value"
      path: string
      draft: string
      error: string
    }

const ROOT_PATH = "$"
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function detectValueType(value: unknown): JsonTreeNodeMeta["valueType"] {
  if (value === null) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "array"
  }
  if (typeof value === "object") {
    return "object"
  }
  if (typeof value === "string") {
    return "string"
  }
  if (typeof value === "number") {
    return "number"
  }
  return "boolean"
}

function escapeJsonPathKey(key: string): string {
  return key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function appendObjectPath(basePath: string, key: string): string {
  if (IDENTIFIER_RE.test(key)) {
    return `${basePath}.${key}`
  }
  return `${basePath}["${escapeJsonPathKey(key)}"]`
}

function appendArrayPath(basePath: string, index: number): string {
  return `${basePath}[${index}]`
}

function buildTreeMetadata(value: unknown): Map<string, JsonTreeNodeMeta> {
  const nodes = new Map<string, JsonTreeNodeMeta>()

  function walkNode(
    currentValue: unknown,
    path: string,
    parentPath: string | null,
    depth: number,
    segments: JsonPathSegment[],
    keyLabel: string,
    rawKey: JsonPathSegment | null,
    isArrayItem: boolean,
  ) {
    const valueType = detectValueType(currentValue)
    const expandable = valueType === "object" || valueType === "array"
    const childPaths: string[] = []

    const node: JsonTreeNodeMeta = {
      path,
      parentPath,
      depth,
      segments,
      keyLabel,
      rawKey,
      isArrayItem,
      valueType,
      value: currentValue,
      expandable,
      childPaths,
    }
    nodes.set(path, node)

    if (!expandable) {
      return
    }

    if (valueType === "array") {
      const list = currentValue as unknown[]
      list.forEach((item, index) => {
        const childPath = appendArrayPath(path, index)
        childPaths.push(childPath)
        walkNode(
          item,
          childPath,
          path,
          depth + 1,
          [...segments, index],
          `[${index}]`,
          index,
          true,
        )
      })
      return
    }

    const record = currentValue as Record<string, unknown>
    for (const [key, item] of Object.entries(record)) {
      const childPath = appendObjectPath(path, key)
      childPaths.push(childPath)
      walkNode(
        item,
        childPath,
        path,
        depth + 1,
        [...segments, key],
        key,
        key,
        false,
      )
    }
  }

  walkNode(value, ROOT_PATH, null, 0, [], "$", null, false)
  return nodes
}

function updateAtSegments(
  root: unknown,
  segments: JsonPathSegment[],
  updater: (currentValue: unknown) => unknown,
): unknown {
  if (segments.length === 0) {
    return updater(root)
  }

  const [head, ...tail] = segments

  if (Array.isArray(root)) {
    if (typeof head !== "number" || head < 0 || head >= root.length) {
      throw new Error("Invalid array index.")
    }
    const next = [...root]
    next[head] = updateAtSegments(next[head], tail, updater)
    return next
  }

  if (root && typeof root === "object") {
    if (typeof head !== "string") {
      throw new Error("Invalid object key segment.")
    }
    const record = root as Record<string, unknown>
    const next: Record<string, unknown> = { ...record }
    next[head] = updateAtSegments(next[head], tail, updater)
    return next
  }

  throw new Error("Cannot update nested value on a non-container node.")
}

function renameKeyAtSegments(root: unknown, segments: JsonPathSegment[], nextKey: string): unknown {
  if (segments.length === 0) {
    throw new Error("Root key cannot be renamed.")
  }

  const previousKey = segments[segments.length - 1]
  if (typeof previousKey !== "string") {
    throw new Error("Array index labels cannot be renamed.")
  }

  const parentSegments = segments.slice(0, -1)
  return updateAtSegments(root, parentSegments, (container) => {
    if (!container || typeof container !== "object" || Array.isArray(container)) {
      throw new Error("Key renaming is supported only inside objects.")
    }

    const record = container as Record<string, unknown>
    if (!(previousKey in record)) {
      throw new Error("Original key was not found.")
    }

    const trimmedKey = nextKey.trim()
    if (!trimmedKey) {
      throw new Error("Key cannot be empty.")
    }

    if (trimmedKey !== previousKey && Object.prototype.hasOwnProperty.call(record, trimmedKey)) {
      throw new Error("A sibling key with the same name already exists.")
    }

    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      if (key === previousKey) {
        next[trimmedKey] = value
      } else {
        next[key] = value
      }
    }
    return next
  })
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeoutId)
  }, [value, delayMs])

  return debounced
}

function getNodeValuePreview(node: JsonTreeNodeMeta): string {
  if (node.valueType === "object") {
    const size = Object.keys(node.value as Record<string, unknown>).length
    return `{${size} key${size === 1 ? "" : "s"}}`
  }
  if (node.valueType === "array") {
    const size = (node.value as unknown[]).length
    return `[${size} item${size === 1 ? "" : "s"}]`
  }
  if (node.valueType === "string") {
    return JSON.stringify(node.value)
  }
  if (node.valueType === "null") {
    return "null"
  }
  return String(node.value)
}

function findAncestors(path: string, nodes: Map<string, JsonTreeNodeMeta>) {
  const ancestors: string[] = []
  let pointer = nodes.get(path)?.parentPath ?? null
  while (pointer) {
    ancestors.push(pointer)
    pointer = nodes.get(pointer)?.parentPath ?? null
  }
  return ancestors
}

function addDescendants(path: string, nodes: Map<string, JsonTreeNodeMeta>, target: Set<string>) {
  target.add(path)
  const node = nodes.get(path)
  if (!node || !node.expandable) {
    return
  }
  node.childPaths.forEach((childPath) => addDescendants(childPath, nodes, target))
}

function isEditPathActive(editingState: TreeEditState | null, path: string, mode: "key" | "value") {
  return !!editingState && editingState.path === path && editingState.mode === mode
}

type JsonTreeRowProps = {
  node: JsonTreeNodeMeta
  expanded: boolean
  isMatched: boolean
  disableActions: boolean
  editingKey: boolean
  editingValue: boolean
  keyDraft: string
  valueDraft: string
  inlineError: string
  searchTerm: string
  onToggle: (path: string) => void
  onStartEditKey: (path: string) => void
  onStartEditValue: (path: string) => void
  onEditDraftChange: (value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onCopyPath: (path: string) => void
  onCopyValue: (path: string) => void
}

function HighlightedText({
  text,
  query,
  className,
}: {
  text: string
  query: string
  className?: string
}) {
  if (!query) {
    return <span className={className}>{text}</span>
  }

  const source = text
  const sourceLower = source.toLowerCase()
  const queryLower = query.toLowerCase()
  const chunks: Array<{ value: string; highlighted: boolean }> = []
  let index = 0

  while (index < source.length) {
    const nextIndex = sourceLower.indexOf(queryLower, index)
    if (nextIndex === -1) {
      chunks.push({ value: source.slice(index), highlighted: false })
      break
    }

    if (nextIndex > index) {
      chunks.push({ value: source.slice(index, nextIndex), highlighted: false })
    }

    chunks.push({
      value: source.slice(nextIndex, nextIndex + query.length),
      highlighted: true,
    })
    index = nextIndex + query.length
  }

  return (
    <span className={className}>
      {chunks.map((chunk, idx) =>
        chunk.highlighted ? (
          <mark key={`${chunk.value}-${idx}`} className="rounded-xs bg-accent px-0.5 text-accent-foreground">
            {chunk.value}
          </mark>
        ) : (
          <span key={`${chunk.value}-${idx}`}>{chunk.value}</span>
        ),
      )}
    </span>
  )
}

const JsonTreeRow = memo(function JsonTreeRow({
  node,
  expanded,
  isMatched,
  disableActions,
  editingKey,
  editingValue,
  keyDraft,
  valueDraft,
  inlineError,
  searchTerm,
  onToggle,
  onStartEditKey,
  onStartEditValue,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onCopyPath,
  onCopyValue,
}: JsonTreeRowProps) {
  const rowPaddingStyle = { paddingInlineStart: `${node.depth * 14 + 8}px` }
  const valuePreview = getNodeValuePreview(node)
  const canEditKey = !node.isArrayItem && node.path !== ROOT_PATH

  return (
    <div className="grid gap-2">
      <div
        className={cn(
          "group/tree-row flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background/80 px-2 py-1 text-xs",
          node.expandable && !disableActions && "cursor-pointer",
          isMatched && "ring-1 ring-accent",
        )}
        style={rowPaddingStyle}
        role={node.expandable ? "button" : undefined}
        tabIndex={node.expandable ? 0 : -1}
        onClick={() => {
          if (node.expandable && !disableActions) {
            onToggle(node.path)
          }
        }}
        onKeyDown={(event) => {
          if (!node.expandable || disableActions) {
            return
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            onToggle(node.path)
          }
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {node.expandable ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              disabled={disableActions}
              onClick={(event) => {
                event.stopPropagation()
                onToggle(node.path)
              }}
              aria-label={expanded ? "Collapse node" : "Expand node"}
            >
              {expanded ? (
                <ChevronDown data-icon="inline-start" />
              ) : (
                <ChevronRight data-icon="inline-start" />
              )}
            </Button>
          ) : (
            <span className="inline-flex size-6 items-center justify-center text-muted-foreground">*</span>
          )}

          <HighlightedText
            query={searchTerm}
            text={node.keyLabel}
            className="truncate font-medium text-foreground"
          />
          <span className="text-muted-foreground">:</span>
          <HighlightedText
            query={searchTerm}
            text={valuePreview}
            className={cn(
              "truncate",
              node.valueType === "string" && "text-primary",
              node.valueType === "number" && "text-chart-2",
              node.valueType === "boolean" && "text-chart-4",
              node.valueType === "null" && "text-muted-foreground italic",
              (node.valueType === "object" || node.valueType === "array") && "text-muted-foreground",
            )}
          />
        </div>

        <Badge variant="secondary">{node.valueType}</Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              disabled={disableActions}
              aria-label={`Open actions for ${node.path}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal data-icon="inline-start" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => onCopyPath(node.path)}>
                <Copy />
                Copy Path
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopyValue(node.path)}>
                <Copy />
                Copy Value
              </DropdownMenuItem>
              {canEditKey ? (
                <DropdownMenuItem onSelect={() => onStartEditKey(node.path)}>
                  <PencilLine />
                  Edit Key
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => onStartEditValue(node.path)}>
                <PencilLine />
                Edit Value
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editingKey ? (
        <div className="rounded-md border border-border bg-card p-2" style={rowPaddingStyle}>
          <Field data-invalid={!!inlineError}>
            <FieldLabel>Rename key</FieldLabel>
            <Input
              value={keyDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              aria-invalid={!!inlineError}
              disabled={disableActions}
              placeholder="new_key"
              className="font-mono text-xs"
            />
            <FieldDescription>Object keys must be unique within the same parent object.</FieldDescription>
            {inlineError ? <FieldError>{inlineError}</FieldError> : null}
          </Field>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="xs" onClick={onSaveEdit} disabled={disableActions}>
              <Check data-icon="inline-start" />
              Save
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={onCancelEdit} disabled={disableActions}>
              <X data-icon="inline-start" />
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {editingValue ? (
        <div className="rounded-md border border-border bg-card p-2" style={rowPaddingStyle}>
          <Field data-invalid={!!inlineError}>
            <FieldLabel>Edit value (JSON literal)</FieldLabel>
            <Input
              value={valueDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              aria-invalid={!!inlineError}
              disabled={disableActions}
              placeholder='"text", 123, true, null, {}, []'
              className="font-mono text-xs"
            />
            <FieldDescription>Save commits this node change into the JSON draft.</FieldDescription>
            {inlineError ? <FieldError>{inlineError}</FieldError> : null}
          </Field>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="xs" onClick={onSaveEdit} disabled={disableActions}>
              <Check data-icon="inline-start" />
              Save
            </Button>
            <Button type="button" size="xs" variant="outline" onClick={onCancelEdit} disabled={disableActions}>
              <X data-icon="inline-start" />
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
})

export function FirestoreJsonTreeViewer({
  draft,
  onDraftChange,
  disabled = false,
}: FirestoreJsonTreeViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollTopRef = useRef<number | null>(null)

  const [searchText, setSearchText] = useState("")
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([ROOT_PATH]))
  const [editingState, setEditingState] = useState<TreeEditState | null>(null)
  const [treeStatus, setTreeStatus] = useState<StatusMessage | null>(null)
  const debouncedSearch = useDebouncedValue(searchText.trim(), 180)

  useEffect(() => {
    if (pendingScrollTopRef.current === null || !scrollContainerRef.current) {
      return
    }
    scrollContainerRef.current.scrollTop = pendingScrollTopRef.current
    pendingScrollTopRef.current = null
  }, [draft])

  const parsedJson = useMemo(() => {
    try {
      const data: unknown = JSON.parse(draft)
      return { data, parseError: "" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON."
      return { data: null as unknown, parseError: message }
    }
  }, [draft])

  const treeNodes = useMemo(() => {
    if (parsedJson.parseError) {
      return new Map<string, JsonTreeNodeMeta>()
    }
    return buildTreeMetadata(parsedJson.data)
  }, [parsedJson])

  const matchSummary = useMemo(() => {
    const matchedPaths = new Set<string>()
    const includedPaths = new Set<string>()
    const autoExpandedPaths = new Set<string>()

    if (!debouncedSearch) {
      return {
        matchedPaths,
        includedPaths: null as Set<string> | null,
        autoExpandedPaths,
      }
    }

    const query = debouncedSearch.toLowerCase()

    treeNodes.forEach((node) => {
      const keyText = node.rawKey === null ? "$" : String(node.rawKey)
      const valueText = getNodeValuePreview(node)
      const isMatch =
        keyText.toLowerCase().includes(query) || valueText.toLowerCase().includes(query)

      if (!isMatch) {
        return
      }

      matchedPaths.add(node.path)
      includedPaths.add(node.path)
      findAncestors(node.path, treeNodes).forEach((ancestorPath) => {
        includedPaths.add(ancestorPath)
        autoExpandedPaths.add(ancestorPath)
      })

      if (node.expandable) {
        autoExpandedPaths.add(node.path)
        addDescendants(node.path, treeNodes, includedPaths)
      }
    })

    if (matchedPaths.size === 0) {
      includedPaths.add(ROOT_PATH)
    }

    return { matchedPaths, includedPaths, autoExpandedPaths }
  }, [debouncedSearch, treeNodes])

  const effectiveExpandedPaths = useMemo(() => {
    if (!debouncedSearch) {
      return expandedPaths
    }
    const combined = new Set(expandedPaths)
    matchSummary.autoExpandedPaths.forEach((path) => combined.add(path))
    return combined
  }, [debouncedSearch, expandedPaths, matchSummary.autoExpandedPaths])

  function persistDraft(nextValue: unknown, successMessage: string) {
    if (scrollContainerRef.current) {
      pendingScrollTopRef.current = scrollContainerRef.current.scrollTop
    }

    const nextDraft = JSON.stringify(nextValue, null, 2)
    onDraftChange(nextDraft)
    setTreeStatus({ tone: "success", message: successMessage })
  }

  async function copyToClipboard(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
    } catch {
      toast.error("Copy failed. Clipboard permission is not available.")
    }
  }

  function toggleNode(path: string) {
    if (disabled) {
      return
    }
    const node = treeNodes.get(path)
    if (!node || !node.expandable) {
      return
    }

    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function handleExpandAll() {
    if (disabled) {
      return
    }
    const next = new Set<string>()
    treeNodes.forEach((node) => {
      if (node.expandable) {
        next.add(node.path)
      }
    })
    setExpandedPaths(next)
  }

  function handleCollapseAll() {
    if (disabled) {
      return
    }
    setExpandedPaths(new Set([ROOT_PATH]))
  }

  function startEditKey(path: string) {
    if (disabled) {
      return
    }

    const node = treeNodes.get(path)
    if (!node || typeof node.rawKey !== "string" || node.isArrayItem || node.path === ROOT_PATH) {
      return
    }

    setEditingState({
      mode: "key",
      path,
      draft: node.rawKey,
      error: "",
    })
    setTreeStatus(null)
  }

  function startEditValue(path: string) {
    if (disabled) {
      return
    }

    const node = treeNodes.get(path)
    if (!node) {
      return
    }

    const draftValue =
      node.valueType === "object" || node.valueType === "array"
        ? JSON.stringify(node.value, null, 2)
        : JSON.stringify(node.value)

    setEditingState({
      mode: "value",
      path,
      draft: draftValue ?? "null",
      error: "",
    })
    setTreeStatus(null)
  }

  function updateEditDraft(value: string) {
    setEditingState((prev) => {
      if (!prev) {
        return prev
      }
      return { ...prev, draft: value, error: "" }
    })
  }

  function cancelEdit() {
    setEditingState(null)
  }

  function saveEdit() {
    if (!editingState || disabled || parsedJson.parseError) {
      return
    }

    const node = treeNodes.get(editingState.path)
    if (!node) {
      setEditingState((prev) =>
        prev
          ? {
              ...prev,
              error: "Node is no longer available.",
            }
          : prev,
      )
      return
    }

    try {
      if (editingState.mode === "key") {
        const nextKey = editingState.draft.trim()
        const nextValue = renameKeyAtSegments(parsedJson.data, node.segments, nextKey)
        persistDraft(nextValue, "Key renamed successfully.")
        setEditingState(null)
        return
      }

      const nextNodeValue: unknown = JSON.parse(editingState.draft)
      const nextValue = updateAtSegments(parsedJson.data, node.segments, () => nextNodeValue)
      persistDraft(nextValue, "Value updated successfully.")
      setEditingState(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid edit."
      setEditingState((prev) => (prev ? { ...prev, error: message } : prev))
      setTreeStatus({ tone: "error", message })
    }
  }

  function copyPath(path: string) {
    const node = treeNodes.get(path)
    if (!node) {
      return
    }
    void copyToClipboard(node.path, "JSONPath copied.")
  }

  function copyValue(path: string) {
    const node = treeNodes.get(path)
    if (!node) {
      return
    }
    const serializedValue = JSON.stringify(node.value, null, 2)
    void copyToClipboard(serializedValue ?? "null", "JSON value copied.")
  }

  function renderNode(path: string) {
    const node = treeNodes.get(path)
    if (!node) {
      return null
    }

    const includedPaths = matchSummary.includedPaths
    if (includedPaths && !includedPaths.has(node.path)) {
      return null
    }

    const isExpanded = node.expandable ? effectiveExpandedPaths.has(node.path) : false
    const editingKey = isEditPathActive(editingState, node.path, "key")
    const editingValue = isEditPathActive(editingState, node.path, "value")
    const editDraft = editingState?.path === node.path ? editingState.draft : ""
    const inlineError = editingState?.path === node.path ? editingState.error : ""
    const isMatched = matchSummary.matchedPaths.has(node.path)

    return (
      <div key={node.path} className="grid gap-2">
        <JsonTreeRow
          node={node}
          expanded={isExpanded}
          isMatched={isMatched}
          disableActions={disabled}
          editingKey={editingKey}
          editingValue={editingValue}
          keyDraft={editingKey ? editDraft : ""}
          valueDraft={editingValue ? editDraft : ""}
          inlineError={inlineError}
          searchTerm={debouncedSearch}
          onToggle={toggleNode}
          onStartEditKey={startEditKey}
          onStartEditValue={startEditValue}
          onEditDraftChange={updateEditDraft}
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
          onCopyPath={copyPath}
          onCopyValue={copyValue}
        />

        {node.expandable && isExpanded ? (
          <div className="grid gap-2">
            {node.childPaths.map((childPath) => renderNode(childPath))}
          </div>
        ) : null}
      </div>
    )
  }

  if (parsedJson.parseError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Tree View Unavailable</AlertTitle>
        <AlertDescription>
          {`Current JSON draft is invalid: ${parsedJson.parseError}`}
        </AlertDescription>
      </Alert>
    )
  }

  const rootNode = treeNodes.get(ROOT_PATH)
  if (!rootNode) {
    return (
      <Alert>
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>There is no JSON data to render in tree view.</AlertDescription>
      </Alert>
    )
  }

  const searchHasNoMatches =
    !!debouncedSearch && matchSummary.matchedPaths.size === 0 && matchSummary.includedPaths !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="xs" variant="outline" onClick={handleExpandAll} disabled={disabled}>
          <Braces data-icon="inline-start" />
          Expand All
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={handleCollapseAll} disabled={disabled}>
          <List data-icon="inline-start" />
          Collapse All
        </Button>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search keys or values..."
            className="pl-8"
            disabled={disabled}
          />
        </div>
      </div>

      {treeStatus ? (
        <Alert variant={treeStatus.tone === "error" ? "destructive" : "default"}>
          <AlertTitle>
            {treeStatus.tone === "success"
              ? "Updated"
              : treeStatus.tone === "warning"
                ? "Needs Attention"
                : "Edit Failed"}
          </AlertTitle>
          <AlertDescription>{treeStatus.message}</AlertDescription>
        </Alert>
      ) : null}

      {searchHasNoMatches ? (
        <Alert>
          <AlertTitle>No Matches</AlertTitle>
          <AlertDescription>Try another search term for keys or values.</AlertDescription>
        </Alert>
      ) : null}

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-auto rounded-md border bg-card p-2">
        <FieldGroup>
          {renderNode(ROOT_PATH)}
        </FieldGroup>
      </div>
    </div>
  )
}

