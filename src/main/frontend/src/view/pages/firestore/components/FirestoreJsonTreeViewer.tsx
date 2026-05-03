import { memo, useMemo, useState } from "react"
import type { JsonPathSegment, JsonTreeNodeMeta } from "@/dto/firestore/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Button } from "@/shadcn/components/ui/button"
import { cn } from "@/shadcn/lib/utils"

type FirestoreJsonTreeViewerProps = {
  draft: string
}

const ROOT_PATH = "$"

function detectValueType(value: unknown): JsonTreeNodeMeta["valueType"] {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "object") return "object"
  if (typeof value === "string") return "string"
  if (typeof value === "number") return "number"
  return "boolean"
}

function appendObjectPath(basePath: string, key: string): string {
  return `${basePath}["${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`
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

    if (!expandable) return

    if (valueType === "array") {
      const list = currentValue as unknown[]
      list.forEach((item, index) => {
        const childPath = appendArrayPath(path, index)
        childPaths.push(childPath)
        walkNode(item, childPath, path, depth + 1, [...segments, index], String(index), index, true)
      })
      return
    }

    const record = currentValue as Record<string, unknown>
    for (const [key, item] of Object.entries(record)) {
      const childPath = appendObjectPath(path, key)
      childPaths.push(childPath)
      walkNode(item, childPath, path, depth + 1, [...segments, key], key, key, false)
    }
  }

  walkNode(value, ROOT_PATH, null, 0, [], "root", null, false)
  return nodes
}

function getNodeValuePreview(node: JsonTreeNodeMeta): string {
  if (node.valueType === "object") {
    const size = Object.keys(node.value as Record<string, unknown>).length
    return `{ Object{${size}} }`
  }
  if (node.valueType === "array") {
    const size = (node.value as unknown[]).length
    return `[ Array(${size}) ]`
  }
  if (node.valueType === "string") {
    return JSON.stringify(node.value)
  }
  if (node.valueType === "null") {
    return "null"
  }
  return String(node.value)
}

function TriangleIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn(
        "inline-block size-3 transition-transform",
        expanded ? "rotate-90" : "rotate-0",
        className
      )}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

const JsonTreeRow = memo(function JsonTreeRow({
  node,
  expanded,
  onToggle,
  isLastInParent,
}: {
  node: JsonTreeNodeMeta
  expanded: boolean
  onToggle: (path: string) => void
  isLastInParent: boolean
}) {
  const rowPaddingStyle = { paddingInlineStart: `${node.depth * 16}px` }
  const isRoot = node.path === ROOT_PATH

  const keyColorClass = "text-red-500 dark:text-red-400"
  
  // Format the key
  const formattedKey = node.isArrayItem 
    ? node.keyLabel 
    : `"${node.keyLabel}"`

  // Format the value
  let valueDisplay: React.ReactNode;
  if (node.expandable) {
    if (!expanded) {
      valueDisplay = <span className="text-muted-foreground">{getNodeValuePreview(node)}</span>
    } else {
      valueDisplay = <span className="text-foreground">{node.valueType === 'array' ? '[' : '{'}</span>
    }
  } else {
    const valuePreview = getNodeValuePreview(node)
    const valueClass = cn(
      node.valueType === "string" && "text-green-600 dark:text-green-400",
      node.valueType === "number" && "text-blue-500 dark:text-blue-400",
      node.valueType === "boolean" && "text-foreground font-medium",
      node.valueType === "null" && "text-foreground font-medium",
    )
    valueDisplay = <span className={valueClass}>{valuePreview}</span>
  }

  return (
    <div className="font-mono text-sm leading-6">
      <div
        className="flex items-center"
        style={rowPaddingStyle}
      >
        <div 
          className="flex items-center min-w-0"
          role={node.expandable ? "button" : undefined}
          tabIndex={node.expandable ? 0 : -1}
          onClick={() => node.expandable && onToggle(node.path)}
          onKeyDown={(e) => {
            if (node.expandable && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault()
              onToggle(node.path)
            }
          }}
        >
          {node.expandable ? (
            <div className="w-4 h-6 flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground">
              <TriangleIcon expanded={expanded} />
            </div>
          ) : (
            <div className="w-4 h-6" /> // spacer
          )}

          <span className={cn(keyColorClass, "mr-1")}>{formattedKey}</span>
          <span className="text-muted-foreground mr-1">:</span>
          {valueDisplay}
          {!node.expandable && !isLastInParent && !isRoot && <span className="text-foreground">,</span>}
        </div>
      </div>
    </div>
  )
})

export function FirestoreJsonTreeViewer({ draft }: FirestoreJsonTreeViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set([ROOT_PATH]))

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
    if (parsedJson.parseError) return new Map<string, JsonTreeNodeMeta>()
    return buildTreeMetadata(parsedJson.data)
  }, [parsedJson])

  function toggleNode(path: string) {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function handleExpandAll() {
    const next = new Set<string>()
    treeNodes.forEach((node) => {
      if (node.expandable) next.add(node.path)
    })
    setExpandedPaths(next)
  }

  function handleCollapseAll() {
    setExpandedPaths(new Set([ROOT_PATH]))
  }

  function renderNode(path: string, isLastInParent: boolean = true) {
    const node = treeNodes.get(path)
    if (!node) return null

    const isExpanded = node.expandable ? expandedPaths.has(node.path) : false

    return (
      <div key={node.path}>
        <JsonTreeRow
          node={node}
          expanded={isExpanded}
          onToggle={toggleNode}
          isLastInParent={isLastInParent}
        />
        {node.expandable && isExpanded && (
          <>
            <div>
              {node.childPaths.map((childPath, index) => 
                renderNode(childPath, index === node.childPaths.length - 1)
              )}
            </div>
            <div 
              className="font-mono text-sm leading-6 flex items-center" 
              style={{ paddingInlineStart: `${node.depth * 16 + 16}px` }}
            >
              <span className="text-foreground">{node.valueType === 'array' ? ']' : '}'}</span>
              {!isLastInParent && node.path !== ROOT_PATH && <span className="text-foreground">,</span>}
            </div>
          </>
        )}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pb-3">
        <h3 className="font-semibold text-sm">Tree View</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="secondary" className="h-8 text-xs bg-muted/50" onClick={handleExpandAll}>
            Expand All
          </Button>
          <Button type="button" size="sm" variant="secondary" className="h-8 text-xs bg-muted/50" onClick={handleCollapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/30 p-4 border">
        {renderNode(ROOT_PATH)}
      </div>
    </div>
  )
}

