import { useState } from "react"
import { toast } from "sonner"
import { Play, Plus, ScanEye, X } from "lucide-react"

import { Button } from "@/shadcn/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import { Badge } from "@/shadcn/components/ui/badge"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import { firestoreService, type FirestoreContext } from "@/features/firestore/api/firestore-service"
import { inferWireValue, type FirestoreWireValue } from "@/features/firestore/api/firestore-value-utils"
import type { BulkEditResponse } from "@/features/firestore/schemas/FirestoreSchema"

type SetType = "string" | "integer" | "double" | "boolean" | "null" | "timestamp" | "json"

type SetRow = { id: number; field: string; type: SetType; value: string }

const SET_TYPES: SetType[] = ["string", "integer", "double", "boolean", "null", "timestamp", "json"]

type FirestoreBulkEditDialogProps = {
  context: FirestoreContext
  open: boolean
  onOpenChange: (open: boolean) => void
  paths: string[]
  onExecuted?: () => void
}

/** Builds a canonical wire value from a typed set-field row; throws on malformed input. */
function toWireValue(type: SetType, raw: string): FirestoreWireValue {
  switch (type) {
    case "string":
      return { stringValue: raw }
    case "integer": {
      if (!/^-?\d+$/.test(raw.trim())) {
        throw new Error(`'${raw}' is not an integer.`)
      }
      return { integerValue: raw.trim() }
    }
    case "double": {
      const parsed = Number(raw)
      if (Number.isNaN(parsed)) {
        throw new Error(`'${raw}' is not a number.`)
      }
      return { doubleValue: parsed }
    }
    case "boolean":
      return { booleanValue: raw.trim() === "true" }
    case "null":
      return { nullValue: null }
    case "timestamp": {
      if (Number.isNaN(Date.parse(raw.trim()))) {
        throw new Error(`'${raw}' is not an ISO-8601 timestamp.`)
      }
      return { timestampValue: raw.trim() }
    }
    case "json":
      return inferWireValue(JSON.parse(raw))
    default:
      return { stringValue: raw }
  }
}

export function FirestoreBulkEditDialog({
  context,
  open,
  onOpenChange,
  paths,
  onExecuted,
}: FirestoreBulkEditDialogProps) {
  const [setRows, setSetRows] = useState<SetRow[]>([{ id: 1, field: "", type: "string", value: "" }])
  const [deletePathsText, setDeletePathsText] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkEditResponse | null>(null)

  function addSetRow() {
    setSetRows((prev) => [
      ...prev,
      { id: prev.reduce((max, row) => Math.max(max, row.id), 0) + 1, field: "", type: "string", value: "" },
    ])
  }

  function updateSetRow(id: number, key: "field" | "type" | "value", value: string) {
    setSetRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)))
  }

  function removeSetRow(id: number) {
    setSetRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  function buildRequestBody(dryRun: boolean) {
    const setFields: Record<string, FirestoreWireValue> = {}
    for (const row of setRows) {
      const field = row.field.trim()
      if (!field) {
        continue
      }
      setFields[field] = toWireValue(row.type, row.value)
    }
    const deleteFieldPaths = deletePathsText
      .split(/[\n,]/)
      .map((path) => path.trim())
      .filter(Boolean)
    return { paths, setFields, deleteFieldPaths, dryRun }
  }

  async function run(dryRun: boolean) {
    if (paths.length === 0) {
      toast.warning("Select documents to edit first.")
      return
    }
    let body: ReturnType<typeof buildRequestBody>
    try {
      body = buildRequestBody(dryRun)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid patch value.")
      return
    }
    if (Object.keys(body.setFields).length === 0 && body.deleteFieldPaths.length === 0) {
      toast.warning("Add at least one field to set or delete.")
      return
    }

    setBusy(true)
    setResult(null)
    try {
      const response = await firestoreService.bulkEditDocuments(context, body)
      setResult(response)
      if (!dryRun) {
        if (response.complete) {
          toast.success(`Updated ${response.succeeded} document(s).`)
          onExecuted?.()
        } else {
          toast.error(`${response.failed} document(s) failed; ${response.succeeded} updated.`)
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk edit failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk edit {paths.length} document(s)</DialogTitle>
          <DialogDescription>
            Apply a typed merge patch to the selected documents. Preview with a dry run first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Set fields</Label>
            <Button variant="ghost" size="sm" onClick={addSetRow}>
              <Plus className="size-3.5" />
              Add field
            </Button>
          </div>
          <div className="space-y-2">
            {setRows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <Input
                  value={row.field}
                  onChange={(event) => updateSetRow(row.id, "field", event.target.value)}
                  placeholder="field"
                  className="flex-1 font-mono text-sm"
                />
                <Select value={row.type} onValueChange={(value) => updateSetRow(row.id, "type", value)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SET_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={row.value}
                  onChange={(event) => updateSetRow(row.id, "value", event.target.value)}
                  placeholder={row.type === "null" ? "(null)" : "value"}
                  disabled={row.type === "null"}
                  className="flex-1 text-sm"
                />
                <Button variant="ghost" size="icon-sm" onClick={() => removeSetRow(row.id)}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Delete field paths
            </Label>
            <Input
              value={deletePathsText}
              onChange={(event) => setDeletePathsText(event.target.value)}
              placeholder="dot.paths, comma or newline separated"
              className="font-mono text-sm"
            />
          </div>
        </div>

        {result ? (
          <div className="rounded-lg border">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
              {result.dryRun ? (
                <Badge variant="outline">Dry run · {result.requested} document(s) targeted</Badge>
              ) : (
                <>
                  <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">{result.succeeded} updated</Badge>
                  {result.failed > 0 ? (
                    <Badge variant="destructive">{result.failed} failed</Badge>
                  ) : null}
                </>
              )}
            </div>
            {result.results.some((item) => item.status === "failed") ? (
              <ScrollArea className="max-h-40">
                <ul className="p-2 text-xs">
                  {result.results
                    .filter((item) => item.status === "failed")
                    .map((item) => (
                      <li key={item.path} className="px-1 py-0.5 font-mono text-rose-600 dark:text-rose-400">
                        {item.path}: {item.message}
                      </li>
                    ))}
                </ul>
              </ScrollArea>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => void run(true)} disabled={busy}>
            <ScanEye data-icon="inline-start" />
            Dry run
          </Button>
          <Button variant="destructive" onClick={() => void run(false)} disabled={busy}>
            <Play data-icon="inline-start" />
            Apply to {paths.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
