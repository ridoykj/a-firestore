import { lazy, Suspense, useState } from "react"
import type {
  PreviewEditorTheme,
  PreviewValidationSummary,
  TransferFormat,
} from "@/dto/firestore/FirestoreSchema"
import { FirestoreJsonTreeViewer } from "@/view/pages/firestore/components/FirestoreJsonTreeViewer"
import { FirestoreJsonGraphViewer } from "@/view/pages/firestore/components/FirestoreJsonGraphViewer"
import { normalizePath, pathIsCollection } from "@/view/pages/firestore/lib/firestore-utils"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shadcn/components/ui/alert-dialog"
import { Button } from "@/shadcn/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shadcn/components/ui/field"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import {
  Download,
  FileJson,
  FolderTree,
  Moon,
  Network,
  Sun,
  Upload,
  WandSparkles,
  X
} from "lucide-react"

const FirestoreJsonCodeEditor = lazy(async () => {
  const module = await import("@/view/pages/firestore/components/FirestoreJsonCodeEditor")
  return { default: module.FirestoreJsonCodeEditor }
})

export type PreviewTab = "tree" | "graph" | "json"
export type PreviewBusy = "update" | "delete" | null

type FirestoreDocumentPreviewPanelProps = {
  open: boolean
  documentId: string
  documentPath: string
  draft: string
  onDraftChange: (value: string) => void
  activeTab: PreviewTab
  onActiveTabChange: (value: PreviewTab) => void
  busyAction: PreviewBusy
  editorTheme: PreviewEditorTheme
  onEditorThemeChange: (value: PreviewEditorTheme) => void
  validation: PreviewValidationSummary
  onValidationChange: (summary: PreviewValidationSummary) => void
  onOpenChange: (open: boolean) => void
  onUpdate: (formattedDraft: string) => void
  onDelete: () => void
  onExportDocument: (format: TransferFormat) => void
  onImportDocument: (format: TransferFormat) => void
  transferBusy?: boolean
}

