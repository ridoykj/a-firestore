import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  DEFAULT_WHERE_ROW,
  EMPTY_JSON_TEMPLATE,
  EMPTY_NESTED_RESPONSE,
  type CrudBusy,
  type FirestoreDocument,
  type FirestoreQueryRequest,
  type NestedResponse,
  type OrderDirection,
  type PreviewCloseIntent,
  type PreviewEditorTheme,
  type PreviewValidationSummary,
  type QueryResponse,
  type TransferFormat,
  type WhereRow,
} from "@/dto/firestore/FirestoreSchema"
import { firestoreService } from "@/services/api/firestore-service"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shadcn/components/ui/alert-dialog"
import { useMediaQuery } from "@/shadcn/hooks/use-media-query"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"
import type { ProjectTab } from "@/store/gcp-store"
import { FirestoreCreateDrawer } from "@/view/pages/firestore/components/FirestoreCreateDrawer"
import { FirestoreDocumentPreviewPanel, type PreviewBusy, type PreviewTab } from "@/view/pages/firestore/components/FirestoreDocumentPreviewPanel"
import { FirestoreFilterPanel } from "@/view/pages/firestore/components/FirestoreFilterPanel"
import { WorkspaceControllerDeck } from "@/view/pages/firestore/components/WorkspaceControllerDeck"
import { FirestoreNestedTraverse } from "@/view/pages/firestore/components/FirestoreNestedTraverse"
import { FirestoreQueryResults } from "@/view/pages/firestore/components/FirestoreQueryResults"
import { FirestoreSidebar } from "@/view/pages/firestore/components/FirestoreSidebar"
import { FirestoreToFirestoreImportDialog } from "@/view/pages/firestore/components/FirestoreToFirestoreImportDialog"
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
} from "@/view/pages/firestore/lib/firestore-transfer-utils"
import {
  documentIdIsValid,
  generateFirestoreDocumentId,
  getPayloadOnly,
  normalizePath,
  parseJsonPayload,
  pathIsCollection,
} from "@/view/pages/firestore/lib/firestore-utils"

type PreviewDocumentSelection = {
  documentPath: string
  documentId: string
  payload: Record<string, unknown>
}

type PendingPreviewIntent =
  | { intent: "close" }
  | { intent: "switch"; nextSelection: PreviewDocumentSelection }

type FirestorePageProps = {
  tab: ProjectTab
}

const PREVIEW_THEME_STORAGE_KEY = "firestore-preview-editor-theme"

const EMPTY_PREVIEW_VALIDATION: PreviewValidationSummary = {
  errorCount: 0,
  warningCount: 0,
  firstErrorMessage: "",
}
const NESTED_PAGE_SIZE = 25

function loadInitialPreviewTheme(): PreviewEditorTheme {
  if (typeof window === "undefined") {
    return "dark"
  }

  const storedTheme = window.localStorage.getItem(PREVIEW_THEME_STORAGE_KEY)
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme
  }
  return "dark"
}

