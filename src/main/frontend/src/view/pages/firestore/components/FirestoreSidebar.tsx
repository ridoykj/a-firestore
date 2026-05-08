import { Button } from "@/shadcn/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { cn } from "@/shadcn/lib/utils"
import { Database, PanelLeftClose, PanelLeftOpen, RefreshCw, Table2 } from "lucide-react"

interface FirestoreSidebarProps {
  leftSidebarExpanded: boolean
  setLeftSidebarExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void
  collections: string[]
  collectionsLoading: boolean
  activeCollection: string
  refreshCollections: () => void
  runCollectionQuery: (collection: string) => void
}

export function FirestoreSidebar({
  leftSidebarExpanded,
  setLeftSidebarExpanded,
  collections,
  collectionsLoading,
  activeCollection,
  refreshCollections,
  runCollectionQuery,
}: FirestoreSidebarProps) {
  return (
    <aside
      className={cn(
        "border-r border-border bg-card/95 text-foreground transition-all flex flex-col",
        leftSidebarExpanded ? "w-72" : "w-16",
      )}
    >
      <div className="flex shrink-0 h-12 items-center justify-between border-b border-border px-3">
        {leftSidebarExpanded ? (
          <div className="flex items-center gap-2">
            <Database className="text-primary h-5 w-5" />
            <span className="text-sm font-semibold text-foreground">Firestore Collections</span>
          </div>
        ) : (
          <Database className="text-primary h-5 w-5 mx-auto" />
        )}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setLeftSidebarExpanded((value) => !value)}
        >
          {leftSidebarExpanded ? (
            <PanelLeftClose data-icon="inline-start" />
          ) : (
            <PanelLeftOpen data-icon="inline-start" />
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-3 flex items-center justify-between">
          {leftSidebarExpanded ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Collections
            </span>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void refreshCollections()}
            disabled={collectionsLoading}
          >
            <RefreshCw data-icon="inline-start" className={cn(collectionsLoading && "animate-spin")} />
          </Button>
        </div>

        <div className="grid gap-1">
          {collections.map((collection) => {
            const isActive = collection === activeCollection
            return (
              <Button
                key={collection}
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => runCollectionQuery(collection)}
              >
                <Table2 data-icon="inline-start" />
                {leftSidebarExpanded ? <span className="truncate">{collection}</span> : null}
              </Button>
            )
          })}
          {!collectionsLoading && collections.length === 0 ? (
            <Empty className="border-none p-2">
              <EmptyHeader>
                <EmptyTitle>No collections</EmptyTitle>
                <EmptyDescription>Run a query to load collections.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