export function FirestoreDocumentPreviewPanel({
  open,
  documentId,
  documentPath,
  draft,
  onDraftChange,
  activeTab,
  onActiveTabChange,
  busyAction,
  editorTheme,
  onEditorThemeChange,
  validation,
  onValidationChange,
  onOpenChange,
  onUpdate,
  onDelete,
  onExportDocument,
  onImportDocument,
  transferBusy = false,
}: FirestoreDocumentPreviewPanelProps) {
  const [attemptedJsonSubmit, setAttemptedJsonSubmit] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [formatRequestVersion, setFormatRequestVersion] = useState(0)
  const isPending = busyAction !== null

  const normalizedPath = normalizePath(documentPath)
  const pathIsInvalid = !normalizedPath || pathIsCollection(normalizedPath)
  const payloadMissing = attemptedJsonSubmit && !draft.trim()
  const jsonHasValidationErrors = validation.errorCount > 0

  function closePanel() {
    if (isPending) {
      return
    }
    onOpenChange(false)
    setDeleteConfirmOpen(false)
  }

  function openDeleteConfirm() {
    if (pathIsInvalid || isPending) {
      return
    }
    setDeleteConfirmOpen(true)
  }

  function handleDeleteConfirm() {
    onDelete()
    setDeleteConfirmOpen(false)
  }

  function handleFormatJson() {
    setFormatRequestVersion((value) => value + 1)
  }

  function handleSave() {
    setAttemptedJsonSubmit(true)
    if (pathIsInvalid || !draft.trim() || jsonHasValidationErrors) {
      return
    }

    try {
      const parsed = JSON.parse(draft)
      const formattedDraft = JSON.stringify(parsed, null, 2)
      if (formattedDraft !== draft) {
        onDraftChange(formattedDraft)
      }
      onUpdate(formattedDraft)
    } catch {
      return
    }
  }

  const jsonValidationAlert = jsonHasValidationErrors ? (
    <Alert variant="destructive">
      <AlertTitle>Invalid JSON</AlertTitle>
      <AlertDescription>
        {validation.firstErrorMessage ||
          `${validation.errorCount} JSON error(s) detected. Fix before saving.`}
      </AlertDescription>
    </Alert>
  ) : null

  const jsonWarningAlert =
    !jsonHasValidationErrors && validation.warningCount > 0 ? (
      <Alert>
        <AlertTitle>JSON Warnings</AlertTitle>
        <AlertDescription>
          {validation.warningCount} warning(s) detected. You can still save.
        </AlertDescription>
      </Alert>
    ) : null

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end transition-all">
        <div className="w-full max-w-2xl bg-card h-full flex flex-col overflow-y-auto shadow-2xl border-l border-border animate-in slide-in-from-right-8 duration-300">
          <div className="border-b border-border px-6 py-5 shrink-0">
            <div className="flex items-center justify-between pb-4">
              <div>
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Document Properties</span>
                <h3 className="text-sm font-bold font-mono text-primary truncate mt-1">
                  {documentId || "(no-id)"}
                </h3>
              </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    disabled={isPending || transferBusy || pathIsInvalid}
                  >
                    <Download className="mr-1.5 h-4 w-4 text-emerald-500" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onExportDocument("json")}
                    disabled={pathIsInvalid || isPending || transferBusy}
                  >
                    Export JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onExportDocument("csv")}
                    disabled={pathIsInvalid || isPending || transferBusy}
                  >
                    Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    disabled={isPending || transferBusy || pathIsInvalid}
                  >
                    <Upload className="mr-1.5 h-4 w-4 text-blue-500" />
                    Import
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onImportDocument("json")}
                    disabled={pathIsInvalid || isPending || transferBusy}
                  >
                    Import JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onImportDocument("csv")}
                    disabled={pathIsInvalid || isPending || transferBusy}
                  >
                      Import CSV
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled>
                      Full replace upsert mode
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-center gap-1 rounded-md border bg-muted/50 p-1 ml-2">
                  <button
                    type="button"
                    onClick={() => onEditorThemeChange("light")}
                    disabled={isPending}
                    className={`p-1.5 rounded-md ${editorTheme === "light" ? "bg-background shadow-sm" : "hover:bg-muted text-muted-foreground"}`}
                    title="Light Theme"
                  >
                    <Sun className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditorThemeChange("dark")}
                    disabled={isPending}
                    className={`p-1.5 rounded-md ${editorTheme === "dark" ? "bg-background shadow-sm" : "hover:bg-muted text-muted-foreground"}`}
                    title="Dark Theme"
                  >
                    <Moon className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => onOpenChange(false)}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono text-muted-foreground break-all">
              <span className="font-bold">Path:</span>
              <span className="text-foreground">{documentPath || "(not set)"}</span>
            </div>
          </div>

          <div className="min-h-0 flex flex-1 flex-col px-6 py-4">
            <FieldGroup className="min-h-0 flex-1">
              <Tabs
                value={activeTab}
                onValueChange={(value) => onActiveTabChange(value as PreviewTab)}
                className="min-h-0 flex-1 gap-3"
              >
                <TabsList variant="line" className="h-9">
                  <TabsTrigger value="tree">
                    <FolderTree data-icon="inline-start" />
                    Tree
                  </TabsTrigger>
                  <TabsTrigger value="graph">
                    <Network data-icon="inline-start" />
                    Graph
                  </TabsTrigger>
                  <TabsTrigger value="json">
                    <FileJson data-icon="inline-start" />
                    JSON
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="tree"
                  className="flex min-h-0 flex-1"
                >
                  <FirestoreJsonTreeViewer draft={draft} onDraftChange={onDraftChange} />
                </TabsContent>

                <TabsContent
                  value="graph"
                  className="min-h-0 flex-1"
                >
                  <FirestoreJsonGraphViewer draft={draft} />
                </TabsContent>

                <TabsContent value="json" className="flex min-h-0 flex-1 flex-col gap-3">
                  <Field
                    className="min-h-0 flex-1"
                    data-invalid={payloadMissing || jsonHasValidationErrors}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FieldLabel htmlFor="preview-json-payload">JSON Payload</FieldLabel>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={handleFormatJson}
                        disabled={isPending}
                      >
                        <WandSparkles data-icon="inline-start" />
                        Format JSON
                      </Button>
                    </div>
                    <Suspense fallback={<Skeleton className="h-full min-h-0 w-full flex-1" />}>
                      <FirestoreJsonCodeEditor
                        className="min-h-0 flex-1"
                        modelPath={documentPath}
                        value={draft}
                        onChange={onDraftChange}
                        theme={editorTheme}
                        formatRequestVersion={formatRequestVersion}
                        onValidationChange={onValidationChange}
                        disabled={isPending}
                      />
                    </Suspense>
                    {payloadMissing ? <FieldError>JSON payload is required.</FieldError> : null}
                    {jsonValidationAlert}
                    {jsonWarningAlert}
                  </Field>
                </TabsContent>
              </Tabs>
            </FieldGroup>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4 shrink-0 bg-background">
            <Button
              type="button"
              variant="ghost"
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              onClick={openDeleteConfirm}
              disabled={isPending || pathIsInvalid}
            >
              {busyAction === "delete" ? <Spinner className="mr-1.5" /> : null}
              {busyAction === "delete" ? "Deleting..." : "Delete Doc"}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={closePanel} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || jsonHasValidationErrors}
              >
                {busyAction === "update" ? <Spinner className="mr-1.5" /> : null}
                {busyAction === "update" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              This action permanently deletes the current document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isPending}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
