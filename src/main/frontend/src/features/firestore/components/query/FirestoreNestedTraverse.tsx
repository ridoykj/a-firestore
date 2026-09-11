import { useCallback, useEffect, useMemo, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Spinner } from "@/shadcn/components/ui/spinner"
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"
import { AlertCircle, ChevronLeft, Database, Eye, Files, Folder, RefreshCw, Search } from "lucide-react"
import { type NestedResponse } from "@/features/firestore/schemas/FirestoreSchema"
import { pathIsCollection } from "@/features/firestore/api/firestore-utils"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"

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

type VirtualItemData =
  | { type: "up"; id: string; path: string }
  | { type: "document"; id: string; path: string; label: string }
  | { type: "collection"; id: string; path: string; label: string }
  | { type: "loader"; id: string }
  | { type: "hint"; id: string; label: string }

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
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node)
  }, [])

  const items = useMemo(() => {
    const result: VirtualItemData[] = []

    if (nestedResponse?.parentPath) {
      result.push({ id: "up-btn", type: "up", path: nestedResponse.parentPath })
    }

    if (nestedResponse?.nodeType === "collection") {
      nestedResponse.documentNodes.forEach((node) => {
        result.push({ id: `doc-${node.path}`, type: "document", path: node.path, label: node.id })
      })
    } else if (nestedResponse?.nodeType === "document") {
      nestedResponse.childCollectionNodes.forEach((node) => {
        result.push({ id: `col-${node.path}`, type: "collection", path: node.path, label: node.id })
      })
    }

    if (hasNextPage) {
      result.push({ id: "loader", type: "loader" })
    }

    if (nestedResponse?.nestedHint && !hasNextPage) {
      result.push({ id: "hint", type: "hint", label: nestedResponse.nestedHint })
    }

    return result
  }, [nestedResponse, hasNextPage])

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 40,
    overscan: 10,
  })

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) {
      return
    }

    if (
      lastItem.index >= items.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [virtualItems, items.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const content = (
    <>
      <div className="px-3 py-3 mb-1 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            type="text"
            value={nestedIdFilter}
            onChange={(e) => setNestedIdFilter(e.target.value)}
            placeholder="Filter document or collection id"
            className="bg-muted/50 text-[11px] pl-8 font-mono"
          />
        </div>
      </div>

      <ScrollArea ref={scrollRef} className="flex-1 min-h-0 px-2 mt-2">
        {nestedLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
            <Spinner />
            Loading...
          </div>
        ) : nestedResponse?.nestedError ? (
          <Alert variant="destructive" className="mx-2 mb-2">
            <AlertCircle className="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-xs">{nestedResponse.nestedError}</AlertDescription>
          </Alert>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index]

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-0.5"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.type === "up" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full h-auto justify-start gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-normal text-muted-foreground hover:bg-accent"
                      onClick={() => {
                        const parent = item.path
                        setQueryPath(`/${parent}`)
                        if (pathIsCollection(parent)) {
                          void runQuery(0, parent)
                        } else {
                          void refreshNested(parent)
                        }
                        onDrawerOpenChange?.(false)
                      }}
                    >
                      <ChevronLeft className="size-3.5" />
                      <span>Up</span>
                    </Button>
                  )}

                  {item.type === "document" && (
                    <div className="group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs text-muted-foreground hover:bg-accent transition-all">
                      <Button
                        variant="ghost"
                        className="flex-1 min-w-0 h-auto justify-start gap-2 p-0 text-left font-normal hover:bg-transparent"
                        onClick={() => {
                          void refreshNested(item.path)
                          onDrawerOpenChange?.(false)
                        }}
                      >
                        <Files className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate font-mono text-[11px]" title={item.label}>
                          {item.label}
                        </span>
                      </Button>

                      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] bg-green-100/70 text-green-700 dark:bg-green-950/40 dark:text-green-300 px-1 py-0.5 rounded font-mono font-bold tracking-tight">
                          Ready
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"              
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenDocumentPreview(item.path, item.label)
                            onDrawerOpenChange?.(false)
                          }}
                          className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                        >
                          <Eye className="size-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {item.type === "collection" && (
                    <Button
                      variant="ghost"
                      className="w-full h-auto justify-start gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-normal text-muted-foreground hover:bg-accent"
                      onClick={() => {
                        setQueryPath(`/${item.path}`)
                        void runQuery(0, item.path)
                        onDrawerOpenChange?.(false)
                      }}
                    >
                      <Folder className="size-3.5 text-amber-500 shrink-0" />
                      <span className="truncate font-medium">{item.label}</span>
                    </Button>
                  )}

                  {item.type === "loader" && (
                    <div className="flex h-8 items-center justify-center text-xs text-muted-foreground mt-2">
                      {isFetchingNextPage ? (
                        <>
                          <Spinner />
                          <span className="ml-2">Loading more...</span>
                        </>
                      ) : null}
                    </div>
                  )}

                  {item.type === "hint" && (
                    <p className="text-xs text-muted-foreground px-3 py-2 text-center italic">
                      {item.label}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </>
  )

  if (drawerMode) {
    return (
      <Sheet
        isOpen={drawerOpen}
        onOpenChange={onDrawerOpenChange}
        side="left"
        className="w-[90vw] max-w-md p-0"
      >
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>Nested Traverse</SheetTitle>
          <SheetDescription>Navigate nested documents and collections.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">{content}</div>
      </Sheet>
    )
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col h-full">
      <div className="flex shrink-0 items-center border-b border-border transition-all h-14 px-5 justify-between">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-emerald-500" />
          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Nested Traverse</span>
        </div>

        <span title="Refresh nested browser list">
          <Button
            variant="ghost"
            size="icon-sm"
            onPress={() => {
              setNestedIdFilter('')
              void refreshNested(queryPath)
            }}
            className="text-primary"
            isDisabled={nestedLoading}
          >
            <RefreshCw className={`size-3.5 ${nestedLoading ? 'animate-spin' : ''}`} />
          </Button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
    </aside>
  )
}
