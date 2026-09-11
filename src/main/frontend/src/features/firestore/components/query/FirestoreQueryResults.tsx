import type { QueryResponse } from "@/features/firestore/schemas/FirestoreSchema"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Checkbox } from "@/shadcn/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/shadcn/components/ui/pagination"
import { Popover, PopoverTrigger } from "@/shadcn/components/ui/popover"
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
import { getPayloadOnly, normalizePath, safePreviewValue } from "@/features/firestore/api/firestore-utils"
import {
  DEFAULT_COLUMN_WIDTH,
  EMPTY_COLUMN_PREFS,
  loadColumnPrefs,
  resolveColumns,
  saveColumnPrefs,
  type ColumnPrefs,
} from "@/features/firestore/api/column-prefs-storage"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Settings2,
  XCircle,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"

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
  /** FFP-203: create-index URL when the query failed for a missing composite index. */
  indexUrl?: string | null
  /** FFP-204: tab id used to persist per-collection column preferences. */
  tabId: string
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

const DOCUMENT_ID_COLUMN_WIDTH = 224

/** FFP-204: renders a cell value; nested map/array values open an inspector popover. */
function CellValue({ value }: { value: unknown }) {
  const isNested = value !== null && typeof value === "object"
  if (!isNested) {
    return (
      <span className="line-clamp-3 text-foreground/85" title={safePreviewValue(value)}>
        {safePreviewValue(value)}
      </span>
    )
  }

  const isArray = Array.isArray(value)
  const size = isArray
    ? (value as unknown[]).length
    : Object.keys(value as Record<string, unknown>).length
  return (
    <PopoverTrigger>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-accent"
        onClick={(event) => event.stopPropagation()}
      >
        {isArray ? `Array(${size})` : `Object(${size})`}
      </button>
      <Popover placement="bottom start" className="max-h-80 w-80 overflow-auto p-0">
        <pre className="whitespace-pre-wrap wrap-break-word p-3 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      </Popover>
    </PopoverTrigger>
  )
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
  indexUrl,
  tabId,
}: FirestoreQueryResultsProps) {
  const statusFilter = "all" as StatusFilter

  const collectionPath = queryResponse?.path ? normalizePath(queryResponse.path) : ""

  const serverColumnNames = useMemo(
    () =>
      (queryResponse?.columns ?? [])
        .map((column) => column.name)
        .filter((name) => name !== "id"),
    [queryResponse?.columns],
  )

  const columnTypeByName = new Map<string, string>()
  for (const column of queryResponse?.columns ?? []) {
    columnTypeByName.set(column.name, column.type)
  }

  // FFP-204: per-collection column preferences (visibility, order, width, pin). Reset during
  // render when the collection changes (the supported "adjust state during render" pattern).
  const [prevCollectionPath, setPrevCollectionPath] = useState(collectionPath)
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>(() =>
    collectionPath ? loadColumnPrefs(tabId, collectionPath) : EMPTY_COLUMN_PREFS,
  )
  if (collectionPath !== prevCollectionPath) {
    setPrevCollectionPath(collectionPath)
    setColumnPrefs(collectionPath ? loadColumnPrefs(tabId, collectionPath) : EMPTY_COLUMN_PREFS)
  }

  // Mirror prefs into a ref so drag-to-resize can persist the final value without a stale closure.
  const columnPrefsRef = useRef(columnPrefs)
  useEffect(() => {
    columnPrefsRef.current = columnPrefs
  }, [columnPrefs])

  function persistColumnPrefs(next: ColumnPrefs) {
    setColumnPrefs(next)
    if (collectionPath) {
      saveColumnPrefs(tabId, collectionPath, next)
    }
  }

  const resolvedColumns = useMemo(
    () => resolveColumns(serverColumnNames, columnPrefs),
    [serverColumnNames, columnPrefs],
  )
  const visibleColumns = useMemo(
    () => resolvedColumns.filter((column) => !column.hidden),
    [resolvedColumns],
  )

  // Cumulative left offsets so pinned columns stick past the sticky Document ID column.
  const columnLayout = visibleColumns.reduce<{
    items: Array<{ name: string; pinned: boolean; width: number; left: number | null }>
    offset: number
  }>(
    (acc, column) => {
      const width = column.width ?? DEFAULT_COLUMN_WIDTH
      const left = column.pinned ? acc.offset : null
      return {
        items: [...acc.items, { name: column.name, pinned: column.pinned, width, left }],
        offset: column.pinned ? acc.offset + width : acc.offset,
      }
    },
    { items: [], offset: DOCUMENT_ID_COLUMN_WIDTH },
  ).items

  const emptyStateColumnSpan = visibleColumns.length + 2
  const queryDocuments = useMemo(() => queryResponse?.documents ?? [], [queryResponse?.documents])
  const normalizedQuickFilter = quickSearchText.trim().toLowerCase()
  const hasActiveClientFilter = statusFilter !== "all" || normalizedQuickFilter.length > 0
  const tableMinWidth = columnLayout.reduce((sum, column) => sum + column.width, DOCUMENT_ID_COLUMN_WIDTH)

  const visibleColumnNames = useMemo(
    () => visibleColumns.map((column) => column.name),
    [visibleColumns],
  )

  const rows: RowModel[] = useMemo(() => {
    return queryDocuments.map((rawDoc, index) => {
      const doc = rawDoc as Record<string, unknown>
      const documentPath = typeof doc._path === "string" ? doc._path : ""
      const normalizedDocumentPath = normalizePath(documentPath)
      const documentId = typeof doc.id === "string" ? doc.id : "(no-id)"
      const payloadObject = getPayloadOnly(doc)
      const rowPreviewDisabled = !documentPath
      const rowIsSelected =
        !!selectedPreviewPath && normalizePath(selectedPreviewPath) === normalizedDocumentPath
      const valueSearch = visibleColumnNames
        .map((name) => safePreviewValue(doc[name]))
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
  }, [queryDocuments, selectedPreviewPath, visibleColumnNames])

  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set())
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedRowKeys.has(row.key)),
    [rows, selectedRowKeys],
  )

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
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
      }),
    [rows, statusFilter, normalizedQuickFilter],
  )

  const visibleRowKeys = useMemo(() => filteredRows.map((row) => row.key), [filteredRows])
  const anyVisibleSelected = visibleRowKeys.some((key) => selectedRowKeys.has(key))
  const allVisibleSelected =
    visibleRowKeys.length > 0 && visibleRowKeys.every((key) => selectedRowKeys.has(key))
  const headerCheckboxSelected = allVisibleSelected
  const headerCheckboxIndeterminate = !allVisibleSelected && anyVisibleSelected

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

  // FFP-204: column preference mutations.
  const toggleColumnHidden = (name: string) => {
    const hidden = columnPrefs.hidden.includes(name)
      ? columnPrefs.hidden.filter((item) => item !== name)
      : [...columnPrefs.hidden, name]
    persistColumnPrefs({ ...columnPrefs, hidden })
  }

  const toggleColumnPinned = (name: string) => {
    const pinned = columnPrefs.pinned.includes(name)
      ? columnPrefs.pinned.filter((item) => item !== name)
      : [...columnPrefs.pinned, name]
    persistColumnPrefs({ ...columnPrefs, pinned })
  }

  const moveColumn = (name: string, direction: -1 | 1) => {
    const order = resolvedColumns.map((column) => column.name)
    const index = order.indexOf(name)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) {
      return
    }
    ;[order[index], order[target]] = [order[target], order[index]]
    persistColumnPrefs({ ...columnPrefs, order })
  }

  // Column resize via a drag handle; persisted once on release.
  const resizeStateRef = useRef<{ name: string; startX: number; startWidth: number } | null>(null)

  const beginResize = (name: string, currentWidth: number) => (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStateRef.current = { name, startX: event.clientX, startWidth: currentWidth }

    const handleMove = (moveEvent: MouseEvent) => {
      const state = resizeStateRef.current
      if (!state) {
        return
      }
      const nextWidth = Math.max(96, state.startWidth + (moveEvent.clientX - state.startX))
      setColumnPrefs((prev) => ({ ...prev, widths: { ...prev.widths, [state.name]: nextWidth } }))
    }

    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
      resizeStateRef.current = null
      // Persist the final widths.
      setColumnPrefs((prev) => {
        if (collectionPath) {
          saveColumnPrefs(tabId, collectionPath, prev)
        }
        return prev
      })
    }

    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)
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
            <AlertTitle>{indexUrl !== undefined && indexUrl !== null ? "Index Required" : "Query Failed"}</AlertTitle>
            <AlertDescription>
              <span>{queryError}</span>
              {indexUrl ? (
                <a
                  href={indexUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex w-fit items-center gap-1 rounded-md border border-current px-2 py-1 text-xs font-semibold underline"
                >
                  Create index in Firebase console
                </a>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {!queryLoading && !queryError ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card/30 shadow-sm">
            {/* FFP-204: column configuration menu */}
            {serverColumnNames.length > 0 ? (
              <div className="flex items-center justify-end gap-2 border-b px-3 py-1.5">
                <DropdownMenuTrigger>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <Settings2 className="size-3.5" />
                    Columns
                  </Button>
                  <DropdownMenu placement="bottom end" className="w-64">
                    <DropdownMenuLabel>Configure columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {resolvedColumns.map((column, index) => (
                      <DropdownMenuItem
                        key={column.name}
                        className="flex items-center justify-between gap-2"
                        shouldCloseOnSelect={false}
                      >
                        <span className="truncate text-xs font-medium">{column.name}</span>
                        <span className="flex items-center gap-0.5">
                          <span title="Move left">
                            <Button variant="ghost" size="icon-xs" onPress={() => moveColumn(column.name, -1)} isDisabled={index === 0}>
                              <ArrowLeft className="size-3.5" />
                            </Button>
                          </span>
                          <span title="Move right">
                            <Button variant="ghost" size="icon-xs" onPress={() => moveColumn(column.name, 1)} isDisabled={index === resolvedColumns.length - 1}>
                              <ArrowRight className="size-3.5" />
                            </Button>
                          </span>
                          <span title={column.pinned ? "Unpin" : "Pin"}>
                            <Button variant="ghost" size="icon-xs" onPress={() => toggleColumnPinned(column.name)}>
                              {column.pinned ? <PinOff className="size-3.5 text-primary" /> : <Pin className="size-3.5" />}
                            </Button>
                          </span>
                          <span title={column.hidden ? "Show" : "Hide"}>
                            <Button variant="ghost" size="icon-xs" onPress={() => toggleColumnHidden(column.name)}>
                              {column.hidden ? <EyeOff className="size-3.5 text-muted-foreground" /> : <Eye className="size-3.5" />}
                            </Button>
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenu>
                </DropdownMenuTrigger>
              </div>
            ) : null}

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
                              isSelected={selectedRowKeys.has(row.key)}
                              onChange={(isSelected) =>
                                toggleRowSelection(row.key, isSelected)
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
                        {visibleColumns.slice(0, 4).map((column) => (
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
                          onPress={() => openRowPreview(row)}
                          isDisabled={row.rowPreviewDisabled}
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
              <ScrollArea className="relative h-full w-full">
                <div className="*:data-[slot=table-container]:overflow-visible">
                  <Table className="text-left text-sm" style={{ minWidth: tableMinWidth }}>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-30 bg-background/95 shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))] backdrop-blur">
                        <TableHead
                          className="sticky top-0 left-0 z-30 border-r border-border/70 bg-background/95 py-3 font-semibold shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))] backdrop-blur"
                          style={{ width: DOCUMENT_ID_COLUMN_WIDTH, minWidth: DOCUMENT_ID_COLUMN_WIDTH }}
                        >
                          <div className="grid gap-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span>Document ID</span>
                              <Checkbox
                                isSelected={headerCheckboxSelected}
                                isIndeterminate={headerCheckboxIndeterminate}
                                onChange={toggleAllVisibleRows}
                                className="h-5 w-5 shrink-0"
                              />
                            </div>
                            <span className="text-xs font-normal text-foreground/65">
                              key
                            </span>
                          </div>
                        </TableHead>
                        {columnLayout.map((column) => (
                          <TableHead
                            key={column.name}
                            className={cn(
                              "top-0 z-20 border-r border-border/70 bg-background/95 py-3 font-semibold shadow-[inset_0_-1px_0_hsl(var(--border))] backdrop-blur",
                              column.left !== null ? "sticky" : "",
                            )}
                            style={{
                              width: column.width,
                              minWidth: column.width,
                              ...(column.left !== null ? { left: column.left } : {}),
                            }}
                          >
                            <div className="relative grid gap-0.5 pr-2">
                              <span className="flex items-center gap-1 truncate">
                                {column.pinned ? <Pin className="size-3 text-primary" /> : null}
                                {column.name}
                              </span>
                              <span className="text-xs font-normal text-foreground/65">
                                {columnTypeByName.get(column.name) ?? "unknown"}
                              </span>
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                onMouseDown={beginResize(column.name, column.width)}
                                className="absolute -right-2 top-0 h-full w-2 cursor-col-resize select-none"
                              />
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
                              "sticky left-0 z-10 py-3 text-xs align-top shadow-[inset_-1px_0_0_hsl(var(--border))]",
                              row.rowIsSelected ? "bg-primary/10" : "bg-card/95",
                            )}
                            style={{ width: DOCUMENT_ID_COLUMN_WIDTH, minWidth: DOCUMENT_ID_COLUMN_WIDTH }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <Checkbox
                                  isSelected={selectedRowKeys.has(row.key)}
                                  onChange={(isSelected) =>
                                    toggleRowSelection(row.key, isSelected)
                                  }
                                  className="h-5 w-5 shrink-0"
                                />
                                <div className="min-w-0">
                                  <span className="truncate font-medium">{row.documentId}</span>
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
                          {columnLayout.map((column) => (
                            <TableCell
                              key={`${row.normalizedDocumentPath}-${column.name}`}
                              className={cn(
                                "whitespace-normal text-xs wrap-break-word py-3 align-top",
                                column.left !== null ? "sticky z-10 bg-card/95" : "",
                              )}
                              style={{
                                width: column.width,
                                minWidth: column.width,
                                ...(column.left !== null ? { left: column.left } : {}),
                              }}
                            >
                              <CellValue value={row.doc[column.name]} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </div>

            {hasActiveClientFilter && filteredRows.length > 0 ? (
              <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Client filter is applied to current page rows only.
              </div>
            ) : null}
          </div>
        ) : null}
      </div >

      <footer className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-t bg-card px-3 py-2 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="flex items-center gap-2">
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
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="truncate">{queryStats}</span>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  isDisabled={!canPrev}
                  className={cn(!canPrev && "pointer-events-none opacity-50")}
                  onPress={() => onRunPrevPage()}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  isDisabled={!canNext}
                  className={cn(!canNext && "pointer-events-none opacity-50")}
                  onPress={() => onRunNextPage()}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </footer>
    </>
  )
}
