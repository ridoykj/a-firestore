import { useMemo, useState } from "react"
import {
  AlertCircle,
  ChevronLeft,
  Database,
  FilePlus2,
  FolderTree,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  Table2,
} from "lucide-react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
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
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shadcn/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shadcn/components/ui/field"
import { Input } from "@/shadcn/components/ui/input"
import { Spinner } from "@/shadcn/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import { cn } from "@/shadcn/lib/utils"
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
  type StatusMessage,
  type WhereRow,
} from "@/dto/firestore/FirestoreSchema"
import {
  extractApiMessage,
  getPayloadOnly,
  normalizePath,
  parseJsonPayload,
  pathIsCollection,
} from "@/view/pages/firestore/lib/firestore-utils"
import { firestoreService } from "@/services/api/firestore-service"
import { FirestoreCrudPanel } from "@/view/pages/firestore/components/FirestoreCrudPanel"
import {
  FirestoreDocumentPreviewPanel,
  type PreviewBusy,
  type PreviewTab,
} from "@/view/pages/firestore/components/FirestoreDocumentPreviewPanel"
import { FirestoreFilterPanel } from "@/view/pages/firestore/components/FirestoreFilterPanel"
import { FirestoreQueryResults } from "@/view/pages/firestore/components/FirestoreQueryResults"

type CrudAction = Exclude<CrudBusy, null>
type PreviewDocumentSelection = {
  documentPath: string
  documentId: string
  payload: Record<string, unknown>
}

type PendingPreviewIntent =
  | { intent: "close" }
  | { intent: "switch"; nextSelection: PreviewDocumentSelection }

const PREVIEW_THEME_STORAGE_KEY = "firestore-preview-editor-theme"

const EMPTY_PREVIEW_VALIDATION: PreviewValidationSummary = {
  errorCount: 0,
  warningCount: 0,
  firstErrorMessage: "",
}

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

