import { Button } from "@/shadcn/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
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
  drawerMode?: boolean
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}

export function FirestoreSidebar({
  leftSidebarExpanded,
  setLeftSidebarExpanded,
  collections,
  collectionsLoading,
  activeCollection,
  refreshCollections,
  runCollectionQuery,
  drawerMode = false,
  drawerOpen = false,
  onDrawerOpenChange,
}: FirestoreSidebarProps) {
  const collectionList = (
    <div className="flex-1 overflow-y-auto px-2 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground/75">Collections</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => void refreshCollections()}
          disabled={collectionsLoading}
          aria-label="Refresh collections"
          title="Refresh collections"
        >
          <RefreshCw className={cn(collectionsLoading && "animate-spin")} />
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
                "h-auto w-full justify-start gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => {
                runCollectionQuery(collection)
                onDrawerOpenChange?.(false)
              }}
            >
              <Table2 data-icon="inline-start" />
              <span className="truncate">{collection}</span>
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
  )

  if (drawerMode) {
    return (
      <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="inline-flex items-center gap-2 text-base">
              <Database className="text-primary" />
              Firestore Collections
            </SheetTitle>
            <SheetDescription>Browse available root collections and run quick queries.</SheetDescription>
          </SheetHeader>
          {collectionList}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "hidden border-r border-border bg-card/95 text-foreground transition-all md:flex md:flex-col",
        leftSidebarExpanded ? "md:w-64" : "md:w-14",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        {leftSidebarExpanded ? (
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Collections</span>
          </div>
        ) : (
          <Database className="mx-auto h-5 w-5 text-primary" />
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setLeftSidebarExpanded((value) => !value)}
          aria-label={leftSidebarExpanded ? "Collapse collections panel" : "Expand collections panel"}
          title={leftSidebarExpanded ? "Collapse collections panel" : "Expand collections panel"}
        >
          {leftSidebarExpanded ? (
            <PanelLeftClose data-icon="inline-start" />
          ) : (
            <PanelLeftOpen data-icon="inline-start" />
          )}
        </Button>
      </div>

      {leftSidebarExpanded ? (
        collectionList
      ) : (
        <div className="flex flex-1 flex-col items-center gap-2 px-2 py-3">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void refreshCollections()}
            disabled={collectionsLoading}
            aria-label="Refresh collections"
            title="Refresh collections"
          >
            <RefreshCw className={cn(collectionsLoading && "animate-spin")} />
          </Button>
          {collections.map((collection) => {
            const isActive = collection === activeCollection
            return (
              <Button
                key={collection}
                type="button"
                size="icon-sm"
                variant={isActive ? "secondary" : "ghost"}
                onClick={() => runCollectionQuery(collection)}
                aria-label={collection}
                title={collection}
              >
                <Table2 />
              </Button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
