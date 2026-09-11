import { useState } from "react"
import { Bookmark, Check, Download, History, Play, Star, Trash2, X } from "lucide-react"

import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"
import { cn } from "@/shadcn/lib/utils"
import { triggerTextDownload } from "@/features/firestore/api/firestore-transfer-utils"
import type { PersistedQueryState } from "@/features/firestore/api/query-state-storage"
import type { HistoryEntry, SavedQuery } from "@/features/firestore/api/saved-queries-storage"

type FirestoreSavedQueriesProps = {
  savedQueries: SavedQuery[]
  history: HistoryEntry[]
  onRun: (query: PersistedQueryState) => void
  onSaveCurrent: (name: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onToggleFavorite: (id: string) => void
  onClearHistory: () => void
}

type SectionTab = "saved" | "history"

function describeQuery(query: PersistedQueryState): string {
  const path = query.queryPath.replace(/^\//, "") || "(no path)"
  const filterCount = query.whereRows.filter((row) => row.field.trim()).length
  const parts = [path]
  if (query.collectionGroup) {
    parts.push("group")
  }
  if (filterCount > 0) {
    parts.push(`${filterCount} filter${filterCount === 1 ? "" : "s"}`)
  }
  return parts.join(" · ")
}

function exportQuery(name: string, query: PersistedQueryState) {
  const safeName = name.trim().replace(/[^a-z0-9-_]+/gi, "_") || "query"
  triggerTextDownload(
    `${safeName}.query.json`,
    JSON.stringify(query, null, 2),
    "application/json;charset=utf-8",
  )
}

export function FirestoreSavedQueries({
  savedQueries,
  history,
  onRun,
  onSaveCurrent,
  onDelete,
  onRename,
  onToggleFavorite,
  onClearHistory,
}: FirestoreSavedQueriesProps) {
  const [tab, setTab] = useState<SectionTab>("saved")
  const [saveName, setSaveName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  const sortedSaved = [...savedQueries].sort((a, b) => {
    if (a.favorite !== b.favorite) {
      return a.favorite ? -1 : 1
    }
    return b.createdAt - a.createdAt
  })

  function submitSave() {
    onSaveCurrent(saveName)
    setSaveName("")
  }

  function commitRename(id: string) {
    onRename(id, editingName)
    setEditingId(null)
    setEditingName("")
  }

  return (
    <div className="flex max-h-[45%] shrink-0 flex-col border-t border-border bg-muted/10">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex gap-1">
          <Button
            variant={tab === "saved" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-bold"
            onPress={() => setTab("saved")}
          >
            <Bookmark className="size-3.5" />
            Saved
          </Button>
          <Button
            variant={tab === "history" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] font-bold"
            onPress={() => setTab("history")}
          >
            <History className="size-3.5" />
            History
          </Button>
        </div>
        {tab === "history" && history.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px] text-muted-foreground"
            onPress={onClearHistory}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {tab === "saved" ? (
        <div className="flex items-center gap-1.5 px-3 py-2">
          <Input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitSave()
              }
            }}
            placeholder="Save current query as..."
            className="h-8 text-[11px]"
          />
          <Button size="sm" className="h-8 px-2 text-[11px]" onPress={submitSave}>
            Save
          </Button>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
        {tab === "saved" ? (
          sortedSaved.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              No saved queries yet.
            </p>
          ) : (
            <div className="space-y-1">
              {sortedSaved.map((entry) => (
                <div
                  key={entry.id}
                  className="group rounded-lg border border-transparent bg-card/60 px-2 py-1.5 hover:border-border"
                >
                  {editingId === entry.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") commitRename(entry.id)
                          if (event.key === "Escape") setEditingId(null)
                        }}
                        className="h-7 text-[11px]"
                      />
                      <Button variant="ghost" size="icon-xs" onPress={() => commitRename(entry.id)}>
                        <Check className="size-3.5 text-emerald-500" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onPress={() => setEditingId(null)}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span title={entry.favorite ? "Unfavorite" : "Favorite"}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onPress={() => onToggleFavorite(entry.id)}
                        >
                          <Star
                            className={cn(
                              "size-3.5",
                              entry.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
                            )}
                          />
                        </Button>
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onDoubleClick={() => {
                          setEditingId(entry.id)
                          setEditingName(entry.name)
                        }}
                        onClick={() => onRun(entry.query)}
                        title="Run query (double-click to rename)"
                      >
                        <span className="block truncate text-[11px] font-semibold">{entry.name}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {describeQuery(entry.query)}
                        </span>
                      </button>
                      <span title="Run">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onPress={() => onRun(entry.query)}
                        >
                          <Play className="size-3.5 text-primary" />
                        </Button>
                      </span>
                      <span title="Export as JSON">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onPress={() => exportQuery(entry.name, entry.query)}
                        >
                          <Download className="size-3.5 text-muted-foreground" />
                        </Button>
                      </span>
                      <span title="Delete">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onPress={() => onDelete(entry.id)}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground hover:text-rose-500" />
                        </Button>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : history.length === 0 ? (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
            No query history yet.
          </p>
        ) : (
          <div className="space-y-1">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-1 rounded-lg border border-transparent bg-card/60 px-2 py-1.5 hover:border-border"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onRun(entry.query)}
                  title="Re-run this query"
                >
                  <span className="block truncate font-mono text-[11px]">
                    {describeQuery(entry.query)}
                  </span>
                </button>
                <span title="Run">
                  <Button variant="ghost" size="icon-xs" onPress={() => onRun(entry.query)}>
                    <Play className="size-3.5 text-primary" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
