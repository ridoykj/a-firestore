import type {
  PreviewEditorTheme,
  PreviewValidationSummary,
  TransferFormat,
} from "@/features/firestore/schemas/FirestoreSchema"
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
import {
  Sheet,
  SheetContent,
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
  Download,
  FileJson,
  FolderTree,
  Moon,
  Network,
  RefreshCw,
  Sun,
  Upload,
  WandSparkles,
  X
} from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"

const FirestoreJsonCodeEditor = lazy(async () => {
  const module = await import("@/features/firestore/components/FirestoreJsonCodeEditor")
  return { default: module.FirestoreJsonCodeEditor }
})

const FirestoreJsonTreeViewer = lazy(async () => {
  const module = await import("@/features/firestore/components/FirestoreJsonTreeViewer")
  return { default: module.FirestoreJsonTreeViewer }
})

const FirestoreJsonGraphViewer = lazy(async () => {
  const module = await import("@/features/firestore/components/FirestoreJsonGraphViewer")
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
  editorTheme: PreviewEditorTheme
  onEditorThemeChange: (value: PreviewEditorTheme) => void
  validation: PreviewValidationSummary
  onValidationChange: (summary: PreviewValidationSummary) => void
  onOpenChange: (open: boolean) => void
  onUpdate: (formattedDraft: string) => void
  onDelete: () => void
  onRefresh: () => void
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
  onRefresh,
  onExportDocument,
  onImportDocument,
  transferBusy = false,
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
      <Sheet open={open} onOpenChange={handleSheetOpenChange} >
        <SheetContent
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
                  onClick={() => onOpenChange(false)}
                  className="sm:hidden p-1.5 -mr-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-card"
                  onClick={onRefresh}
                  disabled={isPending || transferBusy || pathIsInvalid}
                  title="Refresh Document"
                >
                  <RefreshCw className={`mr-1.5 h-4 w-4 text-muted-foreground ${busyAction === "refresh" ? "animate-spin" : ""}`} />
                  Refresh
                </Button>

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

                <ToggleGroup
                  type="single"
                  value={editorTheme}
                  onValueChange={(value) => {
                    if (value) {
                      onEditorThemeChange(value as PreviewEditorTheme)
                    }
                  }}
                  // variant="outline"
                  spacing={0}
                  size="default"
                  disabled={isPending}
                  className="sm:ml-2 rounded-full overflow-hidden border"
                  aria-label="Editor theme"
                >
                  <ToggleGroupItem value="light" title="Light Theme" aria-label="Light theme">
                    <Sun className="w-3.5 h-3.5" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="dark" title="Dark Theme" aria-label="Dark theme">
                    <Moon className="w-3.5 h-3.5" />
                  </ToggleGroupItem>
                </ToggleGroup>

                {/* Close button on desktop in the toolbar */}
                <Button
                  variant="outline"
                  size="icon-lg"
                  onClick={() => onOpenChange(false)}
                  className="rounded-full hover:bg-muted text-muted-foreground transition-colors ml-2 hidden sm:inline-flex"
                  // className="hidden sm:inline-flex ml-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                  disabled={isPending}
                > <X className="w-5 h-5" /></Button>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex flex-1 flex-col px-4 py-1 sm:px-6">
            {renderHeavyContent ? (
            <FieldGroup className="min-h-0 flex-1">
              <Tabs
                defaultValue="tree"
                value={activeTab}
                onValueChange={(value) => onActiveTabChange(value as PreviewTab)}
                className="flex flex-col min-h-0 flex-1 gap-3"
              >
                <TabsList className="h-9">
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
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center"><Spinner className="w-8 h-8 text-muted-foreground/50" /></div>}>
                    <FirestoreJsonTreeViewer draft={draft} onDraftChange={onDraftChange} />
                  </Suspense>
                </TabsContent>

                <TabsContent
                  value="graph"
                  className="min-h-0 flex-1 flex-col"
                >
                  <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center"><Spinner className="w-8 h-8 text-muted-foreground/50" /></div>}>
                    <FirestoreJsonGraphViewer draft={draft} />
                  </Suspense>
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
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <Spinner className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
          </div>

          <SheetFooter className="border-t sm:flex-row sm:flex-wrap items-center sm:justify-between gap-3 px-4 py-2 sm:px-6 shrink-0 ">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={openDeleteConfirm}
              disabled={isPending || pathIsInvalid}
            >
              {busyAction === "delete" ? <Spinner className="mr-1.5" /> : null}
              {busyAction === "delete" ? "Deleting..." : "Delete Doc"}
            </Button>
            <div className="flex w-full sm:w-auto flex-row items-center gap-2">
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={closePanel} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                onClick={handleSave}
                disabled={isPending || jsonHasValidationErrors}
              >
                {busyAction === "update" ? <Spinner className="mr-1.5" /> : null}
                {busyAction === "update" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
