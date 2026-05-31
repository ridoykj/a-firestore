import type { OrderDirection, WhereRow, WhereType } from "@/dto/firestore/FirestoreSchema"
import { ChevronRight, Play, Plus, SlidersHorizontal, X } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { cn } from "@/shadcn/lib/utils"

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
                  <button
                    onClick={() => removeWhereFilterRow(row.id)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-rose-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>

                  <div>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Field</span>
                    <input
                      type="text"
                      value={row.field}
                      onChange={(e) => setWhereRowValue(row.id, "field", e.target.value)}
                      placeholder="e.g. status"
                      className="w-full bg-card text-xs px-2.5 py-1 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Operator</span>
                      <select
                        value={row.operator}
                        onChange={(e) => setWhereRowValue(row.id, "operator", e.target.value)}
                        className="w-full bg-card text-xs px-2 py-1.5 rounded-lg border border-border focus:outline-none"
                      >
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<">&lt;</option>
                        <option value="<=">&lt;=</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Type</span>
                      <select
                        value={row.type}
                        onChange={(e) => setWhereRowValue(row.id, "type", e.target.value as WhereType)}
                        className="w-full bg-card text-xs px-2 py-1.5 rounded-lg border border-border focus:outline-none"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="null">null</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Value</span>
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => setWhereRowValue(row.id, "value", e.target.value)}
                      placeholder="Match value..."
                      className="w-full bg-card text-xs px-2.5 py-1.5 rounded-lg border border-border focus:outline-none"
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
              <input
                type="text"
                value={orderField}
                onChange={(e) => setOrderField(e.target.value)}
                placeholder="id"
                className="w-full bg-muted/50 text-xs px-3 py-2 rounded-lg border border-border focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Sort Direction</span>
              <select
                value={orderDirection}
                onChange={(e) => setOrderDirection(e.target.value as OrderDirection)}
                className="w-full bg-muted/50 text-xs px-3 py-2 rounded-lg border border-border focus:outline-none font-semibold"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-border space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block">Pagination Limit</span>
          <div>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              placeholder="e.g. 50"
              className="w-full bg-muted/50 text-xs px-3 py-2 rounded-lg border border-border focus:outline-none font-bold"
            />
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 mt-auto border-t border-border pt-5 shrink-0">
        <button
          onClick={() => {
            onRun()
            onDrawerOpenChange?.(false)
          }}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all active:scale-95"
        >
          <Play className="w-4 h-4 fill-current text-primary-foreground" />
          <span>Run Query</span>
        </button>
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
      {rightSidebarExpanded ? (
        <>
          <div className="flex items-center justify-between p-5 pb-4 mb-4 border-b border-border">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filter and Order</span>
            <div className="flex items-center gap-1">
              <button
                onClick={addWhereFilterRow}
                className="p-1.5 rounded-full hover:bg-muted text-primary transition-colors"
                title="Add new filter clause"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={onToggle}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                title="Hide Panel"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{panelBody}</div>
        </>
      ) : (
        <div className="w-12 flex flex-col items-center py-5">
          <button
            onClick={onToggle}
            className="p-2.5 rounded-xl bg-secondary text-primary hover:bg-secondary/80 transition-all shadow-sm"
            title="View Filter and Order panel"
          >
            <SlidersHorizontal className="w-5 h-5 animate-pulse" />
          </button>
        </div>
      )}
    </aside>
  )
}
