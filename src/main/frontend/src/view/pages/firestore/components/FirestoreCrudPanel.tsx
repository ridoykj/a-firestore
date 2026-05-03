import { useMemo, useState } from "react"
import type { CrudBusy, StatusMessage } from "@/dto/firestore/FirestoreSchema"
import { CheckCircle2, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Button } from "@/shadcn/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shadcn/components/ui/field"
import { Input } from "@/shadcn/components/ui/input"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Textarea } from "@/shadcn/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"

type FirestoreCrudPanelProps = {
  createCollectionPath: string
  setCreateCollectionPath: (value: string) => void
  createPayload: string
  setCreatePayload: (value: string) => void
  updateDocumentPath: string
  setUpdateDocumentPath: (value: string) => void
  updatePayload: string
  setUpdatePayload: (value: string) => void
  replaceDocumentPath: string
  setReplaceDocumentPath: (value: string) => void
  replacePayload: string
  setReplacePayload: (value: string) => void
  deletePath: string
  setDeletePath: (value: string) => void
  crudBusy: CrudBusy
  actionStatus: StatusMessage | null
  requestedAction: Exclude<CrudBusy, null> | null
  onRequestedActionHandled: () => void
  onCreate: () => void
  onUpdate: () => void
  onReplace: () => void
  onDelete: () => void
}

type CrudAction = Exclude<CrudBusy, null>
type AttemptState = Record<CrudAction, boolean>

const INITIAL_ATTEMPTS: AttemptState = {
  create: false,
  update: false,
  replace: false,
  delete: false,
}

function statusBelongsToAction(status: StatusMessage, action: CrudAction) {
  const message = status.message.toLowerCase()
  if (action === "create") {
    return message.includes("create") || message.includes("collection path")
  }
  if (action === "update") {
    return message.includes("update") || message.includes("document path")
  }
  if (action === "replace") {
    return message.includes("replace") || message.includes("document path")
  }
  return message.includes("delete") || message.includes("document path")
}

