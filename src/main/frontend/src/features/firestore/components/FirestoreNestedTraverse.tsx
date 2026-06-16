import { useEffect, useRef } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Spinner } from "@/shadcn/components/ui/spinner"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { AlertCircle, ChevronLeft, Database, Eye, Files, Folder, RefreshCw, Search } from "lucide-react"
import { type NestedResponse } from "@/features/firestore/schemas/FirestoreSchema"
import { pathIsCollection } from "@/features/firestore/api/firestore-utils"
import { cn } from "@/shadcn/lib/utils"

interface FirestoreNestedTraverseProps {
  nestedLoading: boolean
  nestedResponse: NestedResponse | null
  queryPath: string
  nestedIdFilter: string
  setNestedIdFilter: (value: string) => void
  setQueryPath: (path: string) => void
  runQuery: (page: number, pathOverride?: string) => void
  refreshNested: (pathValue: string) => void
  onOpenDocumentPreview: (documentPath: string, documentId: string) => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  drawerMode?: boolean
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}

export function FirestoreNestedTraverse({
  nestedLoading,
  nestedResponse,
  queryPath,
  nestedIdFilter,
  setNestedIdFilter,
  setQueryPath,
  runQuery,
  refreshNested,
  onOpenDocumentPreview,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  drawerMode = false,
  drawerOpen = false,
  onDrawerOpenChange,
}: FirestoreNestedTraverseProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!sentinelRef.current || !scrollContainerRef.current) {
      return
    }
    if (!hasNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (!first?.isIntersecting) {
          return
        }
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px",
      },
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, nestedIdFilter, nestedResponse?.currentPath])

  const content = (
    <>
      <div className="px-3 py-3 mb-1 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={nestedIdFilter}
            onChange={(e) => setNestedIdFilter(e.target.value)}
            placeholder="Filter document or collection id"
            className="w-full bg-muted/50 text-[11px] pl-8 pr-3 py-1.5 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono"
          />
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-2 space-y-0.5 mt-2">
        {nestedLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <Spinner />
            Loading...
          </div>
        ) : null}
        {nestedResponse?.nestedError ? (
          <Alert variant="destructive" className="mx-2 mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-xs">{nestedResponse.nestedError}</AlertDescription>
          </Alert>
        ) : null}

        {!nestedLoading && !nestedResponse?.nestedError ? (
          <div className="space-y-0.5 pb-4">
            {nestedResponse?.parentPath ? (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs text-muted-foreground hover:bg-accent transition-all"
                onClick={() => {
                  const parent = nestedResponse.parentPath
                  setQueryPath(`/${parent}`)
                  if (pathIsCollection(parent)) {
                    void runQuery(0, parent)
                  } else {
                    void refreshNested(parent)
                  }
                  onDrawerOpenChange?.(false)
                }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Up</span>
              </button>
            ) : null}

            {nestedResponse?.nodeType === "collection"
              ? nestedResponse.documentNodes.map((node) => (
                <div key={node.path} className="group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs text-muted-foreground hover:bg-accent transition-all">
                  <button
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    onClick={() => {
                      void refreshNested(node.path)
                      onDrawerOpenChange?.(false)
                    }}
                  >
                    <Files className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate font-mono text-[11px]" title={node.id}>{node.id}</span>
                  </button>

                  <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] bg-green-100/70 text-green-700 dark:bg-green-950/40 dark:text-green-300 px-1 py-0.5 rounded font-mono font-bold tracking-tight">
                      Ready
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenDocumentPreview(node.path, node.id)
                        onDrawerOpenChange?.(false)
                      }}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
              : null}

            {nestedResponse?.nodeType === "document"
              ? nestedResponse.childCollectionNodes.map((node) => (
                <button
                  key={node.path}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs text-muted-foreground hover:bg-accent transition-all"
                  onClick={() => {
                    setQueryPath(`/${node.path}`)
                    void runQuery(0, node.path)
                    onDrawerOpenChange?.(false)
                  }}
                >
                  <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate font-medium">{node.id}</span>
                </button>
              ))
              : null}

            {hasNextPage ? (
              <div ref={sentinelRef} className="flex h-8 items-center justify-center text-xs text-muted-foreground mt-2">
                {isFetchingNextPage ? (
                  <>
                    <Spinner />
                    <span className="ml-2">Loading more...</span>
                  </>
                ) : null}
              </div>
            ) : null}

            {nestedResponse?.nestedHint ? (
              <p className="text-xs text-muted-foreground px-3 py-2 text-center italic">{nestedResponse.nestedHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )

  if (drawerMode) {
    return (
      <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <SheetContent side="left" className="w-[90vw] max-w-md p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle>Nested Traverse</SheetTitle>
            <SheetDescription>Navigate nested documents and collections.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{content}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col h-full">
      <div className="flex shrink-0 items-center border-b border-border transition-all h-14 px-5 justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Nested Traverse</span>
        </div>

        <button
          onClick={() => {
            setNestedIdFilter('')
            void refreshNested(queryPath)
          }}
          className="p-1 rounded hover:bg-muted text-primary transition-colors"
          title="Refresh nested browser list"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={cn("flex min-h-0 h-full flex-1 flex-col")}>{content}</div>
    </aside>
  )
}
