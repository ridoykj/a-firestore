import { cn } from "@/shadcn/lib/utils"
import { Handle, Position } from "@xyflow/react"
import { memo } from "react"
import type { DataNodeData } from "./jsonToGraph"

export const DataNode = memo(({ data }: { data: DataNodeData }) => {
  return (
    <div className="max-w-[420px] overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Left} className="opacity-0" />

      <div className="max-h-80 overflow-y-auto p-2 font-mono text-sm">
        {data.items.map((item, idx) => {
          const isComplex = item.type === "object" || item.type === "array"

          return (
            <div key={idx} className="flex min-w-0 gap-2 rounded-sm px-1 leading-6 hover:bg-muted/50">
              <span className="max-w-56 shrink-0 truncate font-medium text-blue-600 dark:text-blue-400" title={item.key}>
                {item.key}
                <span className="ml-0.5 font-normal text-muted-foreground">:</span>
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  item.type === "string" && "text-emerald-600 dark:text-emerald-400",
                  item.type === "number" && "text-amber-600 dark:text-amber-400",
                  (item.type === "boolean" || item.type === "null") &&
                    "text-cyan-700 dark:text-cyan-400",
                  isComplex && "font-medium text-muted-foreground",
                )}
                title={item.type === "string" ? `"${item.value}"` : item.value}
              >
                {item.type === "string" ? `"${item.value}"` : item.value}
              </span>
            </div>
          )
        })}
      </div>

      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  )
})
