import type { OrderDirection, WhereRow, WhereType } from "@/features/firestore/schemas/FirestoreSchema"
import { ChevronRight, Play, Plus, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { cn } from "@/shadcn/lib/utils"

const WHERE_OPERATORS = ["==", "!=", ">", ">=", "<", "<=", "array-contains", "array-contains-any", "in", "not-in"] as const

const WHERE_TYPES: { value: WhereType; label: string }[] = [
  { value: "string", label: "string" },
  { value: "number", label: "number" },
  { value: "boolean", label: "boolean" },
  { value: "null", label: "null" },
  { value: "string-array", label: "string[]" },
  { value: "number-array", label: "number[]" },
  { value: "timestamp", label: "timestamp" },
]

type FirestoreFilterPanelProps = {
  rightSidebarExpanded: boolean
  onToggle: () => void
  whereRows: WhereRow[]
  addWhereFilterRow: () => void
  removeWhereFilterRow: (id: number) => void
  setWhereRowValue: (id: number, key: "field" | "operator" | "value" | "type", value: string) => void
  orderField: string
  setOrderField: (value: string) => void
  orderDirection: OrderDirection
  setOrderDirection: (value: OrderDirection) => void
  limit: number
  setLimit: (value: number) => void
  onRun: () => void
  drawerMode?: boolean
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}

export function FirestoreFilterPanel({
  rightSidebarExpanded,
  onToggle,
  whereRows,
  addWhereFilterRow,
  removeWhereFilterRow,
  setWhereRowValue,
  orderField,
  setOrderField,
  orderDirection,
  setOrderDirection,
  limit,
  setLimit,
  onRun,
  drawerMode = false,
  drawerOpen = false,
  onDrawerOpenChange,
}: FirestoreFilterPanelProps) {
  const panelBody = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto px-5 pb-5 pt-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Where Filters</span>
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded">AND Logic</span>
          </div>

          {whereRows.length === 0 ? (
            <div className="p-4 border border-dashed border-border rounded-xl text-center text-muted-foreground text-xs">
              No active query filter rules applied.
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              {whereRows.map((row) => (
                <div key={row.id} className="p-3 bg-muted/30 rounded-xl border border-border relative space-y-2">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeWhereFilterRow(row.id)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-rose-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>

                  <div>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Field</span>
                    <Input
                      type="text"
                      value={row.field}
                      onChange={(e) => setWhereRowValue(row.id, "field", e.target.value)}
                      placeholder="e.g. status"
                      className="bg-card font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Operator</span>
                      <Select
                        value={row.operator}
                        onValueChange={(value) => setWhereRowValue(row.id, "operator", value)}
                      >
                        <SelectTrigger className="w-full bg-card">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WHERE_OPERATORS.map((operator) => (
                            <SelectItem key={operator} value={operator}>
                              {operator}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Type</span>
                      <Select
                        value={row.type}
                        onValueChange={(value) => setWhereRowValue(row.id, "type", value as WhereType)}
                      >
                        <SelectTrigger className="w-full bg-card">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WHERE_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Value</span>
                    <Input
                      type="text"
                      value={row.value}
                      onChange={(e) => setWhereRowValue(row.id, "value", e.target.value)}
                      placeholder="Match value..."
                      className="bg-card"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-5 border-t border-border space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block">Order</span>
          <div className="space-y-2">
            <div>
              <span className="text-[9px] text-primary font-bold uppercase tracking-wider block mb-1">Field Key</span>
              <Input
                type="text"
                value={orderField}
                onChange={(e) => setOrderField(e.target.value)}
                placeholder="id"
                className="bg-muted/50"
              />
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Sort Direction</span>
              <Select value={orderDirection} onValueChange={(value) => setOrderDirection(value as OrderDirection)}>
                <SelectTrigger className="w-full bg-muted/50 font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-border space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block">Pagination Limit</span>
          <div>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              placeholder="e.g. 50"
              className="bg-muted/50 font-bold"
            />
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 mt-auto border-t border-border pt-5 shrink-0">
        <Button
          size="lg"
          onClick={() => {
            onRun()
            onDrawerOpenChange?.(false)
          }}
          className="w-full rounded-xl font-bold shadow-sm hover:shadow-md"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Run Query</span>
        </Button>
      </div>
    </div>
  )

  if (drawerMode) {
    return (
      <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <SheetContent side="right" className="w-[90vw] max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="inline-flex items-center gap-2 text-base">
              <SlidersHorizontal className="text-primary w-5 h-5" />
              Filter and Order
            </SheetTitle>
            <SheetDescription>Refine query results by filters, order, and page size.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{panelBody}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "hidden border-l border-border bg-card text-foreground transition-all duration-300 md:flex md:flex-col",
        rightSidebarExpanded ? "md:w-80" : "md:w-12",
      )}
    >
      <div className={cn("flex shrink-0 items-center border-b border-border transition-all h-14", rightSidebarExpanded ? "px-5 justify-between" : "px-0 justify-center")}>
        {rightSidebarExpanded ? (
          <>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-500" />
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Filter and Order</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={addWhereFilterRow}
                className="rounded-full text-primary"
                title="Add new filter clause"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                className="text-muted-foreground"
                title="Hide Panel"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="secondary"
            size="icon-lg"
            onClick={onToggle}
            className="rounded-xl text-primary shadow-sm"
            title="View Filter and Order panel"
          >
            <SlidersHorizontal className="w-5 h-5 animate-pulse" />
          </Button>
        )}
      </div>

      {rightSidebarExpanded ? (
        <div className="flex min-h-0 flex-1 flex-col">{panelBody}</div>
      ) : null}
    </aside>
  )
}
