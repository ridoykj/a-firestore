import { lazy, Suspense, useMemo, useState } from "react"
import type { PreviewValidationSummary, StatusMessage } from "@/dto/firestore/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Button } from "@/shadcn/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/shadcn/components/ui/field"
import { Input } from "@/shadcn/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { parseJsonPayload, pathIsCollection, normalizePath } from "@/view/pages/firestore/lib/firestore-utils"
import { FilePlus2, RefreshCcw, WandSparkles } from "lucide-react"

const FirestoreJsonCodeEditor = lazy(async () => {
  const module = await import("@/view/pages/firestore/components/FirestoreJsonCodeEditor")
  return { default: module.FirestoreJsonCodeEditor }
})

const EMPTY_VALIDATION: PreviewValidationSummary = {
  errorCount: 0,
  warningCount: 0,
  firstErrorMessage: "",
}

type FirestoreCreateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionPath: string
  onCollectionPathChange: (value: string) => void
  documentId: string
  onDocumentIdChange: (value: string) => void
  payload: string
  onPayloadChange: (value: string) => void
  status: StatusMessage | null
  isSubmitting: boolean
  onGenerateDocumentId: () => void
  onSubmit: () => void
  onDiscardDraft: () => void
}

export function FirestoreCreateDrawer({
  open,
  onOpenChange,
  collectionPath,
  onCollectionPathChange,
  documentId,
  onDocumentIdChange,
  payload,
  onPayloadChange,
  status,
  isSubmitting,
  onGenerateDocumentId,
  onSubmit,
  onDiscardDraft,
}: FirestoreCreateDrawerProps) {
  const [formatRequestVersion, setFormatRequestVersion] = useState(0)
  const [validationSummary, setValidationSummary] =
    useState<PreviewValidationSummary>(EMPTY_VALIDATION)

  const normalizedPath = useMemo(() => normalizePath(collectionPath), [collectionPath])
  const normalizedDocId = useMemo(() => documentId.trim(), [documentId])
  const editorModelPath = useMemo(
    () => `create/${normalizedPath || "collection"}/${normalizedDocId || "auto-id"}`,
    [normalizedDocId, normalizedPath],
  )

  const pathMissing = collectionPath.trim().length === 0
  const pathInvalid = !pathMissing && !pathIsCollection(normalizedPath)
  const docIdInvalid =
    normalizedDocId.length > 0 &&
    (normalizedDocId.includes("/") || normalizedDocId === "." || normalizedDocId === "..")

  const semanticJsonErrorMessage = useMemo(() => {
    try {
      parseJsonPayload(payload)
      return ""
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid JSON payload."
    }
  }, [payload])
  const jsonHasSyntaxErrors = validationSummary.errorCount > 0

  const canSubmit =
    !isSubmitting &&
    !pathMissing &&
    !pathInvalid &&
    !docIdInvalid &&
    !jsonHasSyntaxErrors &&
    !semanticJsonErrorMessage

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="h-dvh max-h-dvh gap-0 rounded-none border-l p-0 data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:sm:w-[75vw] data-[side=right]:sm:max-w-none"
        showCloseButton={!isSubmitting}
        onEscapeKeyDown={(event) => {
          if (isSubmitting) {
            event.preventDefault()
          }
        }}
        onInteractOutside={(event) => {
          if (isSubmitting) {
            event.preventDefault()
          }
        }}
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="inline-flex items-center gap-2">
            <FilePlus2 data-icon="inline-start" />
            Create Document
          </SheetTitle>
          <SheetDescription>
            Create a document in any collection path. If the collection does not exist, Firestore creates it on first write.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <FieldGroup className="min-h-0 flex-1">
            <Field data-invalid={pathMissing || pathInvalid}>
              <FieldLabel htmlFor="create-drawer-collection-path">Collection Path</FieldLabel>
              <Input
                id="create-drawer-collection-path"
                className="font-mono text-xs"
                value={collectionPath}
                onChange={(event) => onCollectionPathChange(event.target.value)}
                placeholder="users"
                disabled={isSubmitting}
              />
              <FieldDescription>Path must contain an odd number of segments (for example `users` or `users/a1/posts`).</FieldDescription>
              {pathMissing ? <FieldError>Collection path is required.</FieldError> : null}
              {pathInvalid ? (
                <FieldError>Collection path must contain an odd number of segments.</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={docIdInvalid}>
              <FieldLabel htmlFor="create-drawer-document-id">Document ID (optional)</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="create-drawer-document-id"
                  className="min-w-0 flex-1 font-mono text-xs"
                  value={documentId}
                  onChange={(event) => onDocumentIdChange(event.target.value)}
                  placeholder="Auto-generate if left empty"
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onGenerateDocumentId}
                  disabled={isSubmitting}
                >
                  Generate ID
                </Button>
              </div>
              <FieldDescription>
                Leave empty to use Firestore auto-ID (`add` semantics). Provide an ID for `set` semantics.
              </FieldDescription>
              {docIdInvalid ? (
                <FieldError>Document ID cannot contain '/' and cannot be '.' or '..'.</FieldError>
              ) : null}
            </Field>

            <Field
              data-invalid={Boolean(semanticJsonErrorMessage) || jsonHasSyntaxErrors}
              className="min-h-0 flex-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldLabel htmlFor="create-drawer-json-payload">JSON Payload</FieldLabel>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setFormatRequestVersion((value) => value + 1)}
                  disabled={isSubmitting}
                >
                  <WandSparkles data-icon="inline-start" />
                  Format JSON
                </Button>
              </div>
              <Suspense fallback={<Skeleton className="h-full min-h-[260px] w-full flex-1" />}>
                <FirestoreJsonCodeEditor
                  className="min-h-[260px] flex-1"
                  modelPath={editorModelPath}
                  value={payload}
                  onChange={onPayloadChange}
                  theme="dark"
                  formatRequestVersion={formatRequestVersion}
                  onValidationChange={setValidationSummary}
                  disabled={isSubmitting}
                />
              </Suspense>
              {semanticJsonErrorMessage ? <FieldError>{semanticJsonErrorMessage}</FieldError> : null}
              {jsonHasSyntaxErrors ? (
                <Alert variant="destructive">
                  <AlertTitle>Invalid JSON</AlertTitle>
                  <AlertDescription>
                    {validationSummary.firstErrorMessage ||
                      `${validationSummary.errorCount} JSON error(s) detected. Fix before creating.`}
                  </AlertDescription>
                </Alert>
              ) : null}
            </Field>

            {statusAlert}
          </FieldGroup>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Close
            </Button>
            <Button type="button" variant="ghost" onClick={onDiscardDraft} disabled={isSubmitting}>
              <RefreshCcw data-icon="inline-start" />
              Discard Draft
            </Button>
          </div>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit}>
            {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
            {isSubmitting ? "Creating..." : "Create Document"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
