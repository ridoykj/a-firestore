import { lazy, Suspense, useState } from "react"
import type {
  PreviewEditorTheme,
  PreviewValidationSummary,
  StatusMessage,
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
import { Badge } from "@/shadcn/components/ui/badge"
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
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import {
  CheckCircle2,
  Download,
  FileJson,
  FolderTree,
  Moon,
  Network,
  Sun,
  Upload,
  WandSparkles,
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
  status: StatusMessage | null
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
  status,
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
  const statusMessage = status?.message.toLowerCase() ?? ""

  const normalizedPath = normalizePath(documentPath)
  const pathIsInvalid = !normalizedPath || pathIsCollection(normalizedPath)
  const payloadMissing = attemptedJsonSubmit && !draft.trim()
  const payloadInvalidByStatus =
    status?.tone !== "success" &&
    (statusMessage.includes("payload") || statusMessage.includes("json"))
  const jsonHasValidationErrors = validation.errorCount > 0

  const statusAlert = status ? (
    <Alert variant={status.tone === "error" ? "destructive" : "default"}>
      <AlertTitle>
        {status.tone === "success"
          ? "Success"
          : status.tone === "warning"
            ? "Needs Attention"
            : "Request Failed"}
      </AlertTitle>
      <AlertDescription>{status.message}</AlertDescription>
    </Alert>
  ) : null

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

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="h-dvh max-h-dvh gap-0 rounded-none border-l p-0 data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:sm:w-[80vw] data-[side=right]:sm:max-w-none"
        >
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 data-icon="inline-start" />
                Document Preview
              </span>
              <Badge variant="outline">
                {activeTab === "json" ? "JSON Editor" : "Tree Preview"}
              </Badge>
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isPending || transferBusy || pathIsInvalid}
                    >
                      <Download data-icon="inline-start" />
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
                      size="xs"
                      variant="outline"
                      disabled={isPending || transferBusy || pathIsInvalid}
                    >
                      <Upload data-icon="inline-start" />
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

                <div className="flex items-center gap-1 rounded-md border bg-background p-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={editorTheme === "light" ? "secondary" : "ghost"}
                    onClick={() => onEditorThemeChange("light")}
                    disabled={isPending}
                  >
                    <Sun data-icon="inline-start" />
                    Light
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={editorTheme === "dark" ? "secondary" : "ghost"}
                    onClick={() => onEditorThemeChange("dark")}
                    disabled={isPending}
                  >
                    <Moon data-icon="inline-start" />
                    Dark
                  </Button>
                </div>
              </div>
            </SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {documentId} {documentPath ? `- ${documentPath}` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex flex-1 flex-col px-4 py-3">
            <FieldGroup className="min-h-0 flex-1">
              <Tabs
                value={activeTab}
                onValueChange={(value) => onActiveTabChange(value as PreviewTab)}
                className="min-h-0 flex-1 gap-3"
              >
                <TabsList variant="line">
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
                  className="min-h-0 flex-1"
                >
                  <FirestoreJsonTreeViewer draft={draft} />
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
                    data-invalid={payloadMissing || payloadInvalidByStatus || jsonHasValidationErrors}
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

              {statusAlert}
            </FieldGroup>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <Button type="button" variant="outline" onClick={closePanel} disabled={isPending}>
              Close
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || jsonHasValidationErrors}
              >
                {busyAction === "update" ? <Spinner data-icon="inline-start" /> : null}
                {busyAction === "update" ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={openDeleteConfirm}
                disabled={isPending || pathIsInvalid}
              >
                {busyAction === "delete" ? <Spinner data-icon="inline-start" /> : null}
                {busyAction === "delete" ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
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