export default function FirestorePage() {
  const queryClient = useQueryClient()

  const [credentialsFile, setCredentialsFile] = useState<File | null>(null)
  const [projects, setProjects] = useState<string[]>([])
  const [selectedProject, setSelectedProject] = useState("")
  const [databases, setDatabases] = useState<string[]>([])
  const [selectedDatabase, setSelectedDatabase] = useState("")
  const [authLoadingProjects, setAuthLoadingProjects] = useState(false)
  const [authLoadingDatabases, setAuthLoadingDatabases] = useState(false)
  const [authInitializing, setAuthInitializing] = useState(false)
  const [authStatus, setAuthStatus] = useState<StatusMessage | null>(null)
  const [authenticated, setAuthenticated] = useState(false)

  const [leftSidebarExpanded, setLeftSidebarExpanded] = useState(true)
  const [rightSidebarExpanded, setRightSidebarExpanded] = useState(true)

  const [activeCollection, setActiveCollection] = useState("")
  const [queryPath, setQueryPath] = useState("")
  const [orderField, setOrderField] = useState("")
  const [orderDirection, setOrderDirection] = useState<OrderDirection>("desc")
  const [limit, setLimit] = useState(50)
  const [page, setPage] = useState(0)
  const [whereRows, setWhereRows] = useState<WhereRow[]>([{ ...DEFAULT_WHERE_ROW }])

  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState("")

  const [nestedResponse, setNestedResponse] = useState<NestedResponse | null>(null)
  const [nestedLoading, setNestedLoading] = useState(false)

  const [createCollectionPath, setCreateCollectionPath] = useState("")
  const [createPayload, setCreatePayload] = useState(EMPTY_JSON_TEMPLATE)
  const [updateDocumentPath, setUpdateDocumentPath] = useState("")
  const [updatePayload, setUpdatePayload] = useState(EMPTY_JSON_TEMPLATE)
  const [replaceDocumentPath, setReplaceDocumentPath] = useState("")
  const [replacePayload, setReplacePayload] = useState(EMPTY_JSON_TEMPLATE)
  const [deletePath, setDeletePath] = useState("")
  const [crudBusy, setCrudBusy] = useState<CrudBusy>(null)
  const [actionStatus, setActionStatus] = useState<StatusMessage | null>(null)
  const [requestedCrudAction, setRequestedCrudAction] = useState<CrudAction | null>(null)
  const [crudModalVersion, setCrudModalVersion] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSelection, setPreviewSelection] = useState<PreviewDocumentSelection | null>(null)
  const [previewActiveTab, setPreviewActiveTab] = useState<PreviewTab>("tree")
  const [previewDraft, setPreviewDraft] = useState(EMPTY_JSON_TEMPLATE)
  const [previewSavedDraft, setPreviewSavedDraft] = useState(EMPTY_JSON_TEMPLATE)
  const [previewStatus, setPreviewStatus] = useState<StatusMessage | null>(null)
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

  const collectionsQuery = useQuery({
    queryKey: ["firestore", "collections", authenticated],
    queryFn: firestoreService.getCollections,
    enabled: authenticated,
  })

  const collections = collectionsQuery.data ?? []
  const collectionsLoading = collectionsQuery.isFetching

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
      setNestedResponse({ ...EMPTY_NESTED_RESPONSE })
      return
    }

    setNestedLoading(true)
    try {
      const response = await queryClient.fetchQuery({
        queryKey: ["firestore", "nested", normalized],
        queryFn: () => firestoreService.getNested(normalized),
      })
      setNestedResponse(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load nested traversal."
      setNestedResponse({
        currentPath: normalized,
        parentPath: "",
        nodeType: "empty",
        documentNodes: [],
        childCollectionNodes: [],
        nestedHint: "",
        nestedError: message,
      })
    } finally {
      setNestedLoading(false)
    }
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
        queryKey: ["firestore", "query", request],
        queryFn: () => firestoreService.runQuery(request),
      })
      setQueryResponse(response)
      setPage(response.pageIndex)
      setQueryPath(`/${response.path}`)
      const root = response.path.split("/")[0]
      setActiveCollection(root)
      await refreshNested(response.path)
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
    if (!normalizedPath) {
      setActionStatus({ tone: "warning", message: "Collection path is required." })
      return
    }
    if (!pathIsCollection(normalizedPath)) {
      setActionStatus({ tone: "warning", message: "Collection path must have odd path segments." })
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(createPayload)
    } catch (error) {
      setActionStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Invalid create payload.",
      })
      return
    }

    setCrudBusy("create")
    try {
      await firestoreService.createDocument(normalizedPath, payload)
      setActionStatus({ tone: "success", message: "Document created successfully." })
      toast.success("Document created.")
      setCreateCollectionPath("")
      setCreatePayload(EMPTY_JSON_TEMPLATE)
      await refreshCollections()
      await runQuery(0, normalizedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed."
      setActionStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setCrudBusy(null)
    }
  }

  async function handleUpdateDocument() {
    const normalizedPath = normalizePath(updateDocumentPath)
    if (!normalizedPath) {
      setActionStatus({ tone: "warning", message: "Document path is required." })
      return
    }
    if (pathIsCollection(normalizedPath)) {
      setActionStatus({ tone: "warning", message: "Document path must have even path segments." })
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(updatePayload)
    } catch (error) {
      setActionStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Invalid update payload.",
      })
      return
    }

    setCrudBusy("update")
    try {
      await firestoreService.updateDocument(normalizedPath, payload)
      setActionStatus({ tone: "success", message: "Document updated successfully (merge)." })
      toast.success("Document updated.")
      setUpdateDocumentPath("")
      setUpdatePayload(EMPTY_JSON_TEMPLATE)
      await runQuery(page)
      await refreshNested(queryPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed."
      setActionStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setCrudBusy(null)
    }
  }

  async function handleReplaceDocument(pathOverride?: string, payloadOverride?: string) {
    const normalizedPath = normalizePath(pathOverride ?? replaceDocumentPath)
    if (!normalizedPath) {
      setActionStatus({ tone: "warning", message: "Document path is required." })
      return
    }
    if (pathIsCollection(normalizedPath)) {
      setActionStatus({ tone: "warning", message: "Document path must have even path segments." })
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(payloadOverride ?? replacePayload)
    } catch (error) {
      setActionStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Invalid replace payload.",
      })
      return
    }

    setCrudBusy("replace")
    try {
      await firestoreService.replaceDocument(normalizedPath, payload)
      setActionStatus({ tone: "success", message: "Document replaced successfully." })
      toast.success("Document replaced.")
      setReplaceDocumentPath("")
      setReplacePayload(EMPTY_JSON_TEMPLATE)
      await runQuery(page)
      await refreshNested(queryPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Replace failed."
      setActionStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setCrudBusy(null)
    }
  }

  async function handleDeleteDocument(pathOverride?: string) {
    const normalizedPath = normalizePath(pathOverride ?? deletePath)
    if (!normalizedPath) {
      setActionStatus({ tone: "warning", message: "Document path is required." })
      return
    }
    if (pathIsCollection(normalizedPath)) {
      setActionStatus({ tone: "warning", message: "Document path must have even path segments." })
      return
    }

    setCrudBusy("delete")
    try {
      await firestoreService.deleteDocument(normalizedPath)
      setActionStatus({ tone: "success", message: "Document deleted successfully." })
      toast.success("Document deleted.")
      setDeletePath("")
      await runQuery(page)
      await refreshNested(queryPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed."
      setActionStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setCrudBusy(null)
    }
  }

  async function handleLoadProjects() {
    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }

    setAuthLoadingProjects(true)
    setProjects([])
    setDatabases([])
    setSelectedProject("")
    setSelectedDatabase("")

    try {
      const response = await queryClient.fetchQuery({
        queryKey: ["firestore", "projects", credentialsFile.name, credentialsFile.lastModified],
        queryFn: () => firestoreService.loadProjects(credentialsFile),
      })

      if (!Array.isArray(response)) {
        throw new Error(extractApiMessage(response))
      }

      const loadedProjects = response.filter((value): value is string => typeof value === "string")
      setProjects(loadedProjects)

      const initialProject = loadedProjects[0] ?? ""
      setSelectedProject(initialProject)
      if (initialProject) {
        setAuthStatus({
          tone: "success",
          message: `Loaded ${loadedProjects.length} project ID(s).`,
        })
      } else {
        setAuthStatus({
          tone: "warning",
          message: "No accessible project IDs found with the uploaded credentials.",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load project IDs."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setAuthLoadingProjects(false)
    }
  }

  async function handleLoadDatabases() {
    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }
    if (!selectedProject) {
      setAuthStatus({ tone: "warning", message: "Select a project ID first." })
      return
    }

    setAuthLoadingDatabases(true)

    try {
      const response = await queryClient.fetchQuery({
        queryKey: [
          "firestore",
          "databases",
          selectedProject,
          credentialsFile.name,
          credentialsFile.lastModified,
        ],
        queryFn: () => firestoreService.loadDatabases(selectedProject, credentialsFile),
      })

      if (!Array.isArray(response)) {
        throw new Error(extractApiMessage(response))
      }

      const loadedDatabases = response.filter((value): value is string => typeof value === "string")
      setDatabases(loadedDatabases)
      setSelectedDatabase("")
      setAuthStatus({
        tone: "success",
        message:
          loadedDatabases.length > 0
            ? `Loaded ${loadedDatabases.length} database ID(s).`
            : "No explicit database IDs found. '(default)' will be used.",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load databases."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setAuthLoadingDatabases(false)
    }
  }

  async function handleAuthenticate() {
    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }
    if (!selectedProject) {
      setAuthStatus({ tone: "warning", message: "Select a project ID first." })
      return
    }

    setAuthInitializing(true)
    try {
      await firestoreService.initFirestore(selectedProject, credentialsFile, selectedDatabase)
      setAuthenticated(true)
      setAuthStatus({ tone: "success", message: "Firestore initialized successfully." })
      toast.success("Authentication successful.")
      await refreshCollections()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize Firestore."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setAuthInitializing(false)
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

  function openCrudAction(action: CrudAction) {
    setRequestedCrudAction(action)
    setCrudModalVersion((value) => value + 1)
  }

  function openCreateFromHeader() {
    const normalizedQueryPath = normalizePath(queryPath)
    const normalizedCollection = normalizePath(activeCollection)
    const nextCollectionPath = pathIsCollection(normalizedQueryPath)
      ? normalizedQueryPath
      : pathIsCollection(normalizedCollection)
        ? normalizedCollection
        : ""

    if (nextCollectionPath) {
      setCreateCollectionPath(nextCollectionPath)
    }
    setCreatePayload(EMPTY_JSON_TEMPLATE)
    setActionStatus(null)
    openCrudAction("create")
  }

  function openUpdateFromRow(documentPath: string, payload: string) {
    setUpdateDocumentPath(documentPath)
    setUpdatePayload(payload)
    setActionStatus(null)
    openCrudAction("update")
  }

  function openReplaceFromRow(documentPath: string, payload: string) {
    setReplaceDocumentPath(documentPath)
    setReplacePayload(payload)
    setActionStatus(null)
    openCrudAction("replace")
  }

  function openDeleteFromRow(documentPath: string) {
    setDeletePath(documentPath)
    setActionStatus(null)
    openCrudAction("delete")
  }

  function applyPreviewSelection(selection: PreviewDocumentSelection) {
    const nextDraft = JSON.stringify(selection.payload, null, 2)
    setPreviewSelection(selection)
    setPreviewDraft(nextDraft)
    setPreviewSavedDraft(nextDraft)
    setPreviewActiveTab("tree")
    setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
    setPreviewStatus(null)
    setPreviewOpen(true)
  }

  function clearPreviewSelection() {
    setPreviewOpen(false)
    setPreviewSelection(null)
    setPreviewDraft(EMPTY_JSON_TEMPLATE)
    setPreviewSavedDraft(EMPTY_JSON_TEMPLATE)
    setPreviewActiveTab("tree")
    setPreviewValidation(EMPTY_PREVIEW_VALIDATION)
    setPreviewStatus(null)
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
      setPreviewStatus({ tone: "warning", message: "Document path is required." })
      return
    }
    if (pathIsCollection(normalizedPath)) {
      setPreviewStatus({ tone: "warning", message: "Document path must have even path segments." })
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = parseJsonPayload(draftOverride ?? previewDraft)
    } catch (error) {
      setPreviewStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Invalid JSON payload.",
      })
      return
    }

    setPreviewBusy("update")
    try {
      await firestoreService.updateDocument(normalizedPath, payload)
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
          setPreviewStatus({ tone: "success", message: "Document updated successfully (merge)." })
        } else {
          setPreviewStatus({
            tone: "warning",
            message: "Document updated, but it is outside the current query results.",
          })
        }
      } else {
        setPreviewStatus({
          tone: "warning",
          message: "Document updated, but refreshed query results are unavailable.",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed."
      setPreviewStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
  }

  async function handlePreviewDelete() {
    const normalizedPath = normalizePath(previewSelection?.documentPath ?? "")
    if (!normalizedPath) {
      setPreviewStatus({ tone: "warning", message: "Document path is required." })
      return
    }
    if (pathIsCollection(normalizedPath)) {
      setPreviewStatus({ tone: "warning", message: "Document path must have even path segments." })
      return
    }

    setPreviewBusy("delete")
    try {
      await firestoreService.deleteDocument(normalizedPath)
      toast.success("Document deleted.")
      await runQuery(page)
      await refreshNested(queryPath)
      clearPreviewSelection()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed."
      setPreviewStatus({ tone: "error", message })
      toast.error(message)
    } finally {
      setPreviewBusy(null)
    }
  }

  const rowActionsDisabled = crudBusy !== null || previewBusy !== null

  return (
    <div className="relative h-screen w-full overflow-hidden bg-muted/40">
      {!authenticated ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-primary" />
                Firestore Authentication
              </CardTitle>
              <CardDescription>
                Upload credentials, load project IDs, optionally choose a database, then initialize the manager.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!credentialsFile && authStatus?.tone === "warning"}>
                  <FieldLabel htmlFor="credentials-file">Credential File</FieldLabel>
                  <Input
                    id="credentials-file"
                    type="file"
                    accept=".json,application/json"
                    aria-invalid={!credentialsFile && authStatus?.tone === "warning"}
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null
                      setCredentialsFile(nextFile)
                      setProjects([])
                      setDatabases([])
                      setSelectedProject("")
                      setSelectedDatabase("")
                      setAuthStatus(null)
                    }}
                  />
                  <FieldDescription>Upload a service-account JSON credential file.</FieldDescription>
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleLoadProjects()}
                    disabled={!credentialsFile || authLoadingProjects}
                  >
                    {authLoadingProjects ? <Spinner data-icon="inline-start" /> : null}
                    {authLoadingProjects ? "Loading..." : "Load Project IDs"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleLoadDatabases()}
                    disabled={!credentialsFile || !selectedProject || authLoadingDatabases}
                  >
                    {authLoadingDatabases ? <Spinner data-icon="inline-start" /> : null}
                    {authLoadingDatabases ? "Loading..." : "Load Databases"}
                  </Button>
                </div>

                <Field data-invalid={!selectedProject && authStatus?.tone === "warning"}>
                  <FieldLabel htmlFor="project-id">Project ID</FieldLabel>
                  <Select
                    value={selectedProject || undefined}
                    onValueChange={(value) => {
                      setSelectedProject(value)
                      setDatabases([])
                      setSelectedDatabase("")
                    }}
                  >
                    <SelectTrigger id="project-id" className="h-9 w-full text-sm" aria-invalid={!selectedProject && authStatus?.tone === "warning"}>
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project} value={project}>
                          {project}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="database-id">Database ID</FieldLabel>
                  <Select
                    value={selectedDatabase || "__default__"}
                    onValueChange={(value) => setSelectedDatabase(value === "__default__" ? "" : value)}
                  >
                    <SelectTrigger id="database-id" className="h-9 w-full text-sm">
                      <SelectValue placeholder="(default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">(default)</SelectItem>
                      {databases.map((database) => (
                        <SelectItem key={database} value={database}>
                          {database}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Leave as default unless your project uses a named database.</FieldDescription>
                </Field>

                <Button
                  type="button"
                  onClick={() => void handleAuthenticate()}
                  disabled={!credentialsFile || !selectedProject || authInitializing}
                >
                  {authInitializing ? <Spinner data-icon="inline-start" /> : null}
                  {authInitializing ? "Authenticating..." : "Authenticate and Open Manager"}
                </Button>

                {authStatus ? (
                  <Alert variant={authStatus.tone === "error" ? "destructive" : "default"}>
                    <AlertTitle>{authStatus.tone === "success" ? "Ready" : "Status"}</AlertTitle>
                    <AlertDescription>{authStatus.message}</AlertDescription>
                  </Alert>
                ) : null}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className={cn("flex h-full w-full", !authenticated && "blur-[2px]")}>
        <aside
          className={cn(
            "border-r border-border bg-card/95 text-foreground transition-all",
            leftSidebarExpanded ? "w-64" : "w-16",
          )}
        >
          <div className="flex h-12 items-center justify-between border-b border-border px-3">
            {leftSidebarExpanded ? (
              <div className="flex items-center gap-2">
                <Database className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Firebase Console</span>
              </div>
            ) : (
              <Database className="text-primary" />
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setLeftSidebarExpanded((value) => !value)}
            >
              {leftSidebarExpanded ? <PanelLeftClose data-icon="inline-start" /> : <PanelLeftOpen data-icon="inline-start" />}
            </Button>
          </div>

          <div className="h-[calc(100%-3rem)] overflow-y-auto px-2 py-3">
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
                    <EmptyDescription>Initialize Firestore and run a query to load collections.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center justify-between border-b bg-card px-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderTree data-icon="inline-start" className="text-primary" />
              Data Browser
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void runQuery(page)}>
                <RefreshCw data-icon="inline-start" />
                Refresh
              </Button>
              <Button type="button" size="sm" onClick={() => void runQuery(0)}>
                <Play data-icon="inline-start" />
                Run Query
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-72 border-r bg-card">
              <div className="flex h-10 items-center border-b px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nested Traverse
              </div>
              <div className="h-[calc(100%-2.5rem)] overflow-auto p-3">
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

                    {nestedResponse?.nodeType === "collection"
                      ? nestedResponse.documentNodes.map((node) => (
                          <Button
                            key={node.path}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-xs"
                            onClick={() => void refreshNested(node.path)}
                          >
                            <div className="grid">
                              <span className="font-medium">{node.id}</span>
                            </div>
                          </Button>
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
                            <div className="grid">
                              <span className="font-medium">{node.id}</span>
                              <span className="text-muted-foreground">{node.path}</span>
                            </div>
                          </Button>
                        ))
                      : null}

                    {nestedResponse?.nestedHint ? (
                      <p className="text-xs text-muted-foreground">{nestedResponse.nestedHint}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              <div className="border-b bg-card px-4 py-3">
                <div className="grid gap-3">
                  <Field orientation="horizontal" className="flex flex-wrap items-center gap-2">
                    <FieldLabel htmlFor="query-path" className="text-xs uppercase tracking-wide text-muted-foreground">
                      Path
                    </FieldLabel>
                    <Input
                      id="query-path"
                      value={queryPath}
                      onChange={(event) => setQueryPath(event.target.value)}
                      placeholder="/users"
                      className="max-w-xl font-mono text-xs"
                    />
                    <Button type="button" size="sm" onClick={() => void runQuery(0)}>
                      <Play data-icon="inline-start" />
                      Run
                    </Button>
                  </Field>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-md border bg-background p-1">
                      <Button type="button" size="xs" variant="secondary">
                        <Table2 data-icon="inline-start" />
                        Table
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openCreateFromHeader}
                        disabled={crudBusy !== null || previewBusy !== null}
                      >
                        <FilePlus2 data-icon="inline-start" />
                        Create
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRightSidebarExpanded((value) => !value)}
                      >
                        {rightSidebarExpanded ? (
                          <PanelRightClose data-icon="inline-start" />
                        ) : (
                          <PanelRightOpen data-icon="inline-start" />
                        )}
                        Filters
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <FirestoreQueryResults
                    queryLoading={queryLoading}
                    queryError={queryError}
                    queryResponse={queryResponse}
                    selectedPreviewPath={previewOpen ? previewSelection?.documentPath ?? "" : ""}
                    crudActionsDisabled={rowActionsDisabled}
                    onRequestPreviewFromRow={openPreviewFromRow}
                    onRequestUpdateFromRow={openUpdateFromRow}
                    onRequestReplaceFromRow={openReplaceFromRow}
                    onRequestDeleteFromRow={openDeleteFromRow}
                    page={page}
                    onRunPrevPage={() => void runQuery(Math.max(0, page - 1))}
                    onRunNextPage={() => void runQuery(page + 1)}
                    queryStats={queryStats}
                  />

                  <FirestoreCrudPanel
                    key={`crud-modal-${crudModalVersion}`}
                    createCollectionPath={createCollectionPath}
                    setCreateCollectionPath={setCreateCollectionPath}
                    createPayload={createPayload}
                    setCreatePayload={setCreatePayload}
                    updateDocumentPath={updateDocumentPath}
                    setUpdateDocumentPath={setUpdateDocumentPath}
                    updatePayload={updatePayload}
                    setUpdatePayload={setUpdatePayload}
                    replaceDocumentPath={replaceDocumentPath}
                    setReplaceDocumentPath={setReplaceDocumentPath}
                    replacePayload={replacePayload}
                    setReplacePayload={setReplacePayload}
                    deletePath={deletePath}
                    setDeletePath={setDeletePath}
                    crudBusy={crudBusy}
                    actionStatus={actionStatus}
                    requestedAction={requestedCrudAction}
                    onRequestedActionHandled={() => setRequestedCrudAction(null)}
                    onCreate={() => void handleCreateDocument()}
                    onUpdate={() => void handleUpdateDocument()}
                    onReplace={() => void handleReplaceDocument()}
                    onDelete={() => void handleDeleteDocument()}
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
                    status={previewStatus}
                    busyAction={previewBusy}
                    editorTheme={previewEditorTheme}
                    onEditorThemeChange={handlePreviewEditorThemeChange}
                    validation={previewValidation}
                    onValidationChange={setPreviewValidation}
                    onUpdate={(formattedDraft) => void handlePreviewUpdate(formattedDraft)}
                    onDelete={() => void handlePreviewDelete()}
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
      </div>
    </div>
  )
}
