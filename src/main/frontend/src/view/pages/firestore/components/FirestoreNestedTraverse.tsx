import { useEffect, useRef } from "react"
import { Button } from "@/shadcn/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Input } from "@/shadcn/components/ui/input"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { AlertCircle, ChevronLeft, Eye, FileText, Folder, RefreshCw } from "lucide-react"
import { type NestedResponse } from "@/dto/firestore/FirestoreSchema"
import { pathIsCollection } from "@/view/pages/firestore/lib/firestore-utils"

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

  return (
    <aside className="w-72 shrink-0 border-r bg-card">
      <div className="px-3 py-1 flex flex-col gap-2  border-b">
        <div className="flex h-10 items-center border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nested Traverse
        </div>
        <div className="flex flex-col bg-card gap-2">
          <Input
            value={nestedIdFilter}
            onChange={(event) => setNestedIdFilter(event.target.value)}
            placeholder="Filter document/collection ID"
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            {nestedResponse?.parentPath ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  const parent = nestedResponse.parentPath
                  setQueryPath(`/${parent}`)
                  if (pathIsCollection(parent)) {
                    void runQuery(0, parent)
                  } else {
                    void refreshNested(parent)
                  }
                }}
              >
                <ChevronLeft data-icon="inline-start" />
                Up
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="xs" onClick={() => void refreshNested(queryPath)}>
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
      <div ref={scrollContainerRef} className="h-[calc(100%-2.5rem)] overflow-auto p-3">
        {nestedLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            Loading...
          </div>
        ) : null}
        {nestedResponse?.nestedError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Nested Traversal Error</AlertTitle>
            <AlertDescription>{nestedResponse.nestedError}</AlertDescription>
          </Alert>
        ) : null}

        {!nestedLoading && !nestedResponse?.nestedError ? (

          <div className="grid gap-2">

            {nestedResponse?.nodeType === "collection"
              ? nestedResponse.documentNodes.map((node) => (
                <div key={node.path} className="flex items-start gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto min-h-7 flex-1 justify-start rounded-md px-2 py-1.5 text-left text-xs"
                    onClick={() => void refreshNested(node.path)}
                  >
                    <FileText data-icon="inline-start" aria-hidden="true" />
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">{node.id}</span>
                      <span className="truncate text-muted-foreground">{node.path}</span>
                    </div>
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    className="mt-1 shrink-0"
                    aria-label={`Open Data Preview for ${node.id}`}
                    title={`Open Data Preview for ${node.id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenDocumentPreview(node.path, node.id)
                    }}
                  >
                    <Eye aria-hidden="true" />
                  </Button>
                </div>
              ))
              : null}

            {nestedResponse?.nodeType === "document"
              ? nestedResponse.childCollectionNodes.map((node) => (
                <Button
                  key={node.path}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-xs"
                  onClick={() => {
                    setQueryPath(`/${node.path}`)
                    void runQuery(0, node.path)
                  }}
                >
                  <Folder data-icon="inline-start" aria-hidden="true" />
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium">{node.id}</span>
                    <span className="truncate text-muted-foreground">{node.path}</span>
                  </div>
                </Button>
              ))
              : null}

            {hasNextPage ? (
              <div ref={sentinelRef} className="flex h-8 items-center justify-center text-xs text-muted-foreground">
                {isFetchingNextPage ? (
                  <>
                    <Spinner />
                    <span className="ml-2">Loading more...</span>
                  </>
                ) : (
                  "Scroll to load more"
                )}
              </div>
            ) : null}

            {nestedResponse?.nestedHint ? (
              <p className="text-xs text-muted-foreground">{nestedResponse.nestedHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}
