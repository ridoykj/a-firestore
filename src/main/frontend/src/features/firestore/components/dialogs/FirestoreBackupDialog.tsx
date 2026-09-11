import { useState } from "react"
import { toast } from "sonner"
import { DatabaseBackup, Download, ScanEye, Upload } from "lucide-react"

import { Button } from "@/shadcn/components/ui/button"
import {
  Dialog,
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
import { ToggleGroup, ToggleGroupItem } from "@/shadcn/components/ui/toggle-group"
import {
  firestoreService,
  type BackupArtifact,
  type FirestoreContext,
  type JobSnapshot,
} from "@/features/firestore/api/firestore-service"
import { streamJobEvents } from "@/features/firestore/api/job-client"
import { normalizePath } from "@/features/firestore/api/firestore-utils"
import { sanitizeFileNamePart, triggerTextDownload } from "@/features/firestore/api/firestore-transfer-utils"

type BackupMode = "backup" | "restore"
type ConflictPolicy = "MERGE" | "OVERWRITE" | "SKIP"

type FirestoreBackupDialogProps = {
  context: FirestoreContext
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPath?: string
}

function isArtifact(value: unknown): value is BackupArtifact {
  if (!value || typeof value !== "object") {
    return false
  }
  const artifact = value as Record<string, unknown>
  return typeof artifact.formatVersion === "number" && Array.isArray(artifact.documents)
}

export function FirestoreBackupDialog({
  context,
  open,
  onOpenChange,
  initialPath = "",
}: FirestoreBackupDialogProps) {
  const [mode, setMode] = useState<BackupMode>("backup")
  const [path, setPath] = useState(initialPath)
  const [limit, setLimit] = useState(5000)
  const [busy, setBusy] = useState(false)

  const [artifact, setArtifact] = useState<BackupArtifact | null>(null)
  const [artifactName, setArtifactName] = useState("")
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>("MERGE")
  const [progress, setProgress] = useState<JobSnapshot | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  async function downloadBackup() {
    const normalized = normalizePath(path)
    if (!normalized) {
      toast.error("Enter a document or collection path to back up.")
      return
    }
    setBusy(true)
    try {
      const result = await firestoreService.backup(context, normalized, limit)
      triggerTextDownload(
        `${sanitizeFileNamePart(normalized)}.backup.json`,
        JSON.stringify(result, null, 2),
        "application/json;charset=utf-8",
      )
      toast.success(`Backed up ${result.manifest.documentCount} document(s).`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Backup failed.")
    } finally {
      setBusy(false)
    }
  }

  async function onArtifactFile(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isArtifact(parsed)) {
        throw new Error("Not a valid backup artifact (missing formatVersion/documents).")
      }
      setArtifact(parsed)
      setArtifactName(file.name)
      setProgress(null)
    } catch (error) {
      setArtifact(null)
      toast.error(error instanceof Error ? error.message : "Could not read backup file.")
    }
  }

  async function runRestore(dryRun: boolean) {
    if (!artifact) {
      toast.warning("Choose a backup file first.")
      return
    }
    const documents = artifact.documents.map((document) => ({
      path: document.path,
      fields: document.fields,
    }))

    setBusy(true)
    setProgress(null)
    try {
      const { jobId } = await firestoreService.createRestoreJob(context, {
        documents,
        conflictPolicy,
        dryRun,
      })
      setActiveJobId(jobId)
      const final = await streamJobEvents(jobId, { onProgress: setProgress, context })
      setProgress(final)

      if (dryRun) {
        toast.message(`Dry run: ${documents.length} document(s) would be restored (${conflictPolicy}).`)
      } else if (final.status === "cancelled") {
        toast.warning(`Restore cancelled after ${final.committed} document(s).`)
      } else if (final.failed > 0) {
        toast.warning(`Restored ${final.committed}; ${final.failed} failed. Download the report for details.`)
      } else {
        toast.success(`Restored ${final.committed} document(s).`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed.")
    } finally {
      setBusy(false)
      setActiveJobId(null)
    }
  }

  async function cancelRestore() {
    if (activeJobId) {
      await firestoreService.cancelJob(activeJobId).catch(() => undefined)
    }
  }

  async function downloadReport() {
    if (!progress) {
      return
    }
    try {
      const report = await firestoreService.getJobReport(progress.jobId)
      triggerTextDownload(
        "restore-failures.json",
        JSON.stringify(report, null, 2),
        "application/json;charset=utf-8",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not fetch the report.")
    }
  }

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseBackup className="size-5 text-primary" />
            Backup &amp; restore
          </DialogTitle>
          <DialogDescription>
            Export a typed backup artifact or restore one into this connection with a conflict policy.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[mode]}
          onSelectionChange={(keys) => setMode([...keys][0] as BackupMode)}
          variant="outline"
          className="w-full"
        >
          <ToggleGroupItem id="backup" className="flex-1">Backup</ToggleGroupItem>
          <ToggleGroupItem id="restore" className="flex-1">Restore</ToggleGroupItem>
        </ToggleGroup>

        {mode === "backup" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Path (document or collection subtree)</Label>
              <Input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="users"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid w-40 gap-1.5">
              <Label className="text-xs text-muted-foreground">Max documents</Label>
              <Input
                type="number"
                value={limit}
                onChange={(event) => setLimit(Math.max(1, Math.min(50000, Number(event.target.value) || 1)))}
                className="text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              The artifact preserves native Firestore types and includes a manifest and format version.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Backup file</Label>
              <Input
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void onArtifactFile(file)
                  }
                }}
                className="text-sm"
              />
              {artifact ? (
                <p className="text-[11px] text-muted-foreground">
                  {artifactName}: {artifact.documents.length} document(s), format v{artifact.formatVersion}
                  {artifact.manifest?.path ? ` from ${artifact.manifest.path}` : ""}
                </p>
              ) : null}
            </div>
            <div className="grid w-48 gap-1.5">
              <Label className="text-xs text-muted-foreground">Conflict policy</Label>
              <Select selectedKey={conflictPolicy} onSelectionChange={(key) => setConflictPolicy(key as ConflictPolicy)}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="MERGE">Merge</SelectItem>
                  <SelectItem id="OVERWRITE">Overwrite (replace)</SelectItem>
                  <SelectItem id="SKIP">Skip existing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {progress ? (
              <div className="rounded-lg border p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{progress.status}</Badge>
                  <span>Committed: <strong>{progress.committed}</strong></span>
                  {progress.failed > 0 ? <span className="text-rose-500">Failed: {progress.failed}</span> : null}
                  {progress.total >= 0 ? <span className="text-muted-foreground">/ {progress.total}</span> : null}
                </div>
                {progress.failed > 0 ? (
                  <ScrollArea className="mt-2">
                    <Button variant="outline" size="sm" onPress={() => void downloadReport()}>
                      <Download data-icon="inline-start" />
                      Download failure report
                    </Button>
                  </ScrollArea>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {mode === "backup" ? (
            <Button onPress={() => void downloadBackup()} isDisabled={busy}>
              <Download data-icon="inline-start" />
              Download backup
            </Button>
          ) : (
            <>
              {activeJobId ? (
                <Button variant="ghost" onPress={() => void cancelRestore()}>
                  Cancel
                </Button>
              ) : null}
              <Button variant="outline" onPress={() => void runRestore(true)} isDisabled={busy || !artifact}>
                <ScanEye data-icon="inline-start" />
                Dry run
              </Button>
              <Button
                variant={conflictPolicy === "OVERWRITE" ? "destructive" : "default"}
                onPress={() => void runRestore(false)}
                isDisabled={busy || !artifact}
              >
                <Upload data-icon="inline-start" />
                Restore
              </Button>
            </>
          )}
        </DialogFooter>
    </Dialog>
  )
}
