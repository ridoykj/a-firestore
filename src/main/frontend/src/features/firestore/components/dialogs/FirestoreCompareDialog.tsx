import { useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, Download } from "lucide-react"

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
import { ToggleGroup, ToggleGroupItem } from "@/shadcn/components/ui/toggle-group"
import { cn } from "@/shadcn/lib/utils"
import { firestoreService, type FirestoreContext } from "@/features/firestore/api/firestore-service"
import {
  diffCollectionSamples,
  diffTypedFields,
  type DiffResult,
} from "@/features/firestore/api/firestore-diff"
import {
  normalizeFirestoreFields,
  type FirestoreWireValue,
} from "@/features/firestore/api/firestore-value-utils"
import { normalizePath, pathIsCollection, safePreviewValue } from "@/features/firestore/api/firestore-utils"
import { triggerTextDownload } from "@/features/firestore/api/firestore-transfer-utils"

type CompareMode = "documents" | "collections"

const SAMPLE_LIMIT = 100

type FirestoreCompareDialogProps = {
  context: FirestoreContext
  open: boolean
  onOpenChange: (open: boolean) => void
  initialLeftPath?: string
}

function statusColor(status: string): string {
  switch (status) {
    case "added":
      return "text-emerald-600 dark:text-emerald-400"
    case "removed":
      return "text-rose-600 dark:text-rose-400"
    default:
      return "text-amber-600 dark:text-amber-400"
  }
}

export function FirestoreCompareDialog({
  context,
  open,
  onOpenChange,
  initialLeftPath = "",
}: FirestoreCompareDialogProps) {
  const [mode, setMode] = useState<CompareMode>("documents")
  const [leftPath, setLeftPath] = useState(initialLeftPath)
  const [rightPath, setRightPath] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DiffResult | null>(null)

  async function typedFieldsForDocument(path: string): Promise<Record<string, FirestoreWireValue>> {
    const details = await firestoreService.getDocumentDetails(context, path)
    return details.typedFields
  }

  async function typedSampleForCollection(
    path: string,
  ): Promise<Array<Record<string, FirestoreWireValue>>> {
    const documents = await firestoreService.getCollectionDocuments(context, path)
    return documents.slice(0, SAMPLE_LIMIT).map((document) => {
      const typed = (document as Record<string, unknown>)._typedFields
      return typed && typeof typed === "object"
        ? (typed as Record<string, FirestoreWireValue>)
        : normalizeFirestoreFields(document)
    })
  }

  async function runCompare() {
    const left = normalizePath(leftPath)
    const right = normalizePath(rightPath)
    if (!left || !right) {
      toast.warning("Enter both paths to compare.")
      return
    }

    setBusy(true)
    setResult(null)
    try {
      if (mode === "documents") {
        if (pathIsCollection(left) || pathIsCollection(right)) {
          toast.error("Document comparison needs two document paths (even segment count).")
          return
        }
        const [a, b] = await Promise.all([
          typedFieldsForDocument(left),
          typedFieldsForDocument(right),
        ])
        setResult(diffTypedFields(a, b))
      } else {
        if (!pathIsCollection(left) || !pathIsCollection(right)) {
          toast.error("Collection comparison needs two collection paths (odd segment count).")
          return
        }
        const [a, b] = await Promise.all([
          typedSampleForCollection(left),
          typedSampleForCollection(right),
        ])
        setResult(diffCollectionSamples(a, b))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Comparison failed.")
    } finally {
      setBusy(false)
    }
  }

  function exportResult() {
    if (!result) {
      return
    }
    const payload = {
      mode,
      left: normalizePath(leftPath),
      right: normalizePath(rightPath),
      summary: {
        added: result.added,
        removed: result.removed,
        changed: result.changed,
        unchanged: result.unchanged,
      },
      entries: result.entries,
    }
    triggerTextDownload("comparison.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-primary" />
            Compare
          </DialogTitle>
          <DialogDescription>
            Type-aware comparison of two documents or two collection field schemas.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value === "documents" || value === "collections") {
              setMode(value)
              setResult(null)
            }
          }}
          variant="outline"
          className="w-full"
        >
          <ToggleGroupItem value="documents" className="flex-1">Documents</ToggleGroupItem>
          <ToggleGroupItem value="collections" className="flex-1">Collections</ToggleGroupItem>
        </ToggleGroup>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Left path</Label>
            <Input
              value={leftPath}
              onChange={(event) => setLeftPath(event.target.value)}
              placeholder={mode === "documents" ? "users/alice" : "users"}
              className="font-mono text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Right path</Label>
            <Input
              value={rightPath}
              onChange={(event) => setRightPath(event.target.value)}
              placeholder={mode === "documents" ? "users/bob" : "archived_users"}
              className="font-mono text-sm"
            />
          </div>
        </div>

        {result ? (
          <div className="rounded-lg border">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs">
              <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">+{result.added} added</Badge>
              <Badge variant="secondary" className="text-rose-600 dark:text-rose-400">-{result.removed} removed</Badge>
              <Badge variant="secondary" className="text-amber-600 dark:text-amber-400">~{result.changed} changed</Badge>
              <Badge variant="outline">{result.unchanged} unchanged</Badge>
            </div>
            <ScrollArea className="max-h-72">
              {result.entries.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No differences.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-background/95">
                    <tr className="border-b">
                      <th className="px-3 py-1.5 font-semibold">Field</th>
                      <th className="px-3 py-1.5 font-semibold">Status</th>
                      <th className="px-3 py-1.5 font-semibold">Left</th>
                      <th className="px-3 py-1.5 font-semibold">Right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.entries.map((entry) => (
                      <tr key={entry.path} className="border-b last:border-0 align-top">
                        <td className="px-3 py-1.5 font-mono">{entry.path}</td>
                        <td className={cn("px-3 py-1.5 font-semibold", statusColor(entry.status))}>
                          {entry.status}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                          {entry.left === undefined ? "—" : `${safePreviewValue(entry.left)}${entry.leftType ? ` (${entry.leftType})` : ""}`}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-muted-foreground">
                          {entry.right === undefined ? "—" : `${safePreviewValue(entry.right)}${entry.rightType ? ` (${entry.rightType})` : ""}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </div>
        ) : null}

        <DialogFooter>
          {result ? (
            <Button variant="outline" onClick={exportResult}>
              <Download data-icon="inline-start" />
              Export JSON
            </Button>
          ) : null}
          <Button onClick={() => void runCompare()} disabled={busy}>
            {busy ? "Comparing..." : "Compare"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
