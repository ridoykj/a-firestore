import type {
  PreviewEditorTheme,
  PreviewValidationSummary,
  TransferFormat,
  WriteMode,
} from "@/features/firestore/schemas/FirestoreSchema"
import type { WritePreview } from "@/features/firestore/api/firestore-value-utils"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shadcn/components/ui/alert-dialog"
import { Button } from "@/shadcn/components/ui/button"
import {
  DropdownMenu,
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
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/shadcn/components/ui/sheet"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/shadcn/components/ui/toggle-group"
import { normalizePath, pathIsCollection } from "@/features/firestore/api/firestore-utils"
import {
  CheckCircle2,
  Download,
  FileJson,
  FolderTree,
  Network,
  RefreshCw,
  Trash2,
  Upload,
  WandSparkles,
  X
} from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"

const FirestoreJsonCodeEditor = lazy(async () => {
  const module = await import("@/features/firestore/components/viewers/FirestoreJsonCodeEditor")
  return { default: module.FirestoreJsonCodeEditor }
})

const FirestoreJsonTreeViewer = lazy(async () => {
  const module = await import("@/features/firestore/components/viewers/FirestoreJsonTreeViewer")
  return { default: module.FirestoreJsonTreeViewer }
})

const FirestoreJsonGraphViewer = lazy(async () => {
  const module = await import("@/features/firestore/components/viewers/FirestoreJsonGraphViewer")
  return { default: module.FirestoreJsonGraphViewer }
})

export type PreviewTab = "tree" | "graph" | "json"
export type PreviewBusy = "update" | "delete" | "refresh" | null

type FirestoreDocumentPreviewPanelProps = {
  open: boolean
  documentId: string
  documentPath: string
  draft: string
  onDraftChange: (value: string) => void
  activeTab: PreviewTab
  onActiveTabChange: (value: PreviewTab) => void
  busyAction: PreviewBusy
  /** Follows the app's global theme (see `useTheme`) — this panel has no theme control of its own. */
  editorTheme: PreviewEditorTheme
  validation: PreviewValidationSummary
  onValidationChange: (summary: PreviewValidationSummary) => void
  onOpenChange: (open: boolean) => void
  onUpdate: (formattedDraft: string) => void
  onDelete: () => void
  onRefresh: () => void
  onExportDocument: (format: TransferFormat) => void
  onImportDocument: (format: TransferFormat) => void
  transferBusy?: boolean
  /** FFP-102: explicit save mode; merge is the safe default. */
  saveMode: WriteMode
  onSaveModeChange: (mode: WriteMode) => void
  /** FFP-102: fields the pending save would add/change/delete, or null while the draft is invalid. */
  writePreview: WritePreview | null
  writePreviewError?: string
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
  validation,
  onValidationChange,
  onOpenChange,
  onUpdate,
  onDelete,
  onRefresh,
  onExportDocument,
  onImportDocument,
  transferBusy = false,
  saveMode,
  onSaveModeChange,
  writePreview,
  writePreviewError = "",
}: FirestoreDocumentPreviewPanelProps) {
  const [attemptedJsonSubmit, setAttemptedJsonSubmit] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [formatRequestVersion, setFormatRequestVersion] = useState(0)
  const [renderHeavyContent, setRenderHeavyContent] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setRenderHeavyContent(open), 300)
    return () => clearTimeout(timer)
  }, [open])

  const isPending = busyAction !== null

  const normalizedPath = normalizePath(documentPath)
  const pathIsInvalid = !normalizedPath || pathIsCollection(normalizedPath)
  const payloadMissing = attemptedJsonSubmit && !draft.trim()
  const jsonHasValidationErrors = validation.errorCount > 0

  const addedCount = writePreview?.addedFields.length ?? 0
  const changedCount = writePreview?.changedFields.length ?? 0
  const deletedCount = writePreview?.deletedFields.length ?? 0
  const hasPendingChanges = addedCount + changedCount + deletedCount > 0

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

  function handleSheetOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      closePanel()
    } else {
      onOpenChange(nextOpen)
    }
  }

  return (
    <>
      <Sheet
        isOpen={open}
        onOpenChange={handleSheetOpenChange}
        side="right"
        showCloseButton={false}
        className="w-[90%]! sm:w-[85%]! sm:max-w-[85%]! p-0 gap-0 flex flex-col overflow-y-auto shadow-2xl"
      >
          <SheetHeader className="p-3">
            <SheetTitle className="sr-only">Document Preview</SheetTitle>
            <SheetDescription className="sr-only">
              View and edit the contents of this Firestore document.
            </SheetDescription>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <div className="flex items-start justify-between w-full sm:w-auto">
                <div className="min-w-0 flex-1 pr-4 sm:pr-0">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">Document Properties: {documentId || "(no-id)"}</span>
                  <div className="sm:mt-2 flex flex-wrap gap-2 text-xs font-mono text-muted-foreground break-all">
                    <span className="font-bold">Path:</span>
                    <span className="text-foreground">{documentPath || "(not set)"}</span>
                  </div>
                </div>
                {/* Close button on mobile positioned next to title */}
                <Button variant="outline"
                  size="icon-lg"
                  onPress={() => onOpenChange(false)}
                  className="sm:hidden p-1.5 -mr-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span title="Refresh Document">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    onPress={onRefresh}
                    isDisabled={isPending || transferBusy || pathIsInvalid}
                  >
                    <RefreshCw className={`mr-1.5 h-4 w-4 text-muted-foreground ${busyAction === "refresh" ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </span>

                <DropdownMenuTrigger>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    isDisabled={isPending || transferBusy || pathIsInvalid}
                  >
                    <Download className="mr-1.5 h-4 w-4 text-emerald-500" />
                    Export
                  </Button>
                  <DropdownMenu placement="bottom end">
                    <DropdownMenuItem
                      onAction={() => onExportDocument("json")}
                      isDisabled={pathIsInvalid || isPending || transferBusy}
                    >
                      Export JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onAction={() => onExportDocument("csv")}
                      isDisabled={pathIsInvalid || isPending || transferBusy}
                    >
                      Export CSV
                    </DropdownMenuItem>
                  </DropdownMenu>
                </DropdownMenuTrigger>

                <DropdownMenuTrigger>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    isDisabled={isPending || transferBusy || pathIsInvalid}
                  >
                    <Upload className="mr-1.5 h-4 w-4 text-blue-500" />
                    Import
                  </Button>
                  <DropdownMenu placement="bottom end">
                    <DropdownMenuItem
                      onAction={() => onImportDocument("json")}
                      isDisabled={pathIsInvalid || isPending || transferBusy}
                    >
                      Import JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onAction={() => onImportDocument("csv")}
                      isDisabled={pathIsInvalid || isPending || transferBusy}
                    >
                      Import CSV
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem isDisabled>
                      Full replace upsert mode
                    </DropdownMenuItem>
                  </DropdownMenu>
                </DropdownMenuTrigger>

                {/* Close button on desktop in the toolbar */}
                <Button
                  variant="outline"
                  size="icon-lg"
                  onPress={() => onOpenChange(false)}
                  className="rounded-full hover:bg-muted text-muted-foreground transition-colors ml-2 hidden sm:inline-flex"
                  isDisabled={isPending}
                > <X className="w-5 h-5" /></Button>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex flex-1 overflow-hidden">
          <div className="min-h-0 flex flex-1 min-w-0 flex-col px-4 py-1 sm:px-6">
            {renderHeavyContent ? (
            <FieldGroup className="min-h-0 flex-1">
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => onActiveTabChange(key as PreviewTab)}
                className="flex flex-col min-h-0 flex-1 gap-3"
              >
                <TabsList className="h-9">
                  <TabsTrigger id="tree">
                    <FolderTree data-icon="inline-start" />
                    Tree
                  </TabsTrigger>
                  <TabsTrigger id="graph">
                    <Network data-icon="inline-start" />
                    Graph
                  </TabsTrigger>
                  <TabsTrigger id="json">
                    <FileJson data-icon="inline-start" />
                    JSON
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  id="tree"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center"><Spinner className="w-8 h-8 text-muted-foreground/50" /></div>}>
                    <FirestoreJsonTreeViewer draft={draft} onDraftChange={onDraftChange} />
                  </Suspense>
                </TabsContent>

                <TabsContent
                  id="graph"
                  className="min-h-0 flex-1 flex-col"
                >
                  <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center"><Spinner className="w-8 h-8 text-muted-foreground/50" /></div>}>
                    <FirestoreJsonGraphViewer draft={draft} />
                  </Suspense>
                </TabsContent>

                <TabsContent id="json" className="flex min-h-0 flex-1 flex-col gap-3">
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
                        onPress={handleFormatJson}
                        isDisabled={isPending}
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
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <Spinner className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* FFP-102: save mode, the pending-change preview, and the delete action, grouped as a
              persistent side panel on wide screens; folded back under the tabs below lg. */}
          <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-muted/20 p-4">
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Save mode
              </span>
              <ToggleGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[saveMode]}
                onSelectionChange={(keys) => onSaveModeChange([...keys][0] as WriteMode)}
                spacing={0}
                size="sm"
                isDisabled={isPending}
                className="grid grid-cols-2 rounded-md overflow-hidden border bg-card"
                aria-label="Save mode"
              >
                <ToggleGroupItem id="MERGE">
                  <span title="Merge: only submitted fields change; removed fields are deleted explicitly">Merge</span>
                </ToggleGroupItem>
                <ToggleGroupItem id="REPLACE">
                  <span title="Replace: the draft becomes the entire document">Replace</span>
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                {saveMode === "MERGE"
                  ? "Merge updates the submitted fields and deletes removed fields explicitly."
                  : "Replace makes this draft the entire document; omitted fields are removed."}
              </p>
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pending changes
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="flex flex-col items-center gap-0.5 rounded-lg border bg-card px-1.5 py-2">
                  <span className="font-mono text-sm font-semibold leading-none">{addedCount}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Added
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 rounded-lg border bg-card px-1.5 py-2">
                  <span className="font-mono text-sm font-semibold leading-none">{changedCount}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Changed
                  </span>
                </div>
                <div className="flex flex-col items-center gap-0.5 rounded-lg border bg-card px-1.5 py-2">
                  <span className="font-mono text-sm font-semibold leading-none">{deletedCount}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-destructive" />
                    Deleted
                  </span>
                </div>
              </div>
              {writePreviewError ? (
                <p className="text-xs text-destructive">{writePreviewError}</p>
              ) : (
                <p className="text-xs text-muted-foreground" data-testid="write-preview-summary">
                  {`This save will add ${addedCount}, change ${changedCount}, and delete ${deletedCount} field(s).`}
                  {writePreview && writePreview.deletedFields.length > 0
                    ? ` Deleting: ${writePreview.deletedFields.join(", ")}`
                    : ""}
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Danger zone
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-center border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onPress={openDeleteConfirm}
                isDisabled={isPending || pathIsInvalid}
              >
                {busyAction === "delete" ? <Spinner className="mr-1.5" /> : <Trash2 data-icon="inline-start" />}
                {busyAction === "delete" ? "Deleting..." : "Delete document"}
              </Button>
            </div>
          </aside>
          </div>

          {/* Below lg, the aside folds back under the tabs so save mode and delete stay reachable. */}
          <div className="border-t px-4 py-2 sm:px-6 text-xs text-muted-foreground space-y-1 lg:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">Save mode:</span>
              <ToggleGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[saveMode]}
                onSelectionChange={(keys) => onSaveModeChange([...keys][0] as WriteMode)}
                spacing={0}
                size="sm"
                isDisabled={isPending}
                className="rounded-md overflow-hidden border"
                aria-label="Save mode"
              >
                <ToggleGroupItem id="MERGE">
                  <span title="Merge: only submitted fields change; removed fields are deleted explicitly">Merge</span>
                </ToggleGroupItem>
                <ToggleGroupItem id="REPLACE">
                  <span title="Replace: the draft becomes the entire document">Replace</span>
                </ToggleGroupItem>
              </ToggleGroup>
              <span>
                {saveMode === "MERGE"
                  ? "Merge updates the submitted fields and deletes removed fields explicitly."
                  : "Replace makes this draft the entire document; omitted fields are removed."}
              </span>
            </div>
            {writePreviewError ? (
              <p className="text-destructive">{writePreviewError}</p>
            ) : writePreview ? (
              <p>
                {`This save will add ${addedCount}, change ${changedCount}, and delete ${deletedCount} field(s).`}
                {writePreview.deletedFields.length > 0
                  ? ` Deleting: ${writePreview.deletedFields.join(", ")}`
                  : ""}
              </p>
            ) : null}
          </div>

          <SheetFooter className="border-t sm:flex-row sm:flex-wrap items-center sm:justify-between gap-3 px-4 py-2 sm:px-6 shrink-0 ">
            <div className="flex w-full sm:w-auto flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="lg:hidden"
                onPress={openDeleteConfirm}
                isDisabled={isPending || pathIsInvalid}
              >
                {busyAction === "delete" ? <Spinner className="mr-1.5" /> : null}
                {busyAction === "delete" ? "Deleting..." : "Delete Doc"}
              </Button>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {hasPendingChanges ? (
                  <>
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    {addedCount + changedCount + deletedCount} pending change
                    {addedCount + changedCount + deletedCount === 1 ? "" : "s"}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    No unsaved changes
                  </>
                )}
              </span>
            </div>
            <div className="flex w-full sm:w-auto flex-row items-center gap-2">
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onPress={closePanel} isDisabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                variant={saveMode === "REPLACE" ? "destructive" : "default"}
                onPress={handleSave}
                isDisabled={isPending || jsonHasValidationErrors}
              >
                {busyAction === "update" ? <Spinner className="mr-1.5" /> : null}
                {busyAction === "update"
                  ? "Saving..."
                  : saveMode === "MERGE"
                    ? "Save (Merge)"
                    : "Replace Document"}
              </Button>
            </div>
          </SheetFooter>
      </Sheet>

      <AlertDialog isOpen={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen} size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>
            This action permanently deletes the current document.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onPress={handleDeleteConfirm}
            isDisabled={isPending}
          >
            Confirm Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialog>
    </>
  )
}