export default function FirestorePage({ tab }: FirestorePageProps) {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const isNarrowDesktop = useMediaQuery("(max-width: 1280px)")
  const drawerMode = isMobile || isNarrowDesktop
  const context = useMemo(
    () => ({
      projectId: tab.projectId,
      databaseId: tab.databaseId,
    }),
    [tab.projectId, tab.databaseId],
  )

  const [leftSidebarExpanded, setLeftSidebarExpanded] = useState(true)
  const [rightSidebarExpanded, setRightSidebarExpanded] = useState(true)
  const [drawerCollectionsOpen, setDrawerCollectionsOpen] = useState(false)
  const [drawerNestedOpen, setDrawerNestedOpen] = useState(false)
  const [drawerFiltersOpen, setDrawerFiltersOpen] = useState(false)

  const [activeCollection, setActiveCollection] = useState("")
  const [queryPath, setQueryPath] = useState("")
  const [nestedIdFilter, setNestedIdFilter] = useState("")
  const [orderField, setOrderField] = useState("")
  const [orderDirection, setOrderDirection] = useState<OrderDirection>("desc")
  const [limit, setLimit] = useState(50)
  const [page, setPage] = useState(0)
  const [whereRows, setWhereRows] = useState<WhereRow[]>([{ ...DEFAULT_WHERE_ROW }])
  const [searchQuery, setSearchQuery] = useState('')

  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState("")

  const [createCollectionPath, setCreateCollectionPath] = useState("")
  const [createDocumentId, setCreateDocumentId] = useState("")
  const [createPayload, setCreatePayload] = useState(EMPTY_JSON_TEMPLATE)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [firestoreImportDialogOpen, setFirestoreImportDialogOpen] = useState(false)

  const [crudBusy, setCrudBusy] = useState<CrudBusy>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSelection, setPreviewSelection] = useState<PreviewDocumentSelection | null>(null)
  const [previewActiveTab, setPreviewActiveTab] = useState<PreviewTab>("tree")
  const [previewDraft, setPreviewDraft] = useState(EMPTY_JSON_TEMPLATE)
  const [previewSavedDraft, setPreviewSavedDraft] = useState(EMPTY_JSON_TEMPLATE)
  const [previewBusy, setPreviewBusy] = useState<PreviewBusy>(null)
  const [previewValidation, setPreviewValidation] =
    useState<PreviewValidationSummary>(EMPTY_PREVIEW_VALIDATION)
  const [previewEditorTheme, setPreviewEditorTheme] = useState<PreviewEditorTheme>(
    loadInitialPreviewTheme,
  )
  const [previewDiscardOpen, setPreviewDiscardOpen] = useState(false)
  const [pendingPreviewIntent, setPendingPreviewIntent] = useState<PendingPreviewIntent | null>(
    null,
  )
  const [transferBusy, setTransferBusy] = useState(false)
  const collectionImportJsonInputRef = useRef<HTMLInputElement | null>(null)
  const collectionImportCsvInputRef = useRef<HTMLInputElement | null>(null)
  const documentImportJsonInputRef = useRef<HTMLInputElement | null>(null)
  const documentImportCsvInputRef = useRef<HTMLInputElement | null>(null)

  const collectionsQuery = useQuery({
    queryKey: ["firestore", "collections", tab.id],
    queryFn: () => firestoreService.getCollections(context),
  })

  const collections = collectionsQuery.data ?? []
  const collectionsLoading = collectionsQuery.isFetching
  const nestedPath = useMemo(() => normalizePath(queryPath), [queryPath])
  const normalizedNestedIdFilter = useMemo(() => nestedIdFilter.trim(), [nestedIdFilter])
  const nestedQuery = useInfiniteQuery({
    queryKey: ["firestore", tab.id, "nested", nestedPath, NESTED_PAGE_SIZE, normalizedNestedIdFilter],
    enabled: Boolean(nestedPath),
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
      }
    }

    return null
  }

  const queryStats = useMemo(() => {
    if (!queryResponse) {
      return "0 documents found in 0ms"
    }
    return `${queryResponse.resultCount} documents found in ${queryResponse.elapsedMs}ms`
  }, [queryResponse])

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

  async function runQuery(nextPage: number, pathOverride?: string): Promise<QueryResponse | null> {
    const normalizedPath = normalizePath(pathOverride ?? queryPath)
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

    const request: FirestoreQueryRequest = {
      path: normalizedPath,
      page: Math.max(0, nextPage),
      limit,
      orderDirection,
      orderField,
      filters: whereRows.map((row) => ({
        field: row.field,
        operator: row.operator,
        value: row.value,
        type: row.type,
      })),
    }

    setQueryLoading(true)
    setQueryError("")

    try {
      const response = await queryClient.fetchQuery({
        queryKey: ["firestore", tab.id, "query", request],
        queryFn: () => firestoreService.runQuery(context, request),
      })
      setQueryResponse(response)
      setPage(response.pageIndex)
      setQueryPath(`/${response.path}`)
      const root = response.path.split("/")[0]
      setActiveCollection(root)
      return response
    } catch (error) {
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
    setWhereRows((prev) => [
      ...prev,
      { id: nextId, field: "", operator: "==", value: "", type: "string" },
    ])
  }

  function removeWhereFilterRow(id: number) {
    setWhereRows((prev) => {
      if (prev.length <= 1) {
        return prev.map((row) =>
          row.id === id ? { ...row, field: "", operator: "==", value: "", type: "string" } : row,
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
    setPreviewOpen(true)
  }

  function clearPreviewSelection() {
    setPreviewOpen(false)
    setPreviewSelection(null)
    setPreviewDraft(EMPTY_JSON_TEMPLATE)
    setPreviewSavedDraft(EMPTY_JSON_TEMPLATE)
    setPreviewActiveTab("tree")
    setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
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

    const nextSelection: PreviewDocumentSelection = {
      documentPath: normalizedPath,
      documentId,
      payload,
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
      const previewDocumentId = details.id.trim() || documentId
      const previewPayload =
        details.fields && typeof details.fields === "object" ? details.fields : {}
      openPreviewFromRow(normalizedPath, previewDocumentId, previewPayload)
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

  function handlePreviewEditorThemeChange(nextTheme: PreviewEditorTheme) {
    setPreviewEditorTheme(nextTheme)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREVIEW_THEME_STORAGE_KEY, nextTheme)
    }
  }

  async function handlePreviewUpdate(draftOverride?: string) {
    const normalizedPath = normalizePath(previewSelection?.documentPath ?? "")
    if (!normalizedPath) {
      toast.warning("Document path is required.")
      return
    }
    if (pathIsCollection(normalizedPath)) {
      toast.warning("Document path must have even path segments.")
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(draftOverride ?? previewDraft)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON payload.")
      return
    }

    setPreviewBusy("update")
    try {
      await firestoreService.updateDocument(context, normalizedPath, payload)
      toast.success("Document updated.")
      const persistedDraft = JSON.stringify(payload, null, 2)
      setPreviewDraft(persistedDraft)
      setPreviewSavedDraft(persistedDraft)
      const nextResponse = await runQuery(page)
      await refreshNested(queryPath)

      if (nextResponse) {
        const updatedSelection = getDocumentPreviewSelection(nextResponse, normalizedPath)
        if (updatedSelection) {
          const nextDraft = JSON.stringify(updatedSelection.payload, null, 2)
          setPreviewSelection(updatedSelection)
          setPreviewDraft(nextDraft)
          setPreviewSavedDraft(nextDraft)
          setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
        } else {
          toast.warning("Document updated, but it is outside the current query results.")
        }
      } else {
        toast.warning("Document updated, but refreshed query results are unavailable.")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed."
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
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
      await firestoreService.deleteDocument(context, normalizedPath)
      toast.success("Document deleted.")
      await runQuery(page)
      await refreshNested(queryPath)
      clearPreviewSelection()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed."
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
  }

  return (
    <div className="relative flex min-h-0 h-full w-full flex-1 overflow-hidden bg-muted/40">
      <div className="flex min-h-0 h-full w-full">
        <FirestoreSidebar
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
        />

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <WorkspaceControllerDeck
            tab={tab}
            queryPath={queryPath}
            setQueryPath={setQueryPath}
            runQuery={(pageVal) => void runQuery(pageVal ?? 0)}
            isQuerying={queryLoading}
            exportCollectionCurrentPage={(format) => void exportCollectionCurrentPage(format)}
            exportCollectionFull={(format) => void exportCollectionFull(format)}
            requestCollectionImport={requestCollectionImport}
            setFirestoreImportDialogOpen={setFirestoreImportDialogOpen}
            openCreateFromHeader={openCreateFromHeader}
            transferControlsDisabled={transferControlsDisabled}
            crudBusy={crudBusy}
            previewBusy={previewBusy}
            transferBusy={transferBusy}
            filterPanelOpen={rightSidebarExpanded}
            setFilterPanelOpen={setRightSidebarExpanded}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          // totalRows={queryResponse?.resultCount || 0}
          // filteredRows={filteredRowsCount} // You can compute filteredRows based on searchQuery later
          />

          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
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

            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col">
                  <FirestoreQueryResults
                    queryLoading={queryLoading}
                    queryError={queryError}
                    queryResponse={queryResponse}
                    selectedPreviewPath={previewOpen ? previewSelection?.documentPath ?? "" : ""}
                    onRequestPreviewFromRow={openPreviewFromRow}
                    page={page}
                    onRunPrevPage={() => void runQuery(Math.max(0, page - 1))}
                    onRunNextPage={() => void runQuery(page + 1)}
                    queryStats={queryStats}
                    quickSearchText={searchQuery}
                    onFilterMatchCountChange={() => { }}
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
                    key={previewSelection?.documentPath ?? "preview-empty"}
                    open={previewOpen}
                    onOpenChange={updatePreviewOpen}
                    documentId={previewSelection?.documentId ?? "(no-id)"}
                    documentPath={previewSelection?.documentPath ?? ""}
                    draft={previewDraft}
                    onDraftChange={setPreviewDraft}
                    activeTab={previewActiveTab}
                    onActiveTabChange={setPreviewActiveTab}
                    busyAction={previewBusy}
                    editorTheme={previewEditorTheme}
                    onEditorThemeChange={handlePreviewEditorThemeChange}
                    validation={previewValidation}
                    onValidationChange={setPreviewValidation}
                    onUpdate={(formattedDraft) => void handlePreviewUpdate(formattedDraft)}
                    onDelete={() => void handlePreviewDelete()}
                    onExportDocument={(format) => void exportDocument(format)}
                    onImportDocument={(format) => requestDocumentImport(format)}
                    transferBusy={transferBusy}
                  />
                </div>

                <FirestoreFilterPanel
                  rightSidebarExpanded={rightSidebarExpanded}
                  onToggle={() => setRightSidebarExpanded((value) => !value)}
                  whereRows={whereRows}
                  addWhereFilterRow={addWhereFilterRow}
                  removeWhereFilterRow={removeWhereFilterRow}
                  setWhereRowValue={setWhereRowValue}
                  orderField={orderField}
                  setOrderField={setOrderField}
                  orderDirection={orderDirection}
                  setOrderDirection={setOrderDirection}
                  limit={limit}
                  setLimit={setLimit}
                  onRun={() => void runQuery(0)}
                  drawerMode={drawerMode}
                  drawerOpen={drawerFiltersOpen}
                  onDrawerOpenChange={setDrawerFiltersOpen}
                />
              </div>
            </section>
          </div>
        </main>

        <AlertDialog
          open={previewDiscardOpen}
          onOpenChange={(nextOpen) => {
            setPreviewDiscardOpen(nextOpen)
            if (!nextOpen) {
              setPendingPreviewIntent(null)
            }
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved JSON changes?</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved edits in the JSON editor. Discarding will lose those changes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handlePreviewDiscardCancel}>
                Keep Editing
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handlePreviewDiscardConfirm}>
                Discard Changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FirestoreToFirestoreImportDialog
          context={{ ...tab, activePath: queryPath }}
          open={firestoreImportDialogOpen}
          onOpenChange={setFirestoreImportDialogOpen}
          onImportSuccess={() => void runQuery(page)}
        />
      </div>
    </div>
  )
}
