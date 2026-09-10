import { useRef, useState } from "react"
import { Radio, Square } from "lucide-react"

import { Button } from "@/shadcn/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import { Badge } from "@/shadcn/components/ui/badge"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"
import { cn } from "@/shadcn/lib/utils"
import type { FirestoreContext } from "@/features/firestore/api/firestore-service"
import { firestoreContextHeaders, normalizePath } from "@/features/firestore/api/firestore-utils"
import { streamSse } from "@/features/firestore/api/sse-client"

type WatchStatus = "idle" | "connecting" | "connected" | "error" | "closed"

type WatchEvent = { at: string; kind: string; summary: string }

const MAX_EVENTS = 100

type FirestoreWatchDialogProps = {
  context: FirestoreContext
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPath?: string
}

export function FirestoreWatchDialog({
  context,
  open,
  onOpenChange,
  initialPath = "",
}: FirestoreWatchDialogProps) {
  const [path, setPath] = useState(initialPath)
  const [status, setStatus] = useState<WatchStatus>("idle")
  const [events, setEvents] = useState<WatchEvent[]>([])
  const abortRef = useRef<AbortController | null>(null)

  function pushEvent(kind: string, summary: string) {
    // A wall-clock label is fine here (UI-only, not persisted).
    const at = new Date().toLocaleTimeString()
    setEvents((prev) => [{ at, kind, summary }, ...prev].slice(0, MAX_EVENTS))
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus("closed")
  }

  function start() {
    const normalized = normalizePath(path)
    if (!normalized) {
      setStatus("error")
      return
    }
    stop()
    const controller = new AbortController()
    abortRef.current = controller
    setEvents([])
    setStatus("connecting")

    const params = new URLSearchParams({ path: normalized, limit: "50" })
    void streamSse<Record<string, unknown>>(`/api/workbench/watch?${params.toString()}`, {
      signal: controller.signal,
      headers: firestoreContextHeaders(context.projectId, context.databaseId),
      onEvent({ name, data }) {
        if (name === "connected") {
          setStatus("connected")
          pushEvent("connected", `Watching ${String(data.kind)} ${String(data.path)}`)
        } else if (name === "error") {
          setStatus("error")
          pushEvent("error", String(data.message ?? "Listener error"))
        } else if (name === "change") {
          if (Array.isArray(data.changes)) {
            const changes = data.changes as Array<Record<string, unknown>>
            for (const change of changes) {
              pushEvent(String(change.changeType ?? "CHANGE"), String(change.path ?? ""))
            }
            if (changes.length === 0) {
              pushEvent("SNAPSHOT", `${String(data.size ?? 0)} document(s)`)
            }
          } else {
            pushEvent(data.exists ? "MODIFIED" : "REMOVED", String(data.path ?? ""))
          }
        }
      },
      onError() {
        setStatus("error")
      },
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      stop()
      setStatus("idle")
    }
    onOpenChange(nextOpen)
  }

  const isLive = status === "connected" || status === "connecting"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className={cn("size-5", isLive ? "text-emerald-500" : "text-muted-foreground")} />
            Real-time watch
          </DialogTitle>
          <DialogDescription>
            Stream live changes for a document or collection. This is read-only and never overwrites
            an unsaved editor draft.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label className="text-xs text-muted-foreground">Path</Label>
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="users or users/alice"
              className="font-mono text-sm"
              disabled={isLive}
            />
          </div>
          {isLive ? (
            <Button variant="outline" onClick={stop}>
              <Square data-icon="inline-start" />
              Stop
            </Button>
          ) : (
            <Button onClick={start}>
              <Radio data-icon="inline-start" />
              Watch
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge
            variant="secondary"
            className={cn(
              status === "connected" && "text-emerald-600 dark:text-emerald-400",
              status === "error" && "text-rose-600 dark:text-rose-400",
            )}
          >
            {status}
          </Badge>
          <span className="text-muted-foreground">{events.length} event(s)</span>
        </div>

        <ScrollArea className="max-h-72 rounded-lg border">
          {events.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No events yet. Start watching to see live changes.
            </p>
          ) : (
            <ul className="divide-y text-xs">
              {events.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-muted-foreground">{entry.at}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">{entry.kind}</Badge>
                  <span className="truncate font-mono">{entry.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
