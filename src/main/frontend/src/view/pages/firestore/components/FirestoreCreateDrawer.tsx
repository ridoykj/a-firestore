import { lazy, Suspense, useMemo, useState } from "react"
import type { PreviewValidationSummary } from "@/dto/firestore/FirestoreSchema"
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
        className="h-dvh max-h-dvh gap-0 rounded-none border-l p-0 data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:sm:w-[85vw] data-[side=right]:sm:max-w-none"
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
        <SheetHeader className="border-b px-4 py-4">
          <SheetTitle className="inline-flex items-center gap-2">
            <FilePlus2 data-icon="inline-start" />
            Create Document
          </SheetTitle>
          <SheetDescription>
            Create a document in any collection path. If the collection does not exist, Firestore
            creates it on first write.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-col gap-4">
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-destructive">*</span> Required fields
              </div>

              <FieldSet className="rounded-lg border bg-card p-4">
                <FieldLegend>Document Location</FieldLegend>
                <FieldDescription>
                  Choose the destination collection and optional document ID.
                </FieldDescription>

                <FieldGroup className="mt-2 gap-4">
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

              <FieldSet className="min-h-0 flex-1 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  className="mt-2 min-h-0 flex-1"
                >
                  <Suspense fallback={<Skeleton className="h-full min-h-70 w-full flex-1" />}>
                    <FirestoreJsonCodeEditor
                      className="min-h-70 flex-1"
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

          <div className="flex flex-col gap-3 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="button" variant="ghost" onClick={onDiscardDraft} disabled={isSubmitting}>
                <RefreshCcw data-icon="inline-start" />
                Discard Draft
              </Button>
            </div>

            <Button type="button" onClick={onSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              {isSubmitting ? "Creating..." : "Create Document"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
