import { useState } from "react"
import { toast } from "sonner"
import { PlugZap, ShieldAlert, UploadCloud } from "lucide-react"

import { firestoreService } from "@/features/firestore/api/firestore-service"
import { useGcpStore, type ProjectTab } from "@/features/gcp/store/gcp-store"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import { normalizeDatabaseId } from "@/features/firestore/api/firestore-utils"

type FirestoreReconnectNoticeProps = {
  tab: ProjectTab
  onReattached: () => void
}

/**
 * FFP-201: shown when a workspace tab was restored from storage but has no live backend client
 * in this session. Credentials are never persisted, so cloud tabs require the service-account
 * JSON to be re-uploaded; emulator tabs can reconnect using the persisted host. Requests are
 * blocked until reattachment succeeds.
 */
export function FirestoreReconnectNotice({ tab, onReattached }: FirestoreReconnectNoticeProps) {
  const [credentialsFile, setCredentialsFile] = useState<File | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const isEmulator = tab.connectionMode === "emulator"
  const { setCredentialsFile: setSharedCredentialsFile } = useGcpStore()

  async function reconnectServiceAccount() {
    if (!credentialsFile) {
      toast.warning("Choose the service-account JSON to reconnect.")
      return
    }
    setReconnecting(true)
    try {
      await firestoreService.initFirestore(tab.projectId, credentialsFile, tab.databaseId)
      // The sidebar's Project ID/Database pickers read credentials from the shared store, not
      // this component's local state — without this, they stay disabled after a reconnect.
      setSharedCredentialsFile(credentialsFile)
      toast.success(`Reconnected to ${tab.label}.`)
      onReattached()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reconnect.")
    } finally {
      setReconnecting(false)
    }
  }

  async function reconnectEmulator() {
    const host = tab.emulatorHost?.trim()
    if (!host) {
      toast.error("This emulator tab is missing its host; remove and re-add it.")
      return
    }
    setReconnecting(true)
    try {
      await firestoreService.initEmulator(tab.projectId, tab.databaseId, host)
      toast.success(`Reconnected to emulator ${host}.`)
      onReattached()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reconnect to the emulator.")
    } finally {
      setReconnecting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold">Reconnect this workspace tab</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This tab was restored, but its connection is not active in this session. Its query and
          column preferences are kept locally &mdash; credentials are never saved.
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {tab.projectId}/{normalizeDatabaseId(tab.databaseId)}
        </p>

        {isEmulator ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs text-muted-foreground">
              Emulator host:{" "}
              <span className="font-mono">{tab.emulatorHost || "(unknown)"}</span>
            </p>
            <Button
              className="w-full"
              onClick={() => void reconnectEmulator()}
              disabled={reconnecting}
            >
              <PlugZap data-icon="inline-start" />
              {reconnecting ? "Reconnecting..." : "Reconnect to emulator"}
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">
              Re-upload the service-account JSON for this project
            </p>
            <Input
              type="file"
              accept=".json,application/json"
              onChange={(event) => setCredentialsFile(event.target.files?.[0] ?? null)}
              className="h-11 rounded-lg border-dashed bg-background text-sm"
            />
            <Button
              className="w-full"
              onClick={() => void reconnectServiceAccount()}
              disabled={reconnecting || !credentialsFile}
            >
              <UploadCloud data-icon="inline-start" />
              {reconnecting ? "Reconnecting..." : "Reconnect"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
