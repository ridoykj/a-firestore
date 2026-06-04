import type { QueryResponse } from "@/dto/firestore/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Checkbox } from "@/shadcn/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/shadcn/components/ui/pagination"
import { Skeleton } from "@/shadcn/components/ui/skeleton"
import { Spinner } from "@/shadcn/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shadcn/components/ui/table"
import { cn } from "@/shadcn/lib/utils"
import { getPayloadOnly, normalizePath, safePreviewValue } from "@/view/pages/firestore/lib/firestore-utils"
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

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
  onSelectionChange: (rows: RowModel[]) => void
  page: number
  onRunPrevPage: () => void
  onRunNextPage: () => void
  queryStats: string
  quickSearchText: string
  onFilterMatchCountChange: (count: number) => void
}

type StatusFilter = "all" | "previewable" | "selected"

type RowModel = {
  key: string
  doc: Record<string, unknown>
  documentPath: string
  normalizedDocumentPath: string
  documentId: string
  payloadObject: Record<string, unknown>
  rowPreviewDisabled: boolean
  rowIsSelected: boolean
  searchText: string
}

export function FirestoreQueryResults({
  queryLoading,
  queryError,
  queryResponse,
  selectedPreviewPath,
  onRequestPreviewFromRow,
  onSelectionChange,
  page,
  onRunPrevPage,
  onRunNextPage,
  queryStats,
  quickSearchText,
  onFilterMatchCountChange,
}: FirestoreQueryResultsProps) {
  const statusFilter = useMemo<StatusFilter>(() => "all", [])

  const dataColumns = (queryResponse?.columns ?? []).filter((column) => column.name !== "id")
  const emptyStateColumnSpan = dataColumns.length + 2
  const queryDocuments = useMemo(() => queryResponse?.documents ?? [], [queryResponse?.documents])
  const normalizedQuickFilter = quickSearchText.trim().toLowerCase()
  const hasActiveClientFilter = statusFilter !== "all" || normalizedQuickFilter.length > 0
  const tableMinWidth = useMemo(
    () => Math.max(860, 340 + (dataColumns.length * 210)),
    [dataColumns.length],
  )

  const rows = useMemo<RowModel[]>(() => {
    return queryDocuments.map((rawDoc, index) => {
      const doc = rawDoc as Record<string, unknown>
      const documentPath = typeof doc._path === "string" ? doc._path : ""
      const normalizedDocumentPath = normalizePath(documentPath)
      const documentId = typeof doc.id === "string" ? doc.id : "(no-id)"
      const payloadObject = getPayloadOnly(doc)
      const rowPreviewDisabled = !documentPath
      const rowIsSelected =
        !!selectedPreviewPath && normalizePath(selectedPreviewPath) === normalizedDocumentPath
      const valueSearch = dataColumns
        .map((column) => safePreviewValue(doc[column.name]))
        .join(" ")
        .toLowerCase()

      return {
        key: `${documentPath || documentId}-${index}`,
        doc,
        documentPath,
        normalizedDocumentPath,
        documentId,
        payloadObject,
        rowPreviewDisabled,
        rowIsSelected,
        searchText: `${documentId} ${documentPath} ${valueSearch}`.toLowerCase(),
      }
    })
  }, [dataColumns, queryDocuments, selectedPreviewPath])

  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set())
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedRowKeys.has(row.key)),
    [rows, selectedRowKeys],
  )

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter === "previewable" && row.rowPreviewDisabled) {
        return false
      }
      if (statusFilter === "selected" && !row.rowIsSelected) {
        return false
      }
      if (normalizedQuickFilter && !row.searchText.includes(normalizedQuickFilter)) {
        return false
      }
      return true
    })
  }, [normalizedQuickFilter, rows, statusFilter])

  const visibleRowKeys = useMemo(
    () => filteredRows.map((row) => row.key),
    [filteredRows],
  )
  const anyVisibleSelected = visibleRowKeys.some((key) => selectedRowKeys.has(key))
  const allVisibleSelected =
    visibleRowKeys.length > 0 && visibleRowKeys.every((key) => selectedRowKeys.has(key))
  const headerCheckboxState: boolean | "indeterminate" =
    allVisibleSelected ? true : anyVisibleSelected ? "indeterminate" : false

  const toggleRowSelection = (rowKey: string, shouldSelect: boolean) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (shouldSelect) {
        next.add(rowKey)
      } else {
        next.delete(rowKey)
      }
      return next
    })
  }

  const toggleAllVisibleRows = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleRowKeys.forEach((key) => next.delete(key))
      } else {
        visibleRowKeys.forEach((key) => next.add(key))
      }
      return next
    })
  }

  const canPrev = Boolean(queryResponse?.hasPreviousPage) && !queryLoading
  const canNext = Boolean(queryResponse?.hasNextPage) && !queryLoading
  const statusBadgeVariant = queryError
    ? "destructive"
    : queryLoading
      ? "outline"
      : "secondary"

  useEffect(() => {
    if (onFilterMatchCountChange) {
      onFilterMatchCountChange(filteredRows.length)
    }
  }, [filteredRows.length, onFilterMatchCountChange])

  useEffect(() => {
    onSelectionChange(selectedRows)
  }, [selectedRows, onSelectionChange])

  const openRowPreview = (row: RowModel) => {
    if (row.rowPreviewDisabled) {
      return
    }
    onRequestPreviewFromRow(row.documentPath, row.documentId, row.payloadObject)
  }

  return (
    <>
      <div className="min-h-0 flex flex-1 flex-col bg-background p-3 sm:p-4">
        {queryLoading ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Spinner />
              Running query...
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card/30 shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto p-3 md:hidden">
              {filteredRows.length === 0 ? (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyTitle>
                      {queryDocuments.length === 0
                        ? "No documents found"
                        : "No matching rows"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {queryDocuments.length === 0
                        ? "Try changing the path, filters, or pagination settings."
                        : "Try adjusting the quick filter or row filter to see results."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid gap-2.5">
                  {filteredRows.map((row) => (
                    <div
                      key={row.key}
                      className={cn(
                        "rounded-lg border bg-card p-3 shadow-xs",
                        row.rowIsSelected && "border-primary/50 bg-primary/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedRowKeys.has(row.key)}
                              onCheckedChange={(checked) =>
                                toggleRowSelection(row.key, checked === true)
                              }
                              className="h-5 w-5 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{row.documentId}</p>
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {row.documentPath || "(no-path)"}
                              </p>
                            </div>
                          </div>
                        </div>
                        {row.rowPreviewDisabled ? (
                          <Badge variant="destructive">Unavailable</Badge>
                        ) : row.rowIsSelected ? (
                          <Badge variant="secondary">Selected</Badge>
                        ) : (
                          <Badge variant="outline">Ready</Badge>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2">
                        {dataColumns.slice(0, 4).map((column) => (
                          <div key={`${row.key}-${column.name}`} className="grid gap-0.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              {column.name}
                            </span>
                            <span className="line-clamp-2 wrap-break-word text-sm">
                              {safePreviewValue(row.doc[column.name])}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => openRowPreview(row)}
                          disabled={row.rowPreviewDisabled}
                        >
                          <Eye data-icon="inline-start" />
                          Open Preview
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden min-h-0 flex-1 md:block">
              <div className="relative h-full overflow-auto">
                <div className="*:data-[slot=table-container]:overflow-visible">
                  <Table className="text-left text-sm" style={{ minWidth: tableMinWidth }}>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-30 bg-background/95 shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))] backdrop-blur">
                        <TableHead className="sticky top-0 left-0 z-30 w-56 min-w-56 border-r border-border/70 bg-background/95 py-3 font-semibold shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))] backdrop-blur">
                          <div className="grid gap-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span>Document ID</span>
                              <Checkbox
                                checked={headerCheckboxState}
                                onCheckedChange={toggleAllVisibleRows}
                                className="h-5 w-5 shrink-0"
                              />
                            </div>
                            <span className="text-xs font-normal text-foreground/65">
                              key
                            </span>
                          </div>
                        </TableHead>
                        {dataColumns.map((column) => (
                          <TableHead
                            key={column.name}
                            className="sticky top-0 z-20 w-52 min-w-44 border-r border-border/70 bg-background/95 py-3 font-semibold shadow-[inset_0_-1px_0_hsl(var(--border))] backdrop-blur"
                          >
                            <div className="grid gap-0.5">
                              <span>{column.name}</span>
                              <span className="text-xs font-normal text-foreground/65">
                                {column.type}
                              </span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell className="py-10 text-center text-sm text-muted-foreground" colSpan={emptyStateColumnSpan}>
                            <Empty className="border-none">
                              <EmptyHeader>
                                <EmptyTitle>
                                  {queryDocuments.length === 0
                                    ? "No documents found"
                                    : "No matching rows"}
                                </EmptyTitle>
                                <EmptyDescription>
                                  {queryDocuments.length === 0
                                    ? "Try changing the path, filters, or pagination settings."
                                    : "Try adjusting the quick filter or row filter to see results."}
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </TableCell>
                        </TableRow>
                      ) : null}

                      {filteredRows.map((row) => (
                        <TableRow
                          key={row.key}
                          className={cn(
                            "odd:bg-background even:bg-muted/10 hover:bg-accent/35",
                            row.rowIsSelected && "odd:bg-primary/10 even:bg-primary/10 hover:bg-primary/15",
                          )}
                          aria-selected={row.rowIsSelected}
                          tabIndex={row.rowPreviewDisabled ? -1 : 0}
                          onDoubleClick={() => openRowPreview(row)}
                          onKeyDown={(event) => {
                            if (!row.rowPreviewDisabled && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault()
                              openRowPreview(row)
                            }
                          }}
                        >
                          <TableCell
                            className={cn(
                              "sticky left-0 z-10 max-w-sm py-3 text-xs align-top shadow-[inset_-1px_0_0_hsl(var(--border))]",
                              row.rowIsSelected ? "bg-primary/10" : "bg-card/95",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <Checkbox
                                  checked={selectedRowKeys.has(row.key)}
                                  onCheckedChange={(checked) =>
                                    toggleRowSelection(row.key, checked === true)
                                  }
                                  className="h-5 w-5 shrink-0"
                                />
                                <div className="min-w-0">
                                  <span className="truncate font-medium">{row.documentId}</span>
                                  <p className="truncate font-mono text-xs text-muted-foreground">
                                    {row.documentPath || "(no-path)"}
                                  </p>
                                </div>
                              </div>
                              {row.rowPreviewDisabled ? (
                                <Badge variant="destructive">Unavailable</Badge>
                              ) : row.rowIsSelected ? (
                                <Badge variant="secondary">Selected</Badge>
                              ) : (
                                <Badge variant="outline">Ready</Badge>
                              )}
                            </div>
                          </TableCell>
                          {dataColumns.map((column) => (
                            <TableCell
                              key={`${row.normalizedDocumentPath}-${column.name}`}
                              className="max-w-xs whitespace-normal text-xs wrap-break-word py-3 align-top"
                            >
                              <span
                                className="line-clamp-3 text-foreground/85"
                                title={safePreviewValue(row.doc[column.name])}
                              >
                                {safePreviewValue(row.doc[column.name])}
                              </span>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            {hasActiveClientFilter && filteredRows.length > 0 ? (
              <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Client filter is applied to current page rows only.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
          {hasActiveClientFilter ? (
            <Badge variant="outline">Filtered view</Badge>
          ) : null}
        </div>

        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                aria-disabled={!canPrev}
                className={cn(!canPrev && "pointer-events-none opacity-50")}
                onClick={(event) => {
                  event.preventDefault()
                  if (canPrev) {
                    onRunPrevPage()
                  }
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                aria-disabled={!canNext}
                className={cn(!canNext && "pointer-events-none opacity-50")}
                onClick={(event) => {
                  event.preventDefault()
                  if (canNext) {
                    onRunNextPage()
                  }
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      <footer className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t bg-card px-3 py-2 text-sm text-muted-foreground">
        <Badge variant={statusBadgeVariant}>
          {queryError ? (
            <>
              <XCircle data-icon="inline-start" />
              Error
            </>
          ) : queryLoading ? (
            <>
              <Spinner data-icon="inline-start" />
              Loading
            </>
          ) : (
            <>
              <CheckCircle2 data-icon="inline-start" />
              Ready
            </>
          )}
        </Badge>
        <span className="truncate">{queryStats}</span>
      </footer>
    </>
  )
}
