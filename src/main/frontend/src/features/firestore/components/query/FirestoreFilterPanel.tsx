import type {
  FilterCombinator,
  OrderClause,
  OrderDirection,
  WhereRow,
  WhereType,
} from "@/features/firestore/schemas/FirestoreSchema"
import { ChevronRight, Layers, Play, Plus, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { Switch } from "@/shadcn/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/shadcn/components/ui/toggle-group"
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
  addWhereOrGroup: () => void
  removeWhereFilterRow: (id: number) => void
  setWhereRowValue: (id: number, key: "field" | "operator" | "value" | "type", value: string) => void
  filterCombinator: FilterCombinator
  setFilterCombinator: (value: FilterCombinator) => void
  collectionGroup: boolean
  setCollectionGroup: (value: boolean) => void
  orderClauses: OrderClause[]
  addOrderClause: () => void
  removeOrderClause: (index: number) => void
  setOrderClauseValue: (index: number, key: "field" | "direction", value: string) => void
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
  addWhereOrGroup,
  removeWhereFilterRow,
  setWhereRowValue,
  filterCombinator,
  setFilterCombinator,
  collectionGroup,
  setCollectionGroup,
  orderClauses,
  addOrderClause,
  removeOrderClause,
  setOrderClauseValue,
  limit,
  setLimit,
  onRun,
  drawerMode = false,
  drawerOpen = false,
  onDrawerOpenChange,
}: FirestoreFilterPanelProps) {
  // FFP-203: render rows grouped by OR group; groups combine with the top-level combinator.
  const groupIds = Array.from(new Set(whereRows.map((row) => row.groupId)))
  const groupConnector = filterCombinator === "or" ? "OR" : "AND"

  const panelBody = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto px-5 pb-5 pt-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Where Filters</span>
            <ToggleGroup
              selectionMode="single"
              disallowEmptySelection
              size="sm"
              variant="outline"
              selectedKeys={[filterCombinator]}
              onSelectionChange={(keys) => setFilterCombinator([...keys][0] as FilterCombinator)}
            >
              <ToggleGroupItem id="and" className="px-2 text-[10px] font-bold">Match ALL</ToggleGroupItem>
              <ToggleGroupItem id="or" className="px-2 text-[10px] font-bold">Match ANY</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {whereRows.length === 0 ? (
            <div className="p-4 border border-dashed border-border rounded-xl text-center text-muted-foreground text-xs">
              No active query filter rules applied.
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {groupIds.map((groupId, groupIndex) => (
                <div key={groupId}>
                  {groupIndex > 0 ? (
                    <div className="flex items-center gap-2 py-1.5">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{groupConnector}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  ) : null}
                  <div className={cn(
                    "space-y-3 rounded-xl border p-2",
                    groupIds.length > 1 ? "border-primary/30 bg-primary/5" : "border-transparent",
                  )}>
                    {whereRows.filter((row) => row.groupId === groupId).map((row) => (
                      <div key={row.id} className="p-3 bg-muted/30 rounded-xl border border-border relative space-y-2">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onPress={() => removeWhereFilterRow(row.id)}
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
                              selectedKey={row.operator}
                              onSelectionChange={(key) => setWhereRowValue(row.id, "operator", String(key))}
                            >
                              <SelectTrigger className="w-full bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WHERE_OPERATORS.map((operator) => (
                                  <SelectItem key={operator} id={operator}>
                                    {operator}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Type</span>
                            <Select
                              selectedKey={row.type}
                              onSelectionChange={(key) => setWhereRowValue(row.id, "type", key as WhereType)}
                            >
                              <SelectTrigger className="w-full bg-card">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WHERE_TYPES.map((type) => (
                                  <SelectItem key={type.value} id={type.value}>
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
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onPress={addWhereFilterRow} className="flex-1">
              <Plus className="w-3.5 h-3.5" />
              Add Filter
            </Button>
            <Button variant="outline" size="sm" onPress={addWhereOrGroup} className="flex-1">
              <Plus className="w-3.5 h-3.5" />
              Add OR Group
            </Button>
          </div>
        </div>

        {/* FFP-203: collection-group query toggle */}
        <div className="mt-6 pt-5 border-t border-border">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <div>
                <Label className="text-xs font-semibold">Collection group</Label>
                <p className="text-[10px] text-muted-foreground">Query the path's collection id across all parents.</p>
              </div>
            </div>
            <Switch isSelected={collectionGroup} onChange={setCollectionGroup} />
          </div>
        </div>

        {/* FFP-203: multiple order clauses */}
        <div className="mt-6 pt-5 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground block">Order</span>
            <span title="Add order clause">
              <Button variant="ghost" size="icon-sm" onPress={addOrderClause} className="text-primary">
                <Plus className="w-4 h-4" />
              </Button>
            </span>
          </div>
          {orderClauses.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">Ordered by document ID. Add a clause to sort by fields.</p>
          ) : (
            <div className="space-y-2">
              {orderClauses.map((clause, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <span className="text-[9px] text-primary font-bold uppercase tracking-wider block mb-1">Field</span>
                    <Input
                      type="text"
                      value={clause.field}
                      onChange={(e) => setOrderClauseValue(index, "field", e.target.value)}
                      placeholder="field"
                      className="bg-muted/50 font-mono"
                    />
                  </div>
                  <Select
                    selectedKey={clause.direction}
                    onSelectionChange={(key) => setOrderClauseValue(index, "direction", key as OrderDirection)}
                  >
                    <SelectTrigger className="w-28 bg-muted/50 font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem id="desc">Descending</SelectItem>
                      <SelectItem id="asc">Ascending</SelectItem>
                    </SelectContent>
                  </Select>
                  <span title="Remove order clause">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onPress={() => removeOrderClause(index)}
                      className="text-muted-foreground hover:text-rose-500"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
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
          onPress={() => {
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
      <Sheet
        isOpen={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        side="right"
        className="w-[90vw] max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle className="inline-flex items-center gap-2 text-base">
            <SlidersHorizontal className="text-primary w-5 h-5" />
            Filter and Order
          </SheetTitle>
          <SheetDescription>Refine query results by filters, order, and page size.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">{panelBody}</div>
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
              <span title="Add new filter clause">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onPress={addWhereFilterRow}
                  className="rounded-full text-primary"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </span>
              <span title="Hide Panel">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onPress={onToggle}
                  className="text-muted-foreground"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </span>
            </div>
          </>
        ) : (
          <span title="View Filter and Order panel">
            <Button
              variant="secondary"
              size="icon-lg"
              onPress={onToggle}
              className="rounded-xl text-primary shadow-sm"
            >
              <SlidersHorizontal className="w-5 h-5 animate-pulse" />
            </Button>
          </span>
        )}
      </div>

      {rightSidebarExpanded ? (
        <div className="flex min-h-0 flex-1 flex-col">{panelBody}</div>
      ) : null}
    </aside>
  )
}
