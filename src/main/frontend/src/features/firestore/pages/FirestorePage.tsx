import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  DEFAULT_WHERE_ROW,
  EMPTY_JSON_TEMPLATE,
  EMPTY_NESTED_RESPONSE,
  type CrudBusy,
  type DocumentWriteRequest,
  type FilterCombinator,
  type FirestoreDocument,
  type FirestoreQueryRequest,
  type NestedResponse,
  type OrderClause,
  type OrderDirection,
  type PreviewCloseIntent,
  type PreviewValidationSummary,
  type QueryResponse,
  type TransferFormat,
  type WhereRow,
  type WriteMode,
} from "@/features/firestore/schemas/FirestoreSchema"
import {
  FirestoreConflictError,
  FirestoreIndexError,
  firestoreService,
  type FirestoreDocumentDetails,
} from "@/features/firestore/api/firestore-service"
import {
  buildWriteFields,
  computeDeleteFieldPaths,
  computeWritePreview,
  type FirestoreWireValue,
  type WritePreview,
} from "@/features/firestore/api/firestore-value-utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shadcn/components/ui/alert-dialog"
import { useMediaQuery } from "@/shadcn/hooks/use-media-query"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"
import { useTheme } from "@/shared/components/ui/shadcn/components/theme-provider"
import { useGcpStore, type ProjectTab } from "@/features/gcp/store/gcp-store"
import {
  loadQueryState,
  saveQueryState,
  type PersistedQueryState,
} from "@/features/firestore/api/query-state-storage"
import {
  addSavedQuery,
  clearHistory as clearHistoryStorage,
  loadHistory,
  loadSavedQueries,
  recordHistory,
  removeSavedQuery,
  renameSavedQuery as renameSavedQueryStorage,
  toggleSavedQueryFavorite,
  type HistoryEntry,
  type SavedQuery,
} from "@/features/firestore/api/saved-queries-storage"
import { FirestoreReconnectNotice } from "@/features/firestore/components/layout/FirestoreReconnectNotice"
import { FirestoreSavedQueries } from "@/features/firestore/components/query/FirestoreSavedQueries"
import { FirestoreCompareDialog } from "@/features/firestore/components/dialogs/FirestoreCompareDialog"
import { FirestoreProfilerDialog } from "@/features/firestore/components/dialogs/FirestoreProfilerDialog"
import { FirestoreBulkEditDialog } from "@/features/firestore/components/dialogs/FirestoreBulkEditDialog"
import { FirestoreBackupDialog } from "@/features/firestore/components/dialogs/FirestoreBackupDialog"
import { FirestoreWatchDialog } from "@/features/firestore/components/dialogs/FirestoreWatchDialog"
import { validateFields } from "@/features/firestore/api/schema-profiler"
import { loadRules } from "@/features/firestore/api/validation-rules-storage"
import { inferWireValue } from "@/features/firestore/api/firestore-value-utils"
import { useOpenCommandPalette, useRegisterCommands } from "@/shared/components/command/command-registry"
import { FirestoreCreateDrawer } from "@/features/firestore/components/dialogs/FirestoreCreateDrawer"
import { FirestoreDocumentPreviewPanel, type PreviewBusy, type PreviewTab } from "@/features/firestore/components/viewers/FirestoreDocumentPreviewPanel"
import { FirestoreFilterPanel } from "@/features/firestore/components/query/FirestoreFilterPanel"
import { WorkspaceControllerDeck } from "@/features/firestore/components/layout/WorkspaceControllerDeck"
import { FirestoreNestedTraverse } from "@/features/firestore/components/query/FirestoreNestedTraverse"
import { FirestoreQueryResults } from "@/features/firestore/components/query/FirestoreQueryResults"
import { FirestoreSidebar } from "@/features/firestore/components/layout/FirestoreSidebar"
import { FirestoreToFirestoreImportDialog } from "@/features/firestore/components/dialogs/FirestoreToFirestoreImportDialog"
import { Trash } from "lucide-react"
import {
  buildCollectionTransferJson,
  buildDocumentTransferJson,
  documentIdFromPath,
  parseCollectionTransferJson,
  parseDocumentTransferJson,
  parseTransferCsv,
  sanitizeFileNamePart,
  serializeTransferRecordsToCsv,
  toTransferRecord,
  triggerTextDownload,
} from "@/features/firestore/api/firestore-transfer-utils"
import {
  documentIdIsValid,
  generateFirestoreDocumentId,
  getPayloadOnly,
  normalizePath,
  parseJsonPayload,
  pathIsCollection,
} from "@/features/firestore/api/firestore-utils"

type PreviewDocumentSelection = {
  documentPath: string
  documentId: string
  payload: Record<string, unknown>
  /** FFP-101: canonical wire values of the loaded document, used to preserve types on save. */
  typedFields: Record<string, FirestoreWireValue>
  /** FFP-104: concurrency token; required for saving or deleting an existing document. */
  updateTime: string | null
}

type PreviewConflictState = {
  message: string
  latestDocument: FirestoreDocumentDetails | null
  pendingDraft: string
}

type PendingPreviewIntent =
  | { intent: "close" }
  | { intent: "switch"; nextSelection: PreviewDocumentSelection }

type FirestorePageProps = {
  tab: ProjectTab
}

const EMPTY_PREVIEW_VALIDATION: PreviewValidationSummary = {
  errorCount: 0,
  warningCount: 0,
  firstErrorMessage: "",
}
const NESTED_PAGE_SIZE = 25

// Stable no-op so the results component's effect deps don't change every render.
const noopFilterMatchCountChange = () => { }

