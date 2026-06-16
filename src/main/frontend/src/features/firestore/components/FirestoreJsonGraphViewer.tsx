import { useEffect, useMemo, useState } from "react"
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  MarkerType,
} from "@xyflow/react"
import type { Edge, Node } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { toPng } from "html-to-image"
import { Download, Maximize, Search, ZoomIn, ZoomOut } from "lucide-react"

import { jsonToGraph, type DataNodeData, type LogicalNodeData } from "./graph/jsonToGraph"
import { getLayoutedElements } from "./graph/layout"
import { DataNode } from "./graph/DataNode"
import { LogicalNode } from "./graph/LogicalNode"
import { Input } from "@/shadcn/components/ui/input"
import { Button } from "@/shadcn/components/ui/button"
import { useTheme } from "@/shared/components/ui/shadcn/components/theme-provider"

const nodeTypes = {
  dataNode: DataNode,
  logicalNode: LogicalNode,
}

function isDataNodeData(data: unknown): data is DataNodeData {
  if (!data || typeof data !== "object") {
    return false
  }
  return Array.isArray((data as DataNodeData).items)
}

function isLogicalNodeData(data: unknown): data is LogicalNodeData {
  if (!data || typeof data !== "object") {
    return false
  }
  return typeof (data as LogicalNodeData).label === "string"
}

function FlowComponent({ draft }: { draft: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [searchTerm, setSearchTerm] = useState("")
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const edgeOptions = useMemo(
    () => ({
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: isDark ? "#94a3b8" : "#64748b",
      },
      style: {
        strokeWidth: 1.8,
        stroke: isDark ? "#94a3b8" : "#64748b",
      },
    }),
    [isDark],
  )

  useEffect(() => {
    try {
      const parsed = JSON.parse(draft)
      const { nodes: initialNodes, edges: initialEdges } = jsonToGraph(parsed)
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges,
      )
      setNodes(layoutedNodes)
      setEdges(layoutedEdges)

      setTimeout(() => {
        fitView({ padding: 0.2 })
      }, 50)
    } catch {
      setNodes([])
      setEdges([])
    }
  }, [draft, fitView, setEdges, setNodes])

  useEffect(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          style: {
            ...(node.style ?? {}),
            opacity: 1,
          },
        })),
      )
      return
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        let matches = false

        if (node.type === "dataNode" && isDataNodeData(node.data)) {
          matches = node.data.items.some((item) => {
            const keyMatch = item.key.toLowerCase().includes(normalizedSearch)
            const valueMatch = String(item.value).toLowerCase().includes(normalizedSearch)
            return keyMatch || valueMatch
          })
        }

        if (node.type === "logicalNode" && isLogicalNodeData(node.data)) {
          matches = node.data.label.toLowerCase().includes(normalizedSearch)
        }

        return {
          ...node,
          style: {
            ...(node.style ?? {}),
            opacity: matches ? 1 : 0.25,
          },
        }
      }),
    )
  }, [searchTerm, setNodes])

  function handleDownload() {
    const viewportElement = document.querySelector(".react-flow__viewport") as HTMLElement | null
    if (!viewportElement) {
      return
    }

    void toPng(viewportElement, {
      backgroundColor: isDark ? "#0f172a" : "#f8fafc",
    }).then((dataUrl) => {
      const anchor = document.createElement("a")
      anchor.setAttribute("download", "json-graph.png")
      anchor.setAttribute("href", dataUrl)
      anchor.click()
    })
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        defaultEdgeOptions={edgeOptions}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={isDark ? "#334155" : "#cbd5e1"} gap={20} />

        <Panel position="top-right" className="flex items-center gap-2 p-3">
          <div className="flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur">
            <Search className="ml-1 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search node"
              className="h-8 w-40 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur">
            <Button variant="ghost" size="icon-xs" onClick={handleDownload} aria-label="Download graph">
              <Download />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => zoomIn()} aria-label="Zoom in">
              <ZoomIn />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => zoomOut()} aria-label="Zoom out">
              <ZoomOut />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => fitView({ padding: 0.2 })}
              aria-label="Fit graph"
            >
              <Maximize />
            </Button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}

export function FirestoreJsonGraphViewer({ draft }: { draft: string }) {
  return (
    <ReactFlowProvider>
      <FlowComponent draft={draft} />
    </ReactFlowProvider>
  )
}
