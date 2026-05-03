import type { OrderDirection, WhereRow, WhereType } from "@/dto/firestore/FirestoreSchema"
import { AlertCircle, PanelRightClose, PanelRightOpen, Plus, Trash2 } from "lucide-react"
import { Button } from "@/shadcn/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shadcn/components/ui/field"
import { Input } from "@/shadcn/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import { Separator } from "@/shadcn/components/ui/separator"
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
}: FirestoreFilterPanelProps) {
  return (
    <aside
      className={cn(
        "border-l bg-card transition-all",
        rightSidebarExpanded ? "w-80" : "w-0",
      )}
    >
      <div className="flex h-10 items-center justify-between border-b px-2">
        {rightSidebarExpanded ? (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Filter &amp; Order
          </span>
        ) : null}
        <Button type="button" size="icon-xs" variant="ghost" onClick={onToggle}>
          {rightSidebarExpanded ? (
            <PanelRightClose data-icon="inline-start" />
          ) : (
            <PanelRightOpen data-icon="inline-start" />
          )}
        </Button>
      </div>

      {rightSidebarExpanded ? (
        <div className="h-[calc(100%-2.5rem)] overflow-auto p-3">
          <FieldGroup>
            <Field>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</p>
                <Button type="button" size="icon-xs" variant="outline" onClick={addWhereFilterRow}>
                  <Plus data-icon="inline-start" />
                </Button>
              </div>

              {whereRows.map((row) => (
                <Field key={row.id} className="rounded-md border p-2">
                  <FieldLabel htmlFor={`where-field-${row.id}`} className="sr-only">
                    Where Field
                  </FieldLabel>
                  <Input
                    id={`where-field-${row.id}`}
                    value={row.field}
                    onChange={(event) => setWhereRowValue(row.id, "field", event.target.value)}
                    placeholder="field"
                    className="font-mono text-xs"
                  />
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
                    <Select
                      value={row.operator}
                      onValueChange={(value) => setWhereRowValue(row.id, "operator", value)}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="==">==</SelectItem>
                        <SelectItem value="!=">!=</SelectItem>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value=">=">&gt;=</SelectItem>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value="<=">&lt;=</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.type}
                      onValueChange={(value) => setWhereRowValue(row.id, "type", value as WhereType)}
                    >
                      <SelectTrigger className="h-8 w-full text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">string</SelectItem>
                        <SelectItem value="number">number</SelectItem>
                        <SelectItem value="boolean">boolean</SelectItem>
                        <SelectItem value="null">null</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      onClick={() => removeWhereFilterRow(row.id)}
                    >
                      <Trash2 data-icon="inline-start" />
                    </Button>
                  </div>
                  <Input
                    value={row.value}
                    onChange={(event) => setWhereRowValue(row.id, "value", event.target.value)}
                    placeholder="value"
                    className="font-mono text-xs"
                  />
                </Field>
              ))}
            </Field>

            <Separator />

            <Field>
              <FieldLabel htmlFor="order-field">Order</FieldLabel>
              <Input
                id="order-field"
                value={orderField}
                onChange={(event) => setOrderField(event.target.value)}
                placeholder="field"
                className="font-mono text-xs"
              />
              <Select
                value={orderDirection}
                onValueChange={(value) => setOrderDirection(value === "asc" ? "asc" : "desc")}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Sort direction applies to the selected field.</FieldDescription>
            </Field>

            <Separator />

            <Field>
              <FieldLabel>Pagination</FieldLabel>
              <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>Controls the maximum rows per query page.</FieldDescription>
              <Button type="button" size="sm" onClick={onRun}>
                Run
              </Button>
            </Field>
          </FieldGroup>
        </div>
      ) : (
        <div className="flex h-[calc(100%-2.5rem)] items-center justify-center">
          <AlertCircle />
        </div>
      )}
    </aside>
  )
}
