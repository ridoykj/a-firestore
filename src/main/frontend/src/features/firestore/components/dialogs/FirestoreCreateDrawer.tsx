import { lazy, Suspense, useMemo, useState } from "react"
import type { PreviewValidationSummary } from "@/features/firestore/schemas/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Button } from "@/shadcn/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/shadcn/components/ui/field"
import { Sheet, SheetContent, SheetHeader } from "@/shadcn/components/ui/sheet"
import { Input } from "@/shadcn/components/ui/input"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { parseJsonPayload, pathIsCollection, normalizePath } from "@/features/firestore/api/firestore-utils"
import { FilePlus2, RefreshCcw, WandSparkles, X } from "lucide-react"

const FirestoreJsonCodeEditor = lazy(async () => {
  const module = await import("@/features/firestore/components/viewers/FirestoreJsonCodeEditor")
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[90%]! sm:w-[85%]! sm:max-w-[85%]! p-0 gap-0 flex flex-col overflow-y-auto shadow-2xl"
      >
        <SheetHeader className="p-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <div className="flex items-start justify-between w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <FilePlus2 className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Create Document
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => onOpenChange(false)}
                className="sm:hidden -mr-1.5 rounded-full text-muted-foreground shrink-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="icon-lg"
                onClick={() => onOpenChange(false)}
                className="rounded-full hover:bg-muted text-muted-foreground transition-colors ml-2 hidden sm:inline-flex"
                disabled={isSubmitting}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 min-w-0 flex flex-1 flex-col px-2 py-1 sm:px-4">
          <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col gap-4 pb-1">
            <FieldSet className="rounded-lg border bg-card py-0 px-4 shrink-0">
              <FieldLegend>Document Location</FieldLegend>
              <FieldGroup className="mt-2 gap-4 flex-col sm:flex-row">
                <Field data-invalid={pathMissing || pathInvalid}>
                  <FieldLabel htmlFor="create-drawer-collection-path">
                    Collection Path
                    <span className="text-destructive" aria-hidden>
                      {" "}
                      *
                    </span>
                    <span className="sr-only">required</span>
                  </FieldLabel>
                  <Input
                    id="create-drawer-collection-path"
                    className="h-9 font-mono text-sm"
                    value={collectionPath}
                    onChange={(event) => onCollectionPathChange(event.target.value)}
                    placeholder="users or users/a1/posts"
                    disabled={isSubmitting}
                  />
                  <FieldDescription>
                    Path must contain an odd number of segments (for example `users` or
                    `users/a1/posts`).
                  </FieldDescription>
                  {pathMissing ? (
                    <FieldError className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      Collection path is required.
                    </FieldError>
                  ) : null}
                  {pathInvalid ? (
                    <FieldError className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      Collection path must contain an odd number of segments.
                    </FieldError>
                  ) : null}
                </Field>

                <Field data-invalid={docIdInvalid}>
                  <FieldLabel htmlFor="create-drawer-document-id">Document ID (optional)</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="create-drawer-document-id"
                      className="min-w-0 h-9 flex-1 font-mono text-sm"
                      value={documentId}
                      onChange={(event) => onDocumentIdChange(event.target.value)}
                      placeholder="Auto-generate if left empty (for example a1B2c3D4)"
                      disabled={isSubmitting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onGenerateDocumentId}
                      disabled={isSubmitting}
                      className="h-9 sm:w-auto"
                    >
                      Generate ID
                    </Button>
                  </div>
                  <FieldDescription>
                    Leave empty to use Firestore auto-ID (`add` semantics). Provide an ID for `set`
                    semantics.
                  </FieldDescription>
                  {docIdInvalid ? (
                    <FieldError className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      Document ID cannot contain '/' and cannot be '.' or '..'.
                    </FieldError>
                  ) : null}
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet className="min-h-0 min-w-0 flex-1 rounded-lg border bg-card p-2 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                <FieldLegend>
                  JSON Payload
                  <span className="text-destructive" aria-hidden>
                    {" "}
                    *
                  </span>
                  <span className="sr-only">required</span>
                </FieldLegend>
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
              <FieldDescription>
                Enter a valid JSON object. Your payload is validated before create.
              </FieldDescription>

              <Field
                data-invalid={Boolean(semanticJsonErrorMessage) || jsonHasSyntaxErrors}
                className="mt-2 min-h-0 min-w-0 flex-1 flex flex-col"
              >
                <Suspense fallback={<Skeleton className="h-full min-h-0 min-w-0 w-full flex-1" />}>
                  <FirestoreJsonCodeEditor
                    className="min-h-0 min-w-0 flex-1"
                    modelPath={editorModelPath}
                    value={payload}
                    onChange={onPayloadChange}
                    theme="dark"
                    formatRequestVersion={formatRequestVersion}
                    onValidationChange={setValidationSummary}
                    disabled={isSubmitting}
                  />
                </Suspense>
                {semanticJsonErrorMessage ? (
                  <FieldError className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                    {semanticJsonErrorMessage}
                  </FieldError>
                ) : null}
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
            </FieldSet>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-center sm:justify-end gap-3 border-t border-border px-4 py-2 sm:px-4 shrink-0 bg-background">
          <Button type="button" variant="ghost" onClick={onDiscardDraft} disabled={isSubmitting} className="w-full sm:w-auto">
            <RefreshCcw className="w-4 h-4 mr-1.5" />
            Discard Draft
          </Button>
          <div className="flex w-full sm:w-auto flex-row items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onSubmit} disabled={!canSubmit} className="flex-1 sm:flex-none shadow-sm">
              {isSubmitting ? <Spinner className="mr-1.5" /> : null}
              {isSubmitting ? "Creating..." : "Create Document"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
