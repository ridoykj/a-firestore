import type { QueryResponse } from "@/dto/firestore/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shadcn/components/ui/table"
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import { getPayloadOnly, normalizePath, safePreviewValue } from "@/view/pages/firestore/lib/firestore-utils"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"
import { cn } from "@/shadcn/lib/utils"

type FirestoreQueryResultsProps = {
  queryLoading: boolean
  queryError: string
  queryResponse: QueryResponse | null
  selectedPreviewPath: string
  onRequestPreviewFromRow: (
    path: string,
    documentId: string,
    payload: Record<string, unknown>,
  ) => void
  page: number
  onRunPrevPage: () => void
  onRunNextPage: () => void
  queryStats: string
}

export function FirestoreQueryResults({
  queryLoading,
  queryError,
  queryResponse,
  selectedPreviewPath,
  onRequestPreviewFromRow,
  page,
  onRunPrevPage,
  onRunNextPage,
  queryStats,
}: FirestoreQueryResultsProps) {
  const isMobile = useIsMobile()
  const dataColumns = (queryResponse?.columns ?? []).filter((column) => column.name !== "id")
  const emptyStateColumnSpan = dataColumns.length + 1

  return (
    <>
      <div className="min-h-0 flex flex-1 flex-col bg-background p-3">
        {queryLoading ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Running query...
            </div>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : null}

        {queryError ? (
          <Alert className="mb-3" variant="destructive">
            <AlertCircle />
            <AlertTitle>Query Failed</AlertTitle>
            <AlertDescription>{queryError}</AlertDescription>
          </Alert>
        ) : null}

        {!queryLoading && !queryError ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border bg-card/20">
            <div className="min-h-0 flex-1 overflow-auto [&_[data-slot=table-container]]:overflow-visible">
              <Table className="w-max min-w-full text-left text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-20 min-w-44 bg-muted py-2 font-semibold">
                      <div className="grid gap-0.5">
                        <span>ID</span>
                        <span className="text-[10px] font-normal text-muted-foreground">string</span>
                      </div>
                    </TableHead>
                    {dataColumns.map((column) => (
                      <TableHead
                        key={column.name}
                        className="sticky top-0 z-20 min-w-44 bg-muted py-2 font-semibold"
                      >
                        <div className="grid gap-0.5">
                          <span>{column.name}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">{column.type}</span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(queryResponse?.documents ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell className="py-6 text-center text-sm text-muted-foreground" colSpan={emptyStateColumnSpan}>
                        <Empty className="border-none">
                          <EmptyHeader>
                            <EmptyTitle>No documents found</EmptyTitle>
                            <EmptyDescription>Try changing the path, filters, or pagination settings.</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {(queryResponse?.documents ?? []).map((doc, index) => {
                    const documentPath = typeof doc._path === "string" ? doc._path : ""
                    const normalizedDocumentPath = normalizePath(documentPath)
                    const documentId = typeof doc.id === "string" ? doc.id : "(no-id)"
                    const payloadObject = getPayloadOnly(doc)
                    const rowPreviewDisabled = !documentPath
                    const rowIsSelected =
                      !!selectedPreviewPath &&
                      normalizePath(selectedPreviewPath) === normalizedDocumentPath
                    const openRowPreview = () => {
                      if (rowPreviewDisabled) {
                        return
                      }
                      onRequestPreviewFromRow(documentPath, documentId, payloadObject)
                    }

                    return (
                      <TableRow
                        key={`${documentPath || documentId}-${index}`}
                        className={cn(
                          "odd:bg-background even:bg-muted/20",
                          rowIsSelected && "odd:bg-accent/60 even:bg-accent/60 hover:bg-accent/60",
                        )}
                        aria-selected={rowIsSelected}
                        tabIndex={rowPreviewDisabled ? -1 : 0}
                        onDoubleClick={() => {
                          if (!isMobile) {
                            openRowPreview()
                          }
                        }}
                        onClick={() => {
                          if (isMobile) {
                            openRowPreview()
                          }
                        }}
                        onKeyDown={(event) => {
                          if (!rowPreviewDisabled && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault()
                            openRowPreview()
                          }
                        }}
                      >
                        <TableCell className="align-top font-medium">{documentId}</TableCell>
                        {dataColumns.map((column) => (
                          <TableCell key={`${documentPath}-${column.name}`} className="max-w-xs">
                            <span className="line-clamp-2 text-muted-foreground">{safePreviewValue(doc[column.name])}</span>
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t bg-card px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            {queryResponse
              ? `Page ${queryResponse.pageIndex + 1} - ${queryResponse.pageSize} per page`
              : `Page ${page + 1}`}
          </span>
          <span>
            {queryResponse
              ? queryResponse.resultCount > 0
                ? `Showing ${queryResponse.pageStart}-${queryResponse.pageEnd}`
                : "No rows on this page"
              : "No rows on this page"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!queryResponse?.hasPreviousPage || queryLoading}
            onClick={onRunPrevPage}
          >
            <ChevronLeft data-icon="inline-start" />
            Prev
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={!queryResponse?.hasNextPage || queryLoading}
            onClick={onRunNextPage}
          >
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <footer className="flex h-8 items-center justify-between border-t bg-card px-3 text-xs text-muted-foreground">
        <Badge variant="secondary">Ready</Badge>
        <span>{queryStats}</span>
      </footer>
    </>
  )
}
