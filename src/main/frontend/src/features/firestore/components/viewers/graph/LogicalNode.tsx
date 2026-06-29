import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { LogicalNodeData } from "./jsonToGraph"
import { Link2 } from "lucide-react"

export const LogicalNode = memo(({ data }: { data: LogicalNodeData }) => {
  return (
    <div className="flex max-w-[420px] items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 font-mono text-sm text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Left} className="opacity-0" />

      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate font-medium text-blue-600 dark:text-blue-400" title={data.label}>
          {data.label}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {data.type === "array" ? `[${data.size}]` : `{${data.size}}`}
        </span>
      </div>

      <div className="shrink-0 rounded border bg-muted/40 p-1 text-muted-foreground">
        <Link2 className="size-3" />
      </div>

      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
})