export default function FirestorePage({ tab }: FirestorePageProps) {
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const isMobile = useIsMobile()
  const isNarrowDesktop = useMediaQuery("(max-width: 1280px)")
  const drawerMode = isMobile || isNarrowDesktop
  // FFP-201: a tab restored from storage has no live backend client until it is reattached.
  const { isTabAttached, markTabAttached, activeTabId } = useGcpStore()
  const attached = isTabAttached(tab.id)
  const isActiveTab = tab.id === activeTabId
  const openCommandPalette = useOpenCommandPalette()
  const context = useMemo(
    () => ({
      projectId: tab.projectId,
      databaseId: tab.databaseId,
    }),
    [tab.projectId, tab.databaseId],
  )

  // FFP-201: restore the persisted query form (never auto-run; requires attachment first).
  const persistedQuery = useMemo(() => loadQueryState(tab.id), [tab.id])

  const [leftSidebarExpanded, setLeftSidebarExpanded] = useState(true)
  const [rightSidebarExpanded, setRightSidebarExpanded] = useState(false)
  const [drawerCollectionsOpen, setDrawerCollectionsOpen] = useState(false)
  const [drawerNestedOpen, setDrawerNestedOpen] = useState(false)
  const [drawerFiltersOpen, setDrawerFiltersOpen] = useState(false)

  const [activeCollection, setActiveCollection] = useState("")
  const [queryPath, setQueryPath] = useState(persistedQuery?.queryPath ?? "")
  const [nestedIdFilter, setNestedIdFilter] = useState("")
  // FFP-203: multiple order clauses, an OR-group combinator, and a collection-group flag.
  const [orderClauses, setOrderClauses] = useState<OrderClause[]>(persistedQuery?.orderBy ?? [])
  const [filterCombinator, setFilterCombinator] = useState<FilterCombinator>(
    persistedQuery?.filterCombinator ?? "and",
  )
  const [collectionGroup, setCollectionGroup] = useState<boolean>(
    persistedQuery?.collectionGroup ?? false,
  )
  const [limit, setLimit] = useState(persistedQuery?.limit ?? 50)
  const [page, setPage] = useState(0)
  // FFP-105: cursors used to reach each page; index 0 is the first page (no cursor).
  const pageCursorsRef = useRef<(string | null)[]>([null])
  const [whereRows, setWhereRows] = useState<WhereRow[]>(
    persistedQuery?.whereRows && persistedQuery.whereRows.length > 0
      ? persistedQuery.whereRows
      : [{ ...DEFAULT_WHERE_ROW }],
  )
  const [searchQuery, setSearchQuery] = useState('')

  // FFP-202: saved queries and bounded history, per project/database.
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(() =>
    loadSavedQueries(tab.projectId, tab.databaseId),
  )
  const [queryHistory, setQueryHistory] = useState<HistoryEntry[]>(() =>
    loadHistory(tab.projectId, tab.databaseId),
  )

  // FFP-201: current serializable query form (no secrets/results).
  const currentQuerySnapshot = useCallback(
    (): PersistedQueryState => ({
      queryPath,
      whereRows,
      filterCombinator,
      collectionGroup,
      orderBy: orderClauses,
      limit,
    }),
    [queryPath, whereRows, filterCombinator, collectionGroup, orderClauses, limit],
  )

  // FFP-201: persist the (non-secret) query form on change so a refresh restores it.
  useEffect(() => {
    saveQueryState(tab.id, currentQuerySnapshot())
  }, [tab.id, currentQuerySnapshot])

  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState("")
  // FFP-203: create-index URL when a query fails for a missing composite index.
  const [queryIndexUrl, setQueryIndexUrl] = useState<string | null>(null)
  const [querySelectedRows, setQuerySelectedRows] = useState<
    Array<{
      key: string
      doc: Record<string, unknown>
      documentPath: string
      normalizedDocumentPath: string
      documentId: string
      payloadObject: Record<string, unknown>
      rowPreviewDisabled: boolean
      rowIsSelected: boolean
      searchText: string
    }>
  >([])

  const [createCollectionPath, setCreateCollectionPath] = useState("")
  const [createDocumentId, setCreateDocumentId] = useState("")
  const [createPayload, setCreatePayload] = useState(EMPTY_JSON_TEMPLATE)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [firestoreImportDialogOpen, setFirestoreImportDialogOpen] = useState(false)
  // FFP-301: comparison dialog
  const [compareOpen, setCompareOpen] = useState(false)
  // FFP-302: schema profiler dialog
  const [profilerOpen, setProfilerOpen] = useState(false)
  // FFP-303: bulk edit dialog
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  // FFP-304: backup & restore dialog
  const [backupOpen, setBackupOpen] = useState(false)
  // FFP-306: real-time watch dialog
  const [watchOpen, setWatchOpen] = useState(false)

  const [crudBusy, setCrudBusy] = useState<CrudBusy>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSelection, setPreviewSelection] = useState<PreviewDocumentSelection | null>(null)
  const [previewActiveTab, setPreviewActiveTab] = useState<PreviewTab>("tree")
  const [previewDraft, setPreviewDraft] = useState(EMPTY_JSON_TEMPLATE)
  const [previewSavedDraft, setPreviewSavedDraft] = useState(EMPTY_JSON_TEMPLATE)
  const [previewBusy, setPreviewBusy] = useState<PreviewBusy>(null)
  const [previewValidation, setPreviewValidation] =
    useState<PreviewValidationSummary>(EMPTY_PREVIEW_VALIDATION)
  const [previewDiscardOpen, setPreviewDiscardOpen] = useState(false)
  const [pendingPreviewIntent, setPendingPreviewIntent] = useState<PendingPreviewIntent | null>(
    null,
  )
  // FFP-102: explicit save mode; merge is the safe default.
  const [previewSaveMode, setPreviewSaveMode] = useState<WriteMode>("MERGE")
  // FFP-104: pending conflict returned by a stale write.
  const [previewConflict, setPreviewConflict] = useState<PreviewConflictState | null>(null)
  const [transferBusy, setTransferBusy] = useState(false)

  // FFP-002: Bulk delete confirmation state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeletePaths, setBulkDeletePaths] = useState<string[]>([])
  const collectionImportJsonInputRef = useRef<HTMLInputElement | null>(null)
  const collectionImportCsvInputRef = useRef<HTMLInputElement | null>(null)
  const documentImportJsonInputRef = useRef<HTMLInputElement | null>(null)
  const documentImportCsvInputRef = useRef<HTMLInputElement | null>(null)

  const collectionsQuery = useQuery({
    queryKey: ["firestore", "collections", tab.id],
    queryFn: () => firestoreService.getCollections(context),
    // FFP-201: never issue requests for a detached (unreattached) tab.
    enabled: attached,
  })

  const collections = collectionsQuery.data ?? []
  const collectionsLoading = collectionsQuery.isFetching
  const nestedPath = useMemo(() => normalizePath(queryPath), [queryPath])
  const normalizedNestedIdFilter = useMemo(() => nestedIdFilter.trim(), [nestedIdFilter])
  const nestedQuery = useInfiniteQuery({
    queryKey: ["firestore", tab.id, "nested", nestedPath, NESTED_PAGE_SIZE, normalizedNestedIdFilter],
    enabled: Boolean(nestedPath) && attached,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      firestoreService.getNested(
        context,
        nestedPath,
        NESTED_PAGE_SIZE,
        pageParam,
        normalizedNestedIdFilter,
      ),
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo?.hasMore ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
  })

  const nestedResponse = useMemo<NestedResponse | null>(() => {
    if (!nestedPath) {
      return { ...EMPTY_NESTED_RESPONSE }
    }

    const pages = nestedQuery.data?.pages ?? []
    if (pages.length === 0) {
      if (nestedQuery.isError) {
        return {
          currentPath: nestedPath,
          parentPath: "",
          nodeType: "empty",
          documentNodes: [],
          childCollectionNodes: [],
          nestedHint: "",
          nestedError:
            nestedQuery.error instanceof Error
              ? nestedQuery.error.message
              : "Failed to load nested traversal.",
          pageInfo: {
            nextCursor: null,
            hasMore: false,
            returnedCount: 0,
            limit: NESTED_PAGE_SIZE,
          },
        }
      }
      return null
    }

    const firstPage = pages[0]
    if (firstPage.nodeType === "collection") {
      const mergedDocumentNodes = pages.flatMap((pageData) => pageData.documentNodes)
      const lastPage = pages[pages.length - 1] ?? firstPage
      return {
        ...firstPage,
        documentNodes: mergedDocumentNodes,
        pageInfo: lastPage.pageInfo,
      }
    }

    if (firstPage.nodeType === "document") {
      const mergedChildCollectionNodes = pages.flatMap((pageData) => pageData.childCollectionNodes)
      const lastPage = pages[pages.length - 1] ?? firstPage
      return {
        ...firstPage,
        childCollectionNodes: mergedChildCollectionNodes,
        pageInfo: lastPage.pageInfo,
      }
    }

    return firstPage
  }, [nestedPath, nestedQuery.data, nestedQuery.error, nestedQuery.isError])

  const nestedLoading = Boolean(nestedPath) && nestedQuery.isLoading

  function resolveDocumentPathFromRecord(document: FirestoreDocument): string {
    return typeof document._path === "string" ? normalizePath(document._path) : ""
  }

  function extractTypedFields(document: FirestoreDocument): Record<string, FirestoreWireValue> {
    const typed = document._typedFields
    if (typed && typeof typed === "object" && !Array.isArray(typed)) {
      return typed as Record<string, FirestoreWireValue>
    }
    return {}
  }

  function getDocumentPreviewSelection(
    response: QueryResponse,
    documentPath: string,
  ): PreviewDocumentSelection | null {
    const normalizedTarget = normalizePath(documentPath)
    if (!normalizedTarget) {
      return null
    }

    for (const document of response.documents) {
      const currentPath = resolveDocumentPathFromRecord(document)
      if (currentPath !== normalizedTarget) {
        continue
      }

      const documentId = typeof document.id === "string" ? document.id : "(no-id)"
      return {
        documentPath: currentPath,
        documentId,
        payload: getPayloadOnly(document),
        typedFields: extractTypedFields(document),
        updateTime: typeof document._updateTime === "string" ? document._updateTime : null,
      }
    }

    return null
  }

  function selectionFromDetails(
    documentPath: string,
    details: FirestoreDocumentDetails,
    fallbackDocumentId = "",
  ): PreviewDocumentSelection {
    return {
      documentPath,
      documentId: details.id.trim() || fallbackDocumentId,
      payload: details.fields,
      typedFields: details.typedFields,
      updateTime: details.updateTime,
    }
  }

  const queryStats = useMemo(() => {
    if (!queryResponse) {
      return "0 documents found in 0ms"
    }
    return `${queryResponse.resultCount} documents found in ${queryResponse.elapsedMs}ms`
  }, [queryResponse])

  // FFP-102: live preview of the fields the selected save mode would add, change, and delete.
  const previewWriteSummary = useMemo<{ preview: WritePreview | null; error: string }>(() => {
    if (!previewOpen || !previewSelection) {
      return { preview: null, error: "" }
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(previewDraft)
    } catch {
      // The JSON editor already surfaces syntax errors while typing.
      return { preview: null, error: "" }
    }

    try {
      return {
        preview: computeWritePreview(payload, previewSelection.typedFields, previewSaveMode),
        error: "",
      }
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : "Could not compute the save preview.",
      }
    }
  }, [previewOpen, previewSelection, previewDraft, previewSaveMode])

  // FFP-002: Bulk delete paths are prepared in requestBulkDelete() using querySelectedRows directly

  function resolveCollectionTransferPath(): string {
    const normalizedQueryPath = normalizePath(queryPath)
    if (pathIsCollection(normalizedQueryPath)) {
      return normalizedQueryPath
    }

    const normalizedActiveCollection = normalizePath(activeCollection)
    if (pathIsCollection(normalizedActiveCollection)) {
      return normalizedActiveCollection
    }

    const queryRoot = normalizedQueryPath.split("/")[0] ?? ""
    return pathIsCollection(queryRoot) ? queryRoot : ""
  }

  function transferControlsDisabled(): boolean {
    return transferBusy || crudBusy !== null || previewBusy !== null || queryLoading
  }

  function collectionExportFileName(
    collectionPath: string,
    source: "current-page" | "full-collection",
    format: TransferFormat,
  ): string {
    const safePath = sanitizeFileNamePart(collectionPath)
    const safeSource = source === "full-collection" ? "full" : "page"
    return `${safePath}_${safeSource}.${format}`
  }

  function documentExportFileName(documentPath: string, format: TransferFormat): string {
    const safePath = sanitizeFileNamePart(documentPath)
    return `${safePath}.${format}`
  }

  function resetFileInput(
    inputRef: { current: HTMLInputElement | null },
  ) {
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  function normalizeCollectionImportRecord(
    record: {
      id: string
      path?: string
      payload: Record<string, unknown>
    },
    targetCollectionPath: string,
    index: number,
  ): { documentPath: string; payload: Record<string, unknown> } {
    const normalizedCollectionPath = normalizePath(targetCollectionPath)
    const normalizedId = record.id.trim()
    if (!documentIdIsValid(normalizedId)) {
      throw new Error(`Row ${index + 1} has an invalid document id.`)
    }

    const normalizedRecordPath = normalizePath(record.path ?? "")
    if (!normalizedRecordPath) {
      return {
        documentPath: `${normalizedCollectionPath}/${normalizedId}`,
        payload: record.payload,
      }
    }

    const requiredPrefix = `${normalizedCollectionPath}/`
    if (!normalizedRecordPath.startsWith(requiredPrefix)) {
      throw new Error(
        `Row ${index + 1} path must be under '${normalizedCollectionPath}'.`,
      )
    }

    const tail = normalizedRecordPath.slice(requiredPrefix.length)
    if (!tail || tail.includes("/")) {
      throw new Error(
        `Row ${index + 1} path must target a direct document under '${normalizedCollectionPath}'.`,
      )
    }

    if (tail !== normalizedId) {
      throw new Error(`Row ${index + 1} id does not match the path document id.`)
    }

    return {
      documentPath: normalizedRecordPath,
      payload: record.payload,
    }
  }

  async function exportCollectionCurrentPage(format: TransferFormat) {
    if (!queryResponse || queryResponse.documents.length === 0) {
      toast.error("Run a query with results before exporting the current page.")
      return
    }

    const collectionPath = normalizePath(queryResponse.path)
    if (!pathIsCollection(collectionPath)) {
      toast.error("Current query path is not a collection path.")
      return
    }

    try {
      const records = queryResponse.documents.map((document) =>
        toTransferRecord(document, collectionPath),
      )

      if (format === "json") {
        const jsonPayload = buildCollectionTransferJson(collectionPath, records)
        triggerTextDownload(
          collectionExportFileName(collectionPath, "current-page", format),
          jsonPayload,
          "application/json;charset=utf-8",
        )
      } else {
        const csvPayload = serializeTransferRecordsToCsv(records)
        triggerTextDownload(
          collectionExportFileName(collectionPath, "current-page", format),
          csvPayload,
          "text/csv;charset=utf-8",
        )
      }
      toast.success(`Exported ${records.length} document(s) from current page.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Collection export failed."
      toast.error(message)
    }
  }

  async function exportCollectionFull(format: TransferFormat) {
    const collectionPath = resolveCollectionTransferPath()
    if (!collectionPath) {
      toast.error("Set a collection path first to export the full collection.")
      return
    }

    setTransferBusy(true)
    try {
      const documents = await firestoreService.getCollectionDocuments(context, collectionPath)
      const records = documents.map((document) =>
        toTransferRecord(document, collectionPath),
      )

      if (format === "json") {
        const jsonPayload = buildCollectionTransferJson(collectionPath, records)
        triggerTextDownload(
          collectionExportFileName(collectionPath, "full-collection", format),
          jsonPayload,
          "application/json;charset=utf-8",
        )
      } else {
        const csvPayload = serializeTransferRecordsToCsv(records)
        triggerTextDownload(
          collectionExportFileName(collectionPath, "full-collection", format),
          csvPayload,
          "text/csv;charset=utf-8",
        )
      }
      toast.success(`Exported ${records.length} document(s) from '${collectionPath}'.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Full collection export failed."
      toast.error(message)
    } finally {
      setTransferBusy(false)
    }
  }

  function requestCollectionImport(format: TransferFormat) {
    if (transferControlsDisabled()) {
      return
    }

    if (format === "json") {
      collectionImportJsonInputRef.current?.click()
      return
    }
    collectionImportCsvInputRef.current?.click()
  }

  async function handleCollectionImportFile(file: File, format: TransferFormat) {
    const targetCollectionPath = resolveCollectionTransferPath()
    if (!targetCollectionPath) {
      toast.error("Set a collection path first to import documents.")
      return
    }

    setTransferBusy(true)
    try {
      const content = await file.text()
      const importedRecords =
        format === "json"
          ? (() => {
            const parsed = parseCollectionTransferJson(content)
            if (normalizePath(parsed.path) !== normalizePath(targetCollectionPath)) {
              throw new Error(
                `Import file path '${parsed.path}' does not match target collection '${targetCollectionPath}'.`,
              )
            }
            return parsed.records
          })()
          : parseTransferCsv(content)

      const upsertRecords = importedRecords.map((record, index) =>
        normalizeCollectionImportRecord(record, targetCollectionPath, index),
      )
      const uniquePaths = new Set<string>()
      for (const entry of upsertRecords) {
        if (uniquePaths.has(entry.documentPath)) {
          throw new Error(`Duplicate document path in import: '${entry.documentPath}'.`)
        }
        uniquePaths.add(entry.documentPath)
      }

      toast(`Import started: ${upsertRecords.length} document(s).`)
      for (let index = 0; index < upsertRecords.length; index += 1) {
        const item = upsertRecords[index]
        await firestoreService.replaceDocument(context, item.documentPath, item.payload)
        if ((index + 1) % 25 === 0 || index + 1 === upsertRecords.length) {
          toast(`Imported ${index + 1}/${upsertRecords.length} document(s).`)
        }
      }

      await refreshCollections()
      await runQuery(0, targetCollectionPath)
      await refreshNested(targetCollectionPath)
      toast.success(`Import completed: ${upsertRecords.length} document(s) replaced/upserted.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Collection import failed."
      toast.error(message)
    } finally {
      setTransferBusy(false)
    }
  }

  function requestDocumentImport(format: TransferFormat) {
    if (transferControlsDisabled()) {
      return
    }

    if (!previewSelection?.documentPath) {
      toast.error("Open a document preview first.")
      return
    }

    if (format === "json") {
      documentImportJsonInputRef.current?.click()
      return
    }
    documentImportCsvInputRef.current?.click()
  }

  async function exportDocument(format: TransferFormat) {
    if (!previewSelection) {
      toast.error("Open a document preview first.")
      return
    }

    const normalizedDocumentPath = normalizePath(previewSelection.documentPath)
    if (!normalizedDocumentPath || pathIsCollection(normalizedDocumentPath)) {
      toast.error("Document path is invalid.")
      return
    }

    const docId = previewSelection.documentId.trim() || documentIdFromPath(normalizedDocumentPath)
    if (!docId) {
      toast.error("Document id is missing.")
      return
    }

    try {
      if (format === "json") {
        const jsonPayload = buildDocumentTransferJson(
          normalizedDocumentPath,
          docId,
          previewSelection.payload,
        )
        triggerTextDownload(
          documentExportFileName(normalizedDocumentPath, format),
          jsonPayload,
          "application/json;charset=utf-8",
        )
      } else {
        const csvPayload = serializeTransferRecordsToCsv([
          {
            id: docId,
            path: normalizedDocumentPath,
            payload: previewSelection.payload,
          },
        ])
        triggerTextDownload(
          documentExportFileName(normalizedDocumentPath, format),
          csvPayload,
          "text/csv;charset=utf-8",
        )
      }

      toast.success("Document exported.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document export failed."
      toast.error(message)
    }
  }

  async function handleDocumentImportFile(file: File, format: TransferFormat) {
    if (!previewSelection) {
      toast.error("Open a document preview first.")
      return
    }

    const normalizedPreviewPath = normalizePath(previewSelection.documentPath)
    const normalizedPreviewId =
      previewSelection.documentId.trim() || documentIdFromPath(normalizedPreviewPath)
    if (!normalizedPreviewPath || !normalizedPreviewId || pathIsCollection(normalizedPreviewPath)) {
      toast.error("Document path is invalid.")
      return
    }

    setTransferBusy(true)
    try {
      const content = await file.text()
      const importedRecord =
        format === "json"
          ? parseDocumentTransferJson(content)
          : (() => {
            const rows = parseTransferCsv(content)
            if (rows.length !== 1) {
              throw new Error("Document CSV import must contain exactly one data row.")
            }
            return rows[0]
          })()

      const importedPath = normalizePath(importedRecord.path ?? "")
      const importedId = importedRecord.id.trim()
      if (importedId !== normalizedPreviewId) {
        throw new Error(
          `Imported id '${importedId}' does not match the selected document id '${normalizedPreviewId}'.`,
        )
      }
      if (importedPath && documentIdFromPath(importedPath) !== importedId) {
        throw new Error("Imported path and id are inconsistent.")
      }
      const resolvedPath = importedPath || `${normalizedPreviewPath.split("/").slice(0, -1).join("/")}/${importedId}`
      const resolvedId = documentIdFromPath(resolvedPath)

      if (resolvedPath !== normalizedPreviewPath) {
        throw new Error(
          `Imported path '${resolvedPath}' does not match the selected document '${normalizedPreviewPath}'.`,
        )
      }
      if (resolvedId !== normalizedPreviewId) {
        throw new Error(
          `Imported id '${resolvedId}' does not match the selected document id '${normalizedPreviewId}'.`,
        )
      }

      await firestoreService.replaceDocument(context, normalizedPreviewPath, importedRecord.payload)
      toast.success("Document import completed.")

      const refreshed = await runQuery(page)
      await refreshNested(queryPath)

      if (refreshed) {
        const nextSelection = getDocumentPreviewSelection(refreshed, normalizedPreviewPath)
        if (nextSelection) {
          const nextDraft = JSON.stringify(nextSelection.payload, null, 2)
          setPreviewSelection(nextSelection)
          setPreviewDraft(nextDraft)
          setPreviewSavedDraft(nextDraft)
          setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
          toast.success("Document replaced from import.")
        } else {
          toast.warning("Document replaced, but it is outside the current query results.")
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Document import failed."
      toast.error(message)
    } finally {
      setTransferBusy(false)
    }
  }

  async function refreshCollections() {
    const result = await collectionsQuery.refetch()
    if (result.error) {
      toast.error(result.error.message || "Failed to load collections.")
      return
    }
    if (!activeCollection && result.data && result.data.length > 0) {
      setActiveCollection(result.data[0])
    }
  }

  async function refreshNested(pathValue: string) {
    const normalized = normalizePath(pathValue)
    if (!normalized) {
      setQueryPath("")
      return
    }

    const currentPath = normalizePath(queryPath)
    if (currentPath !== normalized) {
      setQueryPath(`/${normalized}`)
      return
    }

    await nestedQuery.refetch()
  }

  /**
   * FFP-105: Runs the query for the given page index using the opaque cursor recorded when the
   * page was first reached. Page 0 resets the cursor history; the next page's cursor is stored
   * from each response.
   */
  async function runQuery(
    nextPage: number,
    pathOverride?: string,
    snapshot?: PersistedQueryState,
  ): Promise<QueryResponse | null> {
    if (!attached) {
      toast.warning("Reconnect this tab before running queries.")
      return null
    }
    // FFP-202: when re-running a saved/history entry, build from its snapshot instead of state.
    const source: PersistedQueryState = snapshot ?? currentQuerySnapshot()
    const effectiveLimit = source.limit
    const normalizedPath = normalizePath(pathOverride ?? source.queryPath)
    if (!normalizedPath) {
      setQueryError("Collection path is required.")
      setQueryResponse(null)
      return null
    }
    if (!pathIsCollection(normalizedPath)) {
      setQueryError("Path must contain an odd number of segments (collection path).")
      setQueryResponse(null)
      return null
    }

    if (nextPage <= 0) {
      pageCursorsRef.current = [null]
    }
    const boundedPage = Math.max(0, Math.min(nextPage, pageCursorsRef.current.length - 1))
    const cursor = pageCursorsRef.current[boundedPage] ?? null

    const request: FirestoreQueryRequest = {
      path: normalizedPath,
      cursor,
      limit: effectiveLimit,
      filterCombinator: source.filterCombinator,
      collectionGroup: source.collectionGroup,
      orderBy: source.orderBy.filter((clause) => clause.field.trim()),
      filters: source.whereRows.map((row) => ({
        field: row.field,
        operator: row.operator,
        value: row.value,
        type: row.type,
        groupId: row.groupId,
      })),
    }

    setQueryLoading(true)
    setQueryError("")
    setQueryIndexUrl(null)

    try {
      const response = await queryClient.fetchQuery({
        queryKey: ["firestore", tab.id, "query", request],
        queryFn: () => firestoreService.runQuery(context, request),
      })

      if (response.hasNextPage && response.nextCursor) {
        pageCursorsRef.current = [
          ...pageCursorsRef.current.slice(0, boundedPage + 1),
          response.nextCursor,
        ]
      } else {
        pageCursorsRef.current = pageCursorsRef.current.slice(0, boundedPage + 1)
      }

      const augmented: QueryResponse = {
        ...response,
        pageIndex: boundedPage,
        hasPreviousPage: boundedPage > 0,
        pageStart: response.documents.length > 0 ? boundedPage * effectiveLimit + 1 : 0,
        pageEnd: boundedPage * effectiveLimit + response.documents.length,
      }

      setQueryResponse(augmented)
      setPage(boundedPage)
      setQueryPath(`/${augmented.path}`)
      const root = augmented.path.split("/")[0]
      setActiveCollection(root)

      // FFP-202: record the executed query in history (first page only).
      if (boundedPage === 0) {
        const executed: PersistedQueryState = { ...source, queryPath: `/${augmented.path}` }
        setQueryHistory(recordHistory(tab.projectId, tab.databaseId, executed))
      }
      return augmented
    } catch (error) {
      // FFP-203: a missing composite index yields an actionable create-index link.
      if (error instanceof FirestoreIndexError) {
        setQueryError(error.message)
        setQueryIndexUrl(error.indexUrl)
        setQueryResponse(null)
        return null
      }
      const message = error instanceof Error ? error.message : "Query failed."
      setQueryError(message)
      setQueryResponse(null)
      return null
    } finally {
      setQueryLoading(false)
    }
  }

  async function handleCreateDocument() {
    const normalizedPath = normalizePath(createCollectionPath)
    const normalizedDocId = createDocumentId.trim()

    if (!normalizedPath) {
      toast.warning("Collection path is required.")
      return
    }
    if (!pathIsCollection(normalizedPath)) {
      toast.warning("Collection path must have odd path segments.")
      return
    }
    if (!documentIdIsValid(normalizedDocId)) {
      toast.warning("Document ID cannot contain '/' and cannot be '.' or '..'.")
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(createPayload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid create payload.")
      return
    }

    // FFP-302: advisory local-rules validation before writing (never blocks).
    const rules = loadRules(tab.projectId, tab.databaseId, normalizedPath)
    if (rules.requiredPaths.length > 0 || Object.keys(rules.expectedTypes).length > 0) {
      const typedFields: Record<string, ReturnType<typeof inferWireValue>> = {}
      for (const [key, value] of Object.entries(payload)) {
        typedFields[key] = inferWireValue(value)
      }
      const issues = validateFields(typedFields, rules)
      if (issues.length > 0) {
        toast.warning(`Local schema rules: ${issues.map((issue) => issue.message).join(" ")}`)
      }
    }

    setCrudBusy("create")
    try {
      await firestoreService.createDocument(
        context,
        normalizedPath,
        payload,
        normalizedDocId || undefined,
      )
      toast.success("Document created successfully.")
      setCreateCollectionPath("")
      setCreateDocumentId("")
      setCreatePayload(EMPTY_JSON_TEMPLATE)
      setCreateDrawerOpen(false)
      await refreshCollections()
      await runQuery(0, normalizedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed."
      toast.error(message)
    } finally {
      setCrudBusy(null)
    }
  }

  function addWhereFilterRow() {
    const nextId = whereRows.reduce((acc, row) => Math.max(acc, row.id), 0) + 1
    // FFP-203: a plain "Add filter" appends to the last group (AND within a group).
    const lastGroup = whereRows.length > 0 ? whereRows[whereRows.length - 1].groupId : 0
    setWhereRows((prev) => [
      ...prev,
      { id: nextId, field: "", operator: "==", value: "", type: "string", groupId: lastGroup },
    ])
  }

  function addWhereOrGroup() {
    const nextId = whereRows.reduce((acc, row) => Math.max(acc, row.id), 0) + 1
    // FFP-203: a new OR group so the next clause is OR-combined with the previous groups.
    const nextGroup = whereRows.reduce((acc, row) => Math.max(acc, row.groupId), 0) + 1
    setWhereRows((prev) => [
      ...prev,
      { id: nextId, field: "", operator: "==", value: "", type: "string", groupId: nextGroup },
    ])
  }

  function removeWhereFilterRow(id: number) {
    setWhereRows((prev) => {
      if (prev.length <= 1) {
        return prev.map((row) =>
          row.id === id
            ? { ...row, field: "", operator: "==", value: "", type: "string", groupId: 0 }
            : row,
        )
      }
      return prev.filter((row) => row.id !== id)
    })
  }

  function setWhereRowValue(
    id: number,
    key: "field" | "operator" | "value" | "type",
    value: string,
  ) {
    setWhereRows((prev) => prev.map((row) => (row.id === id ? { ...row, [key]: value } : row)))
  }

  // FFP-203: order-clause management.
  function addOrderClause() {
    setOrderClauses((prev) => [...prev, { field: "", direction: "desc" }])
  }

  function removeOrderClause(index: number) {
    setOrderClauses((prev) => prev.filter((_, i) => i !== index))
  }

  function setOrderClauseValue(index: number, key: "field" | "direction", value: string) {
    setOrderClauses((prev) =>
      prev.map((clause, i) =>
        i === index
          ? { ...clause, [key]: key === "direction" ? (value as OrderDirection) : value }
          : clause,
      ),
    )
  }

  // FFP-202: load a saved/history query snapshot into the form and run it.
  function applyQuerySnapshot(snapshot: PersistedQueryState) {
    setQueryPath(snapshot.queryPath)
    setWhereRows(
      snapshot.whereRows.length > 0 ? snapshot.whereRows : [{ ...DEFAULT_WHERE_ROW }],
    )
    setFilterCombinator(snapshot.filterCombinator)
    setCollectionGroup(snapshot.collectionGroup)
    setOrderClauses(snapshot.orderBy)
    setLimit(snapshot.limit)
    setPage(0)
    void runQuery(0, snapshot.queryPath, snapshot)
  }

  function handleSaveCurrentQuery(name: string) {
    setSavedQueries(addSavedQuery(tab.projectId, tab.databaseId, name, currentQuerySnapshot()))
    toast.success("Query saved.")
  }

  function handleDeleteSavedQuery(id: string) {
    setSavedQueries(removeSavedQuery(tab.projectId, tab.databaseId, id))
  }

  function handleRenameSavedQuery(id: string, name: string) {
    setSavedQueries(renameSavedQueryStorage(tab.projectId, tab.databaseId, id, name))
  }

  function handleToggleSavedQueryFavorite(id: string) {
    setSavedQueries(toggleSavedQueryFavorite(tab.projectId, tab.databaseId, id))
  }

  function handleClearHistory() {
    clearHistoryStorage(tab.projectId, tab.databaseId)
    setQueryHistory([])
  }

  // FFP-206: query commands, registered only while this tab is the active, attached one.
  function toggleFilterPanel() {
    if (drawerMode) {
      setDrawerFiltersOpen((open) => !open)
    } else {
      setRightSidebarExpanded((open) => !open)
    }
  }

  function toggleCollectionsPanel() {
    if (drawerMode) {
      setDrawerCollectionsOpen((open) => !open)
    } else {
      setLeftSidebarExpanded((open) => !open)
    }
  }

  const isMod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  const modLabel = isMod ? "⌘" : "Ctrl"
  useRegisterCommands(
    "firestore-query",
    isActiveTab && attached
      ? [
          {
            id: "query.run",
            label: "Run query",
            group: "Query",
            shortcut: "mod+enter",
            shortcutLabel: `${modLabel}↵`,
            run: () => void runQuery(0),
          },
          {
            id: "query.save",
            label: "Save current query",
            group: "Query",
            run: () => handleSaveCurrentQuery(normalizePath(queryPath) || ""),
          },
          {
            id: "doc.create",
            label: "New document",
            group: "Query",
            run: () => openCreateFromHeader(),
          },
          {
            id: "tools.compare",
            label: "Compare documents/collections",
            group: "Tools",
            run: () => setCompareOpen(true),
          },
          {
            id: "tools.profile",
            label: "Profile collection schema",
            group: "Tools",
            run: () => setProfilerOpen(true),
          },
          {
            id: "tools.bulkEdit",
            label: "Bulk edit selected documents",
            group: "Tools",
            run: () => {
              if (querySelectedRows.length === 0) {
                toast.warning("Select documents to bulk edit first.")
                return
              }
              setBulkEditOpen(true)
            },
          },
          {
            id: "tools.backup",
            label: "Backup / restore",
            group: "Tools",
            run: () => setBackupOpen(true),
          },
          {
            id: "tools.watch",
            label: "Watch (real-time)",
            group: "Tools",
            run: () => setWatchOpen(true),
          },
          {
            id: "panel.filters",
            label: "Toggle filter panel",
            group: "Panels",
            run: () => toggleFilterPanel(),
          },
          {
            id: "panel.collections",
            label: "Toggle collections panel",
            group: "Panels",
            run: () => toggleCollectionsPanel(),
          },
          {
            id: "palette.open",
            label: "Open command palette",
            group: "General",
            shortcutLabel: `${modLabel}K`,
            run: () => openCommandPalette(),
          },
        ]
      : [],
  )

  function runCollectionQuery(collection: string) {
    const normalized = normalizePath(collection)
    setActiveCollection(normalized)
    setQueryPath(`/${normalized}`)
    setPage(0)
    void runQuery(0, normalized)
  }

  function openCreateFromHeader() {
    const normalizedQueryPath = normalizePath(queryPath)
    const querySegments = normalizedQueryPath ? normalizedQueryPath.split("/") : []
    let resolvedPath = ""

    if (pathIsCollection(normalizedQueryPath)) {
      resolvedPath = normalizedQueryPath
    } else if (querySegments.length > 1) {
      const parentCollectionPath = querySegments.slice(0, -1).join("/")
      if (pathIsCollection(parentCollectionPath)) {
        resolvedPath = parentCollectionPath
      }
    }

    if (!resolvedPath) {
      const normalizedCollection = normalizePath(activeCollection)
      resolvedPath = pathIsCollection(normalizedCollection) ? normalizedCollection : ""
    }

    setCreateCollectionPath(resolvedPath)
    setCreateDrawerOpen(true)
  }

  function handleGenerateCreateDocumentId() {
    setCreateDocumentId(generateFirestoreDocumentId())
  }

  function handleDiscardCreateDraft() {
    setCreateCollectionPath("")
    setCreateDocumentId("")
    setCreatePayload(EMPTY_JSON_TEMPLATE)
  }

  function applyPreviewSelection(selection: PreviewDocumentSelection) {
    const nextDraft = JSON.stringify(selection.payload, null, 2)
    setPreviewSelection(selection)
    setPreviewDraft(nextDraft)
    setPreviewSavedDraft(nextDraft)
    setPreviewActiveTab("tree")
    setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
    setPreviewSaveMode("MERGE")
    setPreviewConflict(null)
    setPreviewOpen(true)
  }

  function clearPreviewSelection() {
    setPreviewOpen(false)
    setPreviewSelection(null)
    setPreviewDraft(EMPTY_JSON_TEMPLATE)
    setPreviewSavedDraft(EMPTY_JSON_TEMPLATE)
    setPreviewActiveTab("tree")
    setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
    setPreviewSaveMode("MERGE")
    setPreviewConflict(null)
    setPendingPreviewIntent(null)
    setPreviewDiscardOpen(false)
  }

  function hasUnsavedPreviewDraft() {
    return (
      previewSelection !== null &&
      previewOpen &&
      previewDraft.trim().length > 0 &&
      previewDraft !== previewSavedDraft
    )
  }

  function requestPreviewClose(intent: PreviewCloseIntent, nextSelection?: PreviewDocumentSelection) {
    if (previewBusy !== null) {
      return
    }

    const dirtyDraft = hasUnsavedPreviewDraft()
    if (dirtyDraft) {
      if (intent === "switch" && nextSelection) {
        setPendingPreviewIntent({ intent: "switch", nextSelection })
      } else {
        setPendingPreviewIntent({ intent: "close" })
      }
      setPreviewDiscardOpen(true)
      return
    }

    if (intent === "switch" && nextSelection) {
      applyPreviewSelection(nextSelection)
      return
    }

    clearPreviewSelection()
  }

  function openPreviewFromRow(
    documentPath: string,
    documentId: string,
    payload: Record<string, unknown>,
  ) {
    const normalizedPath = normalizePath(documentPath)
    if (!normalizedPath) {
      return
    }

    // Prefer the typed fields and update time captured by the query so saves can preserve
    // native value types and detect concurrent edits.
    const fromQuery = queryResponse
      ? getDocumentPreviewSelection(queryResponse, normalizedPath)
      : null
    const nextSelection: PreviewDocumentSelection = fromQuery ?? {
      documentPath: normalizedPath,
      documentId,
      payload,
      typedFields: {},
      updateTime: null,
    }

    const currentPath = normalizePath(previewSelection?.documentPath ?? "")
    if (previewOpen && currentPath === normalizedPath) {
      setPreviewOpen(true)
      return
    }

    requestPreviewClose("switch", nextSelection)
  }

  async function openPreviewFromNestedDocument(documentPath: string, documentId: string) {
    const normalizedPath = normalizePath(documentPath)
    if (!normalizedPath) {
      toast.error("Document path is required to open preview.")
      return
    }
    if (pathIsCollection(normalizedPath)) {
      toast.error("Only document nodes can be previewed.")
      return
    }

    try {
      const details = await firestoreService.getDocumentDetails(context, normalizedPath)
      const nextSelection = selectionFromDetails(normalizedPath, details, documentId)

      const currentPath = normalizePath(previewSelection?.documentPath ?? "")
      if (previewOpen && currentPath === normalizedPath) {
        setPreviewOpen(true)
        return
      }
      requestPreviewClose("switch", nextSelection)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load document preview."
      toast.error(message)
    }
  }

  function updatePreviewOpen(nextOpen: boolean) {
    if (nextOpen) {
      setPreviewOpen(true)
      return
    }
    requestPreviewClose("close")
  }

  function handlePreviewDiscardCancel() {
    setPreviewDiscardOpen(false)
    setPendingPreviewIntent(null)
  }

  function handlePreviewDiscardConfirm() {
    if (!pendingPreviewIntent) {
      setPreviewDiscardOpen(false)
      return
    }

    if (pendingPreviewIntent.intent === "switch") {
      applyPreviewSelection(pendingPreviewIntent.nextSelection)
      setPendingPreviewIntent(null)
      setPreviewDiscardOpen(false)
      return
    }

    clearPreviewSelection()
  }

  async function handlePreviewRefresh() {
    const normalizedPath = normalizePath(previewSelection?.documentPath ?? "")
    if (!normalizedPath) return

    setPreviewBusy("refresh")
    try {
      const details = await firestoreService.getDocumentDetails(context, normalizedPath)
      const nextSelection = selectionFromDetails(
        normalizedPath,
        details,
        previewSelection?.documentId ?? "",
      )
      const nextDraft = JSON.stringify(nextSelection.payload, null, 2)
      setPreviewSelection(nextSelection)
      setPreviewDraft(nextDraft)
      setPreviewSavedDraft(nextDraft)
      setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
      setPreviewConflict(null)
      toast.success("Document reloaded.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reload document."
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
  }

  /**
   * FFP-102/FFP-103/FFP-104: Saves the preview draft using the safe write contract. The selected
   * mode is explicit, merge saves send explicit delete paths for removed fields, untouched values
   * keep their native Firestore types, and stale writes surface a conflict dialog instead of
   * silently overwriting.
   */
  async function handlePreviewUpdate(
    draftOverride?: string,
    expectedUpdateTimeOverride?: string | null,
  ) {
    const selection = previewSelection
    const normalizedPath = normalizePath(selection?.documentPath ?? "")
    if (!selection || !normalizedPath) {
      toast.warning("Document path is required.")
      return
    }
    if (pathIsCollection(normalizedPath)) {
      toast.warning("Document path must have even path segments.")
      return
    }

    const draft = draftOverride ?? previewDraft
    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(draft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON payload.")
      return
    }

    let writeRequest: DocumentWriteRequest
    try {
      writeRequest = {
        mode: previewSaveMode,
        fields: buildWriteFields(payload, selection.typedFields),
        deleteFieldPaths:
          previewSaveMode === "MERGE"
            ? computeDeleteFieldPaths(selection.typedFields, payload)
            : [],
        expectedUpdateTime:
          expectedUpdateTimeOverride !== undefined
            ? expectedUpdateTimeOverride
            : selection.updateTime,
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the save request.")
      return
    }

    setPreviewBusy("update")
    try {
      const savedDetails = await firestoreService.writeDocument(context, normalizedPath, writeRequest)
      const deletedCount = writeRequest.deleteFieldPaths.length
      toast.success(
        previewSaveMode === "MERGE"
          ? `Document merged${deletedCount > 0 ? ` (${deletedCount} field(s) deleted)` : ""}.`
          : "Document replaced.",
      )

      const nextSelection = selectionFromDetails(normalizedPath, savedDetails, selection.documentId)
      const nextDraft = JSON.stringify(nextSelection.payload, null, 2)
      setPreviewSelection(nextSelection)
      setPreviewDraft(nextDraft)
      setPreviewSavedDraft(nextDraft)
      setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
      setPreviewConflict(null)

      await runQuery(page)
      await refreshNested(queryPath)
    } catch (error) {
      if (error instanceof FirestoreConflictError) {
        setPreviewConflict({
          message: error.message,
          latestDocument: error.latestDocument,
          pendingDraft: draft,
        })
        return
      }
      const message = error instanceof Error ? error.message : "Update failed."
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
  }

  /** FFP-104: Conflict dialog action - discard the local draft and load the latest server version. */
  async function handleConflictReload() {
    setPreviewConflict(null)
    await handlePreviewRefresh()
  }

  /**
   * FFP-104: Conflict dialog action - intentionally overwrite the concurrent edit by retrying
   * the save against the latest server update time.
   */
  async function handleConflictOverwrite() {
    const conflict = previewConflict
    if (!conflict) {
      return
    }
    setPreviewConflict(null)
    await handlePreviewUpdate(conflict.pendingDraft, conflict.latestDocument?.updateTime ?? null)
  }

  async function handlePreviewDelete() {
    const normalizedPath = normalizePath(previewSelection?.documentPath ?? "")
    if (!normalizedPath) {
      toast.warning("Document path is required.")
      return
    }
    if (pathIsCollection(normalizedPath)) {
      toast.warning("Document path must have even path segments.")
      return
    }

    setPreviewBusy("delete")
    try {
      // FFP-104: guard the delete with the update time observed when the preview was loaded.
      await firestoreService.deleteDocument(context, normalizedPath, previewSelection?.updateTime)
      toast.success("Document deleted.")
      await runQuery(page)
      await refreshNested(queryPath)
      clearPreviewSelection()
    } catch (error) {
      if (error instanceof FirestoreConflictError) {
        toast.error(
          "The document changed since it was loaded. Refresh the preview and retry the delete.",
        )
        return
      }
      const message = error instanceof Error ? error.message : "Delete failed."
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
  }

  // FFP-002: Bulk delete now uses requestBulkDelete() → confirmBulkDelete() flow with confirmation dialog.
  // handleDeleteSelectedRows kept for backward compatibility but not used in the UI anymore.

  function exportSelectedJSON() {
    if (!queryResponse || querySelectedRows.length === 0) {
      toast.warning("Select rows to export.")
      return
    }

    const collectionPath = normalizePath(queryResponse.path)
    if (!collectionPath || !pathIsCollection(collectionPath)) {
      toast.error("Current query path is not a collection and cannot be exported.")
      return
    }

    try {
      const records = querySelectedRows.map((row) => toTransferRecord(row.doc, collectionPath))
      const jsonPayload = buildCollectionTransferJson(collectionPath, records)
      const fileName = `${sanitizeFileNamePart(collectionPath)}-selected.json`
      triggerTextDownload(
        fileName,
        jsonPayload,
        "application/json;charset=utf-8",
      )
      toast.success(`Exported ${records.length} selected document(s).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed."
      toast.error(message)
    }
  }

  function exportSelectedCSV() {
    if (!queryResponse || querySelectedRows.length === 0) {
      toast.warning("Select rows to export.")
      return
    }

    const collectionPath = normalizePath(queryResponse.path)
    if (!collectionPath || !pathIsCollection(collectionPath)) {
      toast.error("Current query path is not a collection and cannot be exported.")
      return
    }

    try {
      const records = querySelectedRows.map((row) => toTransferRecord(row.doc, collectionPath))
      const csvPayload = serializeTransferRecordsToCsv(records)
      const fileName = `${sanitizeFileNamePart(collectionPath)}-selected.csv`
      triggerTextDownload(
        fileName,
        csvPayload,
        "text/csv;charset=utf-8",
      )
      toast.success(`Exported ${records.length} selected document(s).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed."
      toast.error(message)
    }
  }
  
  // FFP-002: Prepare bulk delete paths from selected rows for confirmation dialog
  function prepareBulkDeletePaths(): string[] {
    const valid = querySelectedRows
      .map((row) => row.normalizedDocumentPath)
      .filter(Boolean)
      .filter((path) => !pathIsCollection(path))

    return [...new Set(valid)] // deduplicate while preserving order
  }

  const BULK_DELETE_LIMIT = 500

  function requestBulkDelete() {
    const paths = prepareBulkDeletePaths()
    if (paths.length === 0) {
      toast.warning("No valid document paths selected for deletion.")
      return
    }
    if (paths.length > BULK_DELETE_LIMIT) {
      toast.error(
        `Bulk delete supports at most ${BULK_DELETE_LIMIT} documents per request. ` +
          `Reduce the selection (${paths.length} selected).`,
      )
      return
    }
    setBulkDeletePaths(paths)
    setBulkDeleteOpen(true)
  }

  /**
   * FFP-106: Deletes the confirmed selection through the atomic backend batch endpoint;
   * either every document is deleted or none are.
   */
  async function confirmBulkDelete() {
    setBulkDeleteOpen(false)
    const paths = bulkDeletePaths
    if (paths.length === 0) return

    try {
      const result = await firestoreService.bulkDeleteDocuments(context, paths)
      if (result.complete) {
        toast.success(`Deleted ${result.deletedCount} selected document(s) atomically.`)
      } else {
        toast.error(
          `Bulk delete failed; no documents were deleted (${result.failedCount} path(s) reported).`,
        )
      }
      await runQuery(page)
      await refreshNested(queryPath)

      if (
        result.complete &&
        previewSelection &&
        paths.includes(normalizePath(previewSelection.documentPath))
      ) {
        clearPreviewSelection()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete selected documents."
      toast.error(message)
    } finally {
      setBulkDeletePaths([])
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleDeleteSelectedRowsFromHeader(_documentPaths?: string[]) {
    requestBulkDelete()
  }

  // FFP-201: block the whole workspace for a detached tab until it is reattached; its query
  // form and column prefs stay in local storage in the meantime.
  if (!attached) {
    return (
      <div className="relative flex min-h-0 h-full w-full flex-1 overflow-hidden bg-muted/40">
        <FirestoreReconnectNotice tab={tab} onReattached={() => markTabAttached(tab.id)} />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 h-full w-full flex-1 overflow-hidden bg-muted/40">
      <div className="flex min-h-0 h-full w-full">
        <FirestoreSidebar
          tab={tab}
          leftSidebarExpanded={leftSidebarExpanded}
          setLeftSidebarExpanded={setLeftSidebarExpanded}
          collections={collections}
          collectionsLoading={collectionsLoading}
          activeCollection={activeCollection}
          refreshCollections={refreshCollections}
          runCollectionQuery={runCollectionQuery}
          drawerMode={drawerMode}
          drawerOpen={drawerCollectionsOpen}
          onDrawerOpenChange={setDrawerCollectionsOpen}
          belowCollections={
            <FirestoreSavedQueries
              savedQueries={savedQueries}
              history={queryHistory}
              onRun={(snapshot) => applyQuerySnapshot(snapshot)}
              onSaveCurrent={handleSaveCurrentQuery}
              onDelete={handleDeleteSavedQuery}
              onRename={handleRenameSavedQuery}
              onToggleFavorite={handleToggleSavedQueryFavorite}
              onClearHistory={handleClearHistory}
            />
          }
        />

        <FirestoreNestedTraverse
          nestedLoading={nestedLoading}
          nestedResponse={nestedResponse}
          queryPath={queryPath}
          nestedIdFilter={nestedIdFilter}
          setNestedIdFilter={setNestedIdFilter}
          setQueryPath={setQueryPath}
          runQuery={runQuery}
          refreshNested={refreshNested}
          onOpenDocumentPreview={(documentPath, documentId) =>
            void openPreviewFromNestedDocument(documentPath, documentId)
          }
          hasNextPage={Boolean(nestedQuery.hasNextPage)}
          isFetchingNextPage={nestedQuery.isFetchingNextPage}
          fetchNextPage={() => void nestedQuery.fetchNextPage({ cancelRefetch: false })}
          drawerMode={drawerMode}
          drawerOpen={drawerNestedOpen}
          onDrawerOpenChange={setDrawerNestedOpen}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <WorkspaceControllerDeck
            tab={tab}
            queryPath={queryPath}
            setQueryPath={setQueryPath}
            runQuery={(pageVal) => void runQuery(pageVal ?? 0)}
            isQuerying={queryLoading}
            drawerMode={drawerMode}
            onOpenCollectionsDrawer={() => setDrawerCollectionsOpen(true)}
            onOpenNestedDrawer={() => setDrawerNestedOpen(true)}
            onOpenFiltersDrawer={() => setDrawerFiltersOpen(true)}
            exportCollectionCurrentPage={(format) => void exportCollectionCurrentPage(format)}
            exportCollectionFull={(format) => void exportCollectionFull(format)}
            exportSelectedJSON={exportSelectedJSON}
            exportSelectedCSV={exportSelectedCSV}
            requestCollectionImport={requestCollectionImport}
            setFirestoreImportDialogOpen={setFirestoreImportDialogOpen}
            openCreateFromHeader={openCreateFromHeader}
            transferControlsDisabled={transferControlsDisabled}
            crudBusy={crudBusy}
            previewBusy={previewBusy}
            transferBusy={transferBusy}
            selectedRowCount={querySelectedRows.length}
            onRequestDeleteSelected={handleDeleteSelectedRowsFromHeader}
            filterPanelOpen={drawerMode ? drawerFiltersOpen : rightSidebarExpanded}
            setFilterPanelOpen={drawerMode ? setDrawerFiltersOpen : setRightSidebarExpanded}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          // totalRows={queryResponse?.resultCount || 0}
          // filteredRows={filteredRowsCount} // You can compute filteredRows based on searchQuery later
          />

          <div className="relative flex min-h-0 h-full min-w-0 flex-1 overflow-hidden">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col">
                  <FirestoreQueryResults
                    queryLoading={queryLoading}
                    queryError={queryError}
                    queryResponse={queryResponse}
                    selectedPreviewPath={previewOpen ? previewSelection?.documentPath ?? "" : ""}
                    onRequestPreviewFromRow={openPreviewFromRow}
                    onSelectionChange={setQuerySelectedRows}
                    page={page}
                    onRunPrevPage={() => void runQuery(Math.max(0, page - 1))}
                    onRunNextPage={() => void runQuery(page + 1)}
                    queryStats={queryStats}
                    quickSearchText={searchQuery}
                    onFilterMatchCountChange={noopFilterMatchCountChange}
                    indexUrl={queryIndexUrl}
                    tabId={tab.id}
                  />

                  <input
                    ref={collectionImportJsonInputRef}
                    type="file"
                    className="hidden"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      if (!file) {
                        return
                      }
                      void handleCollectionImportFile(file, "json")
                      resetFileInput(collectionImportJsonInputRef)
                    }}
                  />
                  <input
                    ref={collectionImportCsvInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      if (!file) {
                        return
                      }
                      void handleCollectionImportFile(file, "csv")
                      resetFileInput(collectionImportCsvInputRef)
                    }}
                  />
                  <input
                    ref={documentImportJsonInputRef}
                    type="file"
                    className="hidden"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      if (!file) {
                        return
                      }
                      void handleDocumentImportFile(file, "json")
                      resetFileInput(documentImportJsonInputRef)
                    }}
                  />
                  <input
                    ref={documentImportCsvInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      if (!file) {
                        return
                      }
                      void handleDocumentImportFile(file, "csv")
                      resetFileInput(documentImportCsvInputRef)
                    }}
                  />

                  <FirestoreCreateDrawer
                    open={createDrawerOpen}
                    onOpenChange={setCreateDrawerOpen}
                    collectionPath={createCollectionPath}
                    onCollectionPathChange={setCreateCollectionPath}
                    documentId={createDocumentId}
                    onDocumentIdChange={setCreateDocumentId}
                    payload={createPayload}
                    onPayloadChange={setCreatePayload}
                    isSubmitting={crudBusy === "create"}
                    onGenerateDocumentId={handleGenerateCreateDocumentId}
                    onSubmit={() => void handleCreateDocument()}
                    onDiscardDraft={handleDiscardCreateDraft}
                  />

                  <FirestoreDocumentPreviewPanel
                    open={previewOpen}
                    onOpenChange={updatePreviewOpen}
                    documentId={previewSelection?.documentId ?? "(no-id)"}
                    documentPath={previewSelection?.documentPath ?? ""}
                    draft={previewDraft}
                    onDraftChange={setPreviewDraft}
                    activeTab={previewActiveTab}
                    onActiveTabChange={setPreviewActiveTab}
                    busyAction={previewBusy}
                    editorTheme={resolvedTheme}
                    validation={previewValidation}
                    onValidationChange={setPreviewValidation}
                    onUpdate={(formattedDraft) => void handlePreviewUpdate(formattedDraft)}
                    onDelete={() => void handlePreviewDelete()}
                    onRefresh={() => void handlePreviewRefresh()}
                    onExportDocument={(format) => void exportDocument(format)}
                    onImportDocument={(format) => requestDocumentImport(format)}
                    transferBusy={transferBusy}
                    saveMode={previewSaveMode}
                    onSaveModeChange={setPreviewSaveMode}
                    writePreview={previewWriteSummary.preview}
                    writePreviewError={previewWriteSummary.error}
                  />
                </div>
              </div>
            </section>
          </div>
        </main>

        <FirestoreFilterPanel
          rightSidebarExpanded={rightSidebarExpanded}
          onToggle={() => setRightSidebarExpanded((value) => !value)}
          whereRows={whereRows}
          addWhereFilterRow={addWhereFilterRow}
          addWhereOrGroup={addWhereOrGroup}
          removeWhereFilterRow={removeWhereFilterRow}
          setWhereRowValue={setWhereRowValue}
          filterCombinator={filterCombinator}
          setFilterCombinator={setFilterCombinator}
          collectionGroup={collectionGroup}
          setCollectionGroup={setCollectionGroup}
          orderClauses={orderClauses}
          addOrderClause={addOrderClause}
          removeOrderClause={removeOrderClause}
          setOrderClauseValue={setOrderClauseValue}
          limit={limit}
          setLimit={setLimit}
          onRun={() => void runQuery(0)}
          drawerMode={drawerMode}
          drawerOpen={drawerFiltersOpen}
          onDrawerOpenChange={setDrawerFiltersOpen}
        />

        <AlertDialog
          isOpen={previewDiscardOpen}
          onOpenChange={(nextOpen) => {
            setPreviewDiscardOpen(nextOpen)
            if (!nextOpen) {
              setPendingPreviewIntent(null)
            }
          }}
          size="sm"
        >
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved JSON changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved edits in the JSON editor. Discarding will lose those changes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={handlePreviewDiscardCancel}>
                Keep Editing
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onPress={handlePreviewDiscardConfirm}>
                Discard Changes
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialog>

        {/* FFP-104: Stale-write conflict dialog with reload / compare / overwrite choices */}
        <AlertDialog
          isOpen={previewConflict !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPreviewConflict(null)
            }
          }}
        >
            <AlertDialogHeader>
              <AlertDialogTitle>Document changed on the server</AlertDialogTitle>
              <AlertDialogDescription>
                {previewConflict?.message ||
                  "Someone else modified this document after you loaded it. Compare the versions, then reload or intentionally overwrite."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  Latest server version
                  {previewConflict?.latestDocument?.updateTime
                    ? ` (updated ${previewConflict.latestDocument.updateTime})`
                    : ""}
                </p>
                <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs">
                  {previewConflict?.latestDocument
                    ? JSON.stringify(previewConflict.latestDocument.fields, null, 2)
                    : "(document was deleted)"}
                </pre>
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Your draft</p>
                <pre className="max-h-48 overflow-auto rounded-md border bg-muted p-2 text-xs">
                  {previewConflict?.pendingDraft ?? ""}
                </pre>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setPreviewConflict(null)}>
                Keep Editing
              </AlertDialogCancel>
              <AlertDialogAction variant="outline" onPress={() => void handleConflictReload()}>
                Reload Server Version
              </AlertDialogAction>
              <AlertDialogAction
                variant="destructive"
                onPress={() => void handleConflictOverwrite()}
              >
                Overwrite Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialog>

        {/* FFP-002: Bulk delete confirmation dialog */}
        <AlertDialog isOpen={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen} size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive flex items-center gap-2">
                <Trash className="w-5 h-5" />
                Delete {bulkDeletePaths.length} Document(s)?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>This action will permanently delete the following documents from:
                  <br />
                  <span className="font-mono text-xs bg-muted p-1 rounded block mt-1">
                    {tab.projectId}/{tab.databaseId ?? "[default]"}
                  </span>
                </p>
                <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1">
                  {bulkDeletePaths.map((path, index) => (
                    <code key={index} className="text-xs block truncate text-muted-foreground">
                      {path}
                    </code>
                  ))}
                </div>
                <p className="text-destructive/80 font-medium text-sm">
                  ⚠ Subcollections are NOT recursively deleted. Orphaned subcollection data will remain.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setBulkDeleteOpen(false)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onPress={confirmBulkDelete}>
                Delete {bulkDeletePaths.length} Document(s)
              </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialog>

        <FirestoreToFirestoreImportDialog
          context={{ ...tab, activePath: queryPath }}
          open={firestoreImportDialogOpen}
          onOpenChange={setFirestoreImportDialogOpen}
          onImportSuccess={() => void runQuery(page)}
        />

        {/* FFP-301: document/collection comparison */}
        <FirestoreCompareDialog
          context={context}
          open={compareOpen}
          onOpenChange={setCompareOpen}
          initialLeftPath={normalizePath(queryPath)}
        />

        {/* FFP-302: schema profiler + local validation rules */}
        <FirestoreProfilerDialog
          context={context}
          open={profilerOpen}
          onOpenChange={setProfilerOpen}
          initialPath={normalizePath(activeCollection) || normalizePath(queryPath)}
        />

        {/* FFP-303: previewable bulk edit of selected documents */}
        <FirestoreBulkEditDialog
          context={context}
          open={bulkEditOpen}
          onOpenChange={setBulkEditOpen}
          paths={querySelectedRows
            .map((row) => row.normalizedDocumentPath)
            .filter((path) => path && !pathIsCollection(path))}
          onExecuted={() => {
            void runQuery(page)
            setBulkEditOpen(false)
          }}
        />

        {/* FFP-304: streaming backup and restore */}
        <FirestoreBackupDialog
          context={context}
          open={backupOpen}
          onOpenChange={setBackupOpen}
          initialPath={normalizePath(activeCollection) || normalizePath(queryPath)}
        />

        {/* FFP-306: real-time watch mode */}
        <FirestoreWatchDialog
          context={context}
          open={watchOpen}
          onOpenChange={setWatchOpen}
          initialPath={normalizePath(queryPath)}
        />
      </div>
    </div>
  )
}