export function FirestoreCrudPanel({
  createCollectionPath,
  setCreateCollectionPath,
  createPayload,
  setCreatePayload,
  updateDocumentPath,
  setUpdateDocumentPath,
  updatePayload,
  setUpdatePayload,
  replaceDocumentPath,
  setReplaceDocumentPath,
  replacePayload,
  setReplacePayload,
  deletePath,
  setDeletePath,
  crudBusy,
  actionStatus,
  requestedAction,
  onRequestedActionHandled,
  onCreate,
  onUpdate,
  onReplace,
  onDelete,
}: FirestoreCrudPanelProps) {
  const isMobile = useIsMobile()
  const [attempted, setAttempted] = useState<AttemptState>(INITIAL_ATTEMPTS)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  const activeAction = requestedAction

  const statusMessage = actionStatus?.message.toLowerCase() ?? ""
  const statusForActiveAction = useMemo(() => {
    if (!actionStatus || !activeAction) {
      return null
    }
    return statusBelongsToAction(actionStatus, activeAction) ? actionStatus : null
  }, [actionStatus, activeAction])

  const isPending = activeAction ? crudBusy === activeAction : false
  const isCreatePathInvalidFromStatus =
    statusForActiveAction?.tone !== "success" && statusMessage.includes("collection path")
  const isCreatePayloadInvalidFromStatus =
    statusForActiveAction?.tone !== "success" &&
    (statusMessage.includes("payload") || statusMessage.includes("json"))

  const isDocumentPathInvalidFromStatus =
    statusForActiveAction?.tone !== "success" && statusMessage.includes("document path")
  const isDocumentPayloadInvalidFromStatus =
    statusForActiveAction?.tone !== "success" &&
    (statusMessage.includes("payload") || statusMessage.includes("json"))

  const createPathMissing = attempted.create && !createCollectionPath.trim()
  const createPayloadMissing = attempted.create && !createPayload.trim()
  const updatePathMissing = attempted.update && !updateDocumentPath.trim()
  const updatePayloadMissing = attempted.update && !updatePayload.trim()
  const replacePathMissing = attempted.replace && !replaceDocumentPath.trim()
  const replacePayloadMissing = attempted.replace && !replacePayload.trim()
  const deletePathMissing = attempted.delete && !deletePath.trim()
  const deleteConfirmationInvalid = attempted.delete && deleteConfirmation.trim() !== "DELETE"

  function closeActionModal() {
    if (isPending) {
      return
    }
    onRequestedActionHandled()
    setAttempted(INITIAL_ATTEMPTS)
    setDeleteConfirmation("")
  }

  function updateOpenState(nextOpen: boolean) {
    if (nextOpen) {
      return
    }
    closeActionModal()
  }

  function preventCloseWhilePending(event: Event) {
    if (!isPending) {
      return
    }
    event.preventDefault()
  }

  function renderStatusAlert() {
    if (!statusForActiveAction) {
      return null
    }
    return (
      <Alert variant={statusForActiveAction.tone === "error" ? "destructive" : "default"}>
        <AlertTitle>
          {statusForActiveAction.tone === "success"
            ? "Success"
            : statusForActiveAction.tone === "warning"
              ? "Needs Attention"
              : "Request Failed"}
        </AlertTitle>
        <AlertDescription>{statusForActiveAction.message}</AlertDescription>
      </Alert>
    )
  }

  function handleCreateSubmit() {
    setAttempted((prev) => ({ ...prev, create: true }))
    if (!createCollectionPath.trim() || !createPayload.trim()) {
      return
    }
    onCreate()
  }

  function handleUpdateSubmit() {
    setAttempted((prev) => ({ ...prev, update: true }))
    if (!updateDocumentPath.trim() || !updatePayload.trim()) {
      return
    }
    onUpdate()
  }

  function handleReplaceSubmit() {
    setAttempted((prev) => ({ ...prev, replace: true }))
    if (!replaceDocumentPath.trim() || !replacePayload.trim()) {
      return
    }
    onReplace()
  }

  function handleDeleteSubmit() {
    setAttempted((prev) => ({ ...prev, delete: true }))
    if (!deletePath.trim() || deleteConfirmation.trim() !== "DELETE") {
      return
    }
    onDelete()
  }

  function renderCreateContent() {
    return (
      <FieldGroup>
        <Field data-invalid={createPathMissing || isCreatePathInvalidFromStatus}>
          <FieldLabel htmlFor="create-path">Collection Path</FieldLabel>
          <Input
            id="create-path"
            aria-invalid={createPathMissing || isCreatePathInvalidFromStatus}
            className="font-mono text-xs"
            value={createCollectionPath}
            onChange={(event) => setCreateCollectionPath(event.target.value)}
            placeholder="users"
            disabled={isPending}
          />
          <FieldDescription>Use an odd-segment path (e.g., `users`).</FieldDescription>
          {createPathMissing ? <FieldError>Collection path is required.</FieldError> : null}
        </Field>

        <Field data-invalid={createPayloadMissing || isCreatePayloadInvalidFromStatus}>
          <FieldLabel htmlFor="create-payload">JSON Payload</FieldLabel>
          <Textarea
            id="create-payload"
            aria-invalid={createPayloadMissing || isCreatePayloadInvalidFromStatus}
            value={createPayload}
            onChange={(event) => setCreatePayload(event.target.value)}
            className="min-h-[200px] font-mono text-xs"
            disabled={isPending}
            spellCheck={false}
          />
          {createPayloadMissing ? <FieldError>JSON payload is required.</FieldError> : null}
        </Field>
      </FieldGroup>
    )
  }

  function renderUpdateContent() {
    return (
      <FieldGroup>
        <Field data-invalid={updatePathMissing || isDocumentPathInvalidFromStatus}>
          <FieldLabel htmlFor="update-path">Document Path</FieldLabel>
          <Input
            id="update-path"
            aria-invalid={updatePathMissing || isDocumentPathInvalidFromStatus}
            className="font-mono text-xs"
            value={updateDocumentPath}
            onChange={(event) => setUpdateDocumentPath(event.target.value)}
            placeholder="users/user_123"
            disabled={isPending}
          />
          <FieldDescription>Use an even-segment path for a document.</FieldDescription>
          {updatePathMissing ? <FieldError>Document path is required.</FieldError> : null}
        </Field>

        <Field data-invalid={updatePayloadMissing || isDocumentPayloadInvalidFromStatus}>
          <FieldLabel htmlFor="update-payload">JSON Payload</FieldLabel>
          <Textarea
            id="update-payload"
            aria-invalid={updatePayloadMissing || isDocumentPayloadInvalidFromStatus}
            value={updatePayload}
            onChange={(event) => setUpdatePayload(event.target.value)}
            className="min-h-[200px] font-mono text-xs"
            disabled={isPending}
            spellCheck={false}
          />
          <FieldDescription>Merge update modifies only provided fields.</FieldDescription>
          {updatePayloadMissing ? <FieldError>JSON payload is required.</FieldError> : null}
        </Field>
      </FieldGroup>
    )
  }

  function renderReplaceContent() {
    return (
      <FieldGroup>
        <Field data-invalid={replacePathMissing || isDocumentPathInvalidFromStatus}>
          <FieldLabel htmlFor="replace-path">Document Path</FieldLabel>
          <Input
            id="replace-path"
            aria-invalid={replacePathMissing || isDocumentPathInvalidFromStatus}
            className="font-mono text-xs"
            value={replaceDocumentPath}
            onChange={(event) => setReplaceDocumentPath(event.target.value)}
            placeholder="users/user_123"
            disabled={isPending}
          />
          <FieldDescription>Use an even-segment path for a document.</FieldDescription>
          {replacePathMissing ? <FieldError>Document path is required.</FieldError> : null}
        </Field>

        <Field data-invalid={replacePayloadMissing || isDocumentPayloadInvalidFromStatus}>
          <FieldLabel htmlFor="replace-payload">JSON Payload</FieldLabel>
          <Textarea
            id="replace-payload"
            aria-invalid={replacePayloadMissing || isDocumentPayloadInvalidFromStatus}
            value={replacePayload}
            onChange={(event) => setReplacePayload(event.target.value)}
            className="min-h-[200px] font-mono text-xs"
            disabled={isPending}
            spellCheck={false}
          />
          <FieldDescription>Replace overwrites the full document payload.</FieldDescription>
          {replacePayloadMissing ? <FieldError>JSON payload is required.</FieldError> : null}
        </Field>
      </FieldGroup>
    )
  }

  function renderDeleteContent() {
    return (
      <FieldGroup>
        <Field data-invalid={deletePathMissing || isDocumentPathInvalidFromStatus}>
          <FieldLabel htmlFor="delete-path">Document Path</FieldLabel>
          <Input
            id="delete-path"
            aria-invalid={deletePathMissing || isDocumentPathInvalidFromStatus}
            className="font-mono text-xs"
            value={deletePath}
            onChange={(event) => setDeletePath(event.target.value)}
            placeholder="users/user_123"
            disabled={isPending}
          />
          <FieldDescription>Deletion is permanent and cannot be undone.</FieldDescription>
          {deletePathMissing ? <FieldError>Document path is required.</FieldError> : null}
        </Field>

        <Field data-invalid={deleteConfirmationInvalid}>
          <FieldLabel htmlFor="delete-confirm">Type DELETE to confirm</FieldLabel>
          <Input
            id="delete-confirm"
            aria-invalid={deleteConfirmationInvalid}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder="DELETE"
            disabled={isPending}
          />
          {deleteConfirmationInvalid ? (
            <FieldError>Enter DELETE exactly to enable deletion.</FieldError>
          ) : null}
        </Field>

        <Alert variant="destructive">
          <AlertTitle>Danger Zone</AlertTitle>
          <AlertDescription>This action permanently removes the selected document.</AlertDescription>
        </Alert>
      </FieldGroup>
    )
  }

  const modalOpen = activeAction !== null

  const modalTitle =
    activeAction === "create"
      ? "Create Document"
      : activeAction === "update"
        ? "Update Document (Merge)"
        : activeAction === "replace"
          ? "Replace Document"
          : "Delete Document"

  const modalDescription =
    activeAction === "create"
      ? "Add a new document to a collection using JSON payload data."
      : activeAction === "update"
        ? "Merge selected fields into an existing document."
        : activeAction === "replace"
          ? "Overwrite the entire document with the provided JSON payload."
          : "Remove a document after explicit confirmation."

  const modalSubmitLabel =
    activeAction === "create"
      ? "Create"
      : activeAction === "update"
        ? "Update"
        : activeAction === "replace"
          ? "Replace"
          : "Delete"

  const modalPendingLabel =
    activeAction === "create"
      ? "Creating..."
      : activeAction === "update"
        ? "Updating..."
        : activeAction === "replace"
          ? "Replacing..."
          : "Deleting..."

  const modalBody =
    activeAction === "create"
      ? renderCreateContent()
      : activeAction === "update"
        ? renderUpdateContent()
        : activeAction === "replace"
          ? renderReplaceContent()
          : renderDeleteContent()

  const handleSubmit =
    activeAction === "create"
      ? handleCreateSubmit
      : activeAction === "update"
        ? handleUpdateSubmit
        : activeAction === "replace"
          ? handleReplaceSubmit
          : handleDeleteSubmit

  const submitVariant = activeAction === "delete" ? "destructive" : "default"

  const modalContent = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{modalBody}</div>
      <div className="border-t px-4 py-3">
        <FieldGroup>
          {renderStatusAlert()}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={closeActionModal} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={submitVariant}
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? <Spinner data-icon="inline-start" /> : null}
              {isPending ? modalPendingLabel : modalSubmitLabel}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </div>
    </>
  )

  return (
    <>
      {isMobile ? (
        <Sheet open={modalOpen} onOpenChange={updateOpenState}>
          <SheetContent
            side="bottom"
            className="h-dvh max-h-dvh w-full max-w-none gap-0 rounded-none border-0 p-0 sm:max-w-none"
            showCloseButton={!isPending}
            onEscapeKeyDown={preventCloseWhilePending}
            onInteractOutside={preventCloseWhilePending}
          >
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="flex items-center gap-2">
                {activeAction === "delete" ? <Trash2 data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
                {modalTitle}
              </SheetTitle>
              <SheetDescription>{modalDescription}</SheetDescription>
            </SheetHeader>
            {modalContent}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={modalOpen} onOpenChange={updateOpenState}>
          <DialogContent
            className="max-h-[86vh] max-w-3xl gap-0 p-0"
            showCloseButton={!isPending}
            onEscapeKeyDown={preventCloseWhilePending}
            onInteractOutside={preventCloseWhilePending}
          >
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle className="flex items-center gap-2">
                {activeAction === "delete" ? <Trash2 data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
                {modalTitle}
              </DialogTitle>
              <DialogDescription>{modalDescription}</DialogDescription>
            </DialogHeader>
            {modalContent}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
