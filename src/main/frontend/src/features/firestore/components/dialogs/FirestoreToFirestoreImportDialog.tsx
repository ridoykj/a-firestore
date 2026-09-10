import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery
} from "@/features/firestore/api/firestore-query"
import { firestoreService } from "@/features/firestore/api/firestore-service"
import { streamJobEvents } from "@/features/firestore/api/job-client"
import type { NestedNode } from "@/features/firestore/schemas/FirestoreSchema"
import { useGcpStore, type ProjectTab } from "@/features/gcp/store/gcp-store"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/shadcn/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Sheet, SheetContent, SheetHeader } from "@/shadcn/components/ui/sheet"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shadcn/components/ui/table"
import {
  AlertCircle,
  CloudDownload,
  FileUp,
  Search,
  ShieldAlert,
  X,
} from "lucide-react"
import { useMemo, useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import { FirestoreSelectionTree, findNodeByPath, type TreeNode } from "./FirestoreSelectionTree"
import { normalizeDatabaseId } from "@/features/firestore/api/firestore-utils"

interface FirestoreToFirestoreImportDialogProps {
  context: ProjectTab & { activePath: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportSuccess: () => void
}

type Step = "AUTH" | "SELECT" | "SUMMARY" | "CONFLICT" | "EXECUTE"
type ConflictResolution = "MERGE" | "OVERWRITE"

const STEP_SEQUENCE: Step[] = ["AUTH", "SELECT", "SUMMARY", "CONFLICT", "EXECUTE"]

const STEP_LABELS: Record<Step, string> = {
  AUTH: "Source",
  SELECT: "Select",
  SUMMARY: "Summary",
  CONFLICT: "Conflict",
  EXECUTE: "Import",
}

function mapNestedNodesToTree(nodes: NestedNode[] | undefined, type: "collection" | "document"): TreeNode[] {
  if (!nodes || nodes.length === 0) {
    return []
  }

  return nodes.map((node) => ({
    name: node.id,
    path: node.path,
    type,
    isLoaded: false,
    isLoading: false,
  }))
}

export function FirestoreToFirestoreImportDialog({
  context,
  open,
  onOpenChange,
  onImportSuccess,
}: FirestoreToFirestoreImportDialogProps) {
  const { credentialsFile: globalCredentialsFile } = useGcpStore()

  const [step, setStep] = useState<Step>("AUTH")
  const [useCustomCredentials, setUseCustomCredentials] = useState(false)
  const [customCredentialsFile, setCustomCredentialsFile] = useState<File | null>(null)
  const [sourceProjectId, setSourceProjectId] = useState("")
  const [sourceDatabaseId, setSourceDatabaseId] = useState("")
  const [tree, setTree] = useState<TreeNode[]>([])
  const [currentPath, setCurrentPath] = useState<string>("")
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [firebasePathInput, setFirebasePathInput] = useState("")
  const [isPathLoading, setIsPathLoading] = useState(false)
  // Document search within the currently opened collection (document-ID prefix filter).
  const [documentSearch, setDocumentSearch] = useState("")
  const [appliedDocSearch, setAppliedDocSearch] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>("MERGE")
  const [authAttempted, setAuthAttempted] = useState(false)
  const [copiedDocuments, setCopiedDocuments] = useState(0)
  // FFP-305: durable job state (cancel + committed progress + failure report).
  const [failedDocuments, setFailedDocuments] = useState(0)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const activeCredentialsFile = useCustomCredentials ? customCredentialsFile : globalCredentialsFile
  const sourceCredentialsReady = Boolean(activeCredentialsFile)

  const normalizedDatabaseLabel = useMemo(
    () => normalizeDatabaseId(sourceDatabaseId),
    [sourceDatabaseId],
  )

  const projectsQuery = useFirestoreProjectsQuery({
    credentialsFile: activeCredentialsFile,
    enabled: open && sourceCredentialsReady,
  })

  const databasesQuery = useFirestoreDatabasesQuery({
    projectId: sourceProjectId,
    credentialsFile: activeCredentialsFile,
    enabled: open && sourceCredentialsReady && Boolean(sourceProjectId),
  })

  const initFirestoreMutation = useFirestoreInitMutation()

  const projects = projectsQuery.data ?? []
  const databases = databasesQuery.data ?? []

  // Document-ID search only applies to collection paths (odd number of segments).
  const currentPathIsCollection = useMemo(() => {
    const segments = currentPath.split("/").filter(Boolean)
    return segments.length > 0 && segments.length % 2 === 1
  }, [currentPath])

  const stepIndex = Math.max(STEP_SEQUENCE.indexOf(step), 0)
  const sourceProjectMissing = authAttempted && !sourceProjectId.trim()
  const sourceCredentialsMissing = authAttempted && !activeCredentialsFile

  function resetState() {
    setStep("AUTH")
    setUseCustomCredentials(false)
    setCustomCredentialsFile(null)
    setSourceProjectId("")
    setSourceDatabaseId("")
    setTree([])
    setCurrentPath("")
    setSelectedPaths(new Set())
    setFirebasePathInput("")
    setIsPathLoading(false)
    setDocumentSearch("")
    setAppliedDocSearch("")
    setIsSearching(false)
    setConflictResolution("MERGE")
    setAuthAttempted(false)
    setCopiedDocuments(0)
    setFailedDocuments(0)
    setActiveJobId(null)
    setCancelling(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setTimeout(resetState, 200)
    }
    onOpenChange(nextOpen)
  }

  function handleCredentialsMode(nextValue: string) {
    const customMode = nextValue === "custom"
    setUseCustomCredentials(customMode)
    setSourceProjectId("")
    setSourceDatabaseId("")
    setAuthAttempted(false)
  }

  function handleCustomFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setCustomCredentialsFile(file)
    setSourceProjectId("")
    setSourceDatabaseId("")
    setAuthAttempted(false)
  }

  function handleProjectChange(nextProjectId: string) {
    setSourceProjectId(nextProjectId)
    setSourceDatabaseId("")
  }

  function handleDatabaseChange(nextDatabaseId: string) {
    setSourceDatabaseId(nextDatabaseId === "__default__" ? "" : nextDatabaseId)
  }

  async function proceedToSelect() {
    setAuthAttempted(true)

    if (!sourceProjectId.trim()) {
      toast.error("Please select a source project ID.")
      return
    }
    if (!activeCredentialsFile) {
      toast.error("Please provide source credentials.")
      return
    }

    try {
      await initFirestoreMutation.mutateAsync({
        projectId: sourceProjectId,
        databaseId: sourceDatabaseId,
        credentialsFile: activeCredentialsFile,
      })

      const roots = await firestoreService.getCollections({
        projectId: sourceProjectId,
        databaseId: sourceDatabaseId,
      })

      setTree(
        roots.map((collectionId) => ({
          name: collectionId,
          path: collectionId,
          type: "collection",
          isLoaded: false,
          isLoading: false,
        })),
      )
      setCurrentPath("")
      setSelectedPaths(new Set())
      setFirebasePathInput("")
      setDocumentSearch("")
      setAppliedDocSearch("")
      setStep("SELECT")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize source Firestore."
      toast.error(message)
    }
  }

  function normalizeFirebasePath(rawPath: string): string {
    return rawPath
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
  }

  async function loadRootCollections() {
    const roots = await firestoreService.getCollections({
      projectId: sourceProjectId,
      databaseId: sourceDatabaseId,
    })
    setTree(
      roots.map((collectionId) => ({
        name: collectionId,
        path: collectionId,
        type: "collection" as const,
        isLoaded: false,
        isLoading: false,
      })),
    )
    setCurrentPath("")
  }

  async function handleLoadFirebasePath() {
    const normalizedPath = normalizeFirebasePath(firebasePathInput)
    setIsPathLoading(true)
    setDocumentSearch("")
    setAppliedDocSearch("")
    try {
      if (!normalizedPath) {
        await loadRootCollections()
        return
      }

      const response = await firestoreService.getNested(
        { projectId: sourceProjectId, databaseId: sourceDatabaseId },
        normalizedPath,
        100,
      )

      const rootType: TreeNode["type"] = response.nodeType === "document" ? "document" : "collection"
      const childNodes: TreeNode[] = [
        ...mapNestedNodesToTree(response.childCollectionNodes, "collection"),
        ...mapNestedNodesToTree(response.documentNodes, "document"),
      ]
      const rootName = normalizedPath.split("/").pop() || normalizedPath

      setTree([
        {
          name: rootName,
          path: normalizedPath,
          type: rootType,
          isLoaded: true,
          isLoading: false,
          hasMore: response.pageInfo?.hasMore ?? false,
          nextCursor: response.pageInfo?.nextCursor ?? null,
          children: childNodes,
        },
      ])
      setCurrentPath(normalizedPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid Firebase path."
      toast.error(message)
    } finally {
      setIsPathLoading(false)
    }
  }

  async function loadChildren(nodePath: string, idFilter = "") {
    try {
      const response = await firestoreService.getNested(
        { projectId: sourceProjectId, databaseId: sourceDatabaseId },
        nodePath,
        100,
        null,
        idFilter,
      )

      const children: TreeNode[] = [
        ...mapNestedNodesToTree(response.childCollectionNodes, "collection"),
        ...mapNestedNodesToTree(response.documentNodes, "document"),
      ]

      setTree((prev) => {
        const nextTree = structuredClone(prev)
        const updateNode = (nodes: TreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === nodePath) {
              node.children = children
              node.isLoaded = true
              node.isLoading = false
              node.hasMore = response.pageInfo?.hasMore ?? false
              node.nextCursor = response.pageInfo?.nextCursor ?? null
              return true
            }
            if (node.children && updateNode(node.children)) {
              return true
            }
          }
          return false
        }

        updateNode(nextTree)
        return nextTree
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to load path: ${message}`)
      setTree((prev) => {
        const nextTree = structuredClone(prev)
        const updateNode = (nodes: TreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === nodePath) {
              node.isLoading = false
              return true
            }
            if (node.children && updateNode(node.children)) {
              return true
            }
          }
          return false
        }

        updateNode(nextTree)
        return nextTree
      })
    }
  }

  async function loadMoreChildren(nodePath: string) {
    const node = findNodeByPath(tree, nodePath)
    if (!node || !node.hasMore || !node.nextCursor) return

    setTree((prev) => {
      const nextTree = structuredClone(prev)
      const updateNode = (nodes: TreeNode[]): boolean => {
        for (const n of nodes) {
          if (n.path === nodePath) {
            n.isLoadingMore = true
            return true
          }
          if (n.children && updateNode(n.children)) return true
        }
        return false
      }
      updateNode(nextTree)
      return nextTree
    })

    try {
      const response = await firestoreService.getNested(
        { projectId: sourceProjectId, databaseId: sourceDatabaseId },
        nodePath,
        100,
        node.nextCursor,
        appliedDocSearch,
      )

      const moreChildren: TreeNode[] = [
        ...mapNestedNodesToTree(response.childCollectionNodes, "collection"),
        ...mapNestedNodesToTree(response.documentNodes, "document"),
      ]

      setTree((prev) => {
        const nextTree = structuredClone(prev)
        const updateNode = (nodes: TreeNode[]): boolean => {
          for (const n of nodes) {
            if (n.path === nodePath) {
              n.children = [...(n.children || []), ...moreChildren]
              n.hasMore = response.pageInfo?.hasMore ?? false
              n.nextCursor = response.pageInfo?.nextCursor ?? null
              n.isLoadingMore = false
              return true
            }
            if (n.children && updateNode(n.children)) return true
          }
          return false
        }
        updateNode(nextTree)
        return nextTree
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load more")
      setTree((prev) => {
        const nextTree = structuredClone(prev)
        const updateNode = (nodes: TreeNode[]): boolean => {
          for (const n of nodes) {
            if (n.path === nodePath) {
              n.isLoadingMore = false
              return true
            }
            if (n.children && updateNode(n.children)) return true
          }
          return false
        }
        updateNode(nextTree)
        return nextTree
      })
    }
  }

  function markNodeLoading(nodePath: string, isLoading: boolean) {
    setTree((prev) => {
      const nextTree = structuredClone(prev)
      const updateNode = (nodes: TreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.path === nodePath) {
            node.isLoading = isLoading
            return true
          }
          if (node.children && updateNode(node.children)) {
            return true
          }
        }
        return false
      }
      updateNode(nextTree)
      return nextTree
    })
  }

  // Reload the current collection's documents filtered by a document-ID prefix.
  async function runDocumentSearch(filter: string) {
    if (!currentPathIsCollection) {
      return
    }
    setAppliedDocSearch(filter)
    setIsSearching(true)
    markNodeLoading(currentPath, true)
    try {
      await loadChildren(currentPath, filter)
    } finally {
      setIsSearching(false)
    }
  }

  function handleNavigate(nodePath: string, isLoaded: boolean) {
    setCurrentPath(nodePath)
    setFirebasePathInput(nodePath)
    setDocumentSearch("")
    setAppliedDocSearch("")

    if (isLoaded) {
      return
    }

    setTree((prev) => {
      const nextTree = structuredClone(prev)
      const updateNode = (nodes: TreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.path === nodePath) {
            node.isLoading = true
            return true
          }
          if (node.children && updateNode(node.children)) {
            return true
          }
        }
        return false
      }

      updateNode(nextTree)
      return nextTree
    })

    void loadChildren(nodePath)
  }

  function toggleSelect(nodePath: string) {
    const nextSelected = new Set(selectedPaths)

    if (nextSelected.has(nodePath)) {
      nextSelected.delete(nodePath)
      for (const selectedPath of Array.from(nextSelected)) {
        if (selectedPath.startsWith(`${nodePath}/`)) {
          nextSelected.delete(selectedPath)
        }
      }
    } else {
      nextSelected.add(nodePath)
    }

    setSelectedPaths(nextSelected)
  }

  const summaryItems = useMemo(
    () =>
      Array.from(selectedPaths).map((sourcePath) => {
        const parts = sourcePath.split("/")
        const id = parts[parts.length - 1]
        const targetPath = context.activePath ? `${context.activePath}/${id}` : id
        return { source: sourcePath, target: targetPath }
      }),
    [context.activePath, selectedPaths],
  )

  async function cancelCopy() {
    if (!activeJobId) {
      return
    }
    setCancelling(true)
    try {
      await firestoreService.cancelJob(activeJobId)
      toast.message("Cancellation requested; finishing the current checkpoint...")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request cancellation.")
    }
  }

  async function executeCopy() {
    setStep("EXECUTE")
    setCopiedDocuments(0)
    setFailedDocuments(0)
    setCancelling(false)

    try {
      // FFP-305: run as a durable job so it can report committed progress, be cancelled, and
      // produce a failure report. Selected paths are deduplicated here and again on the server.
      const { jobId } = await firestoreService.createDeepCopyJob({
        sourceProjectId,
        sourceDatabaseId,
        sourcePaths: Array.from(selectedPaths),
        targetProjectId: context.projectId,
        targetDatabaseId: context.databaseId,
        targetBasePath: context.activePath,
        conflictResolution,
      })
      setActiveJobId(jobId)

      const finalSnapshot = await streamJobEvents(jobId, {
        context,
        onProgress: (snapshot) => {
          setCopiedDocuments(snapshot.committed)
          setFailedDocuments(snapshot.failed)
        },
      })

      if (finalSnapshot.status === "cancelled") {
        toast.warning(`Copy cancelled after ${finalSnapshot.committed} committed document(s).`)
      } else if (finalSnapshot.failed > 0) {
        toast.warning(`Copied ${finalSnapshot.committed} document(s); ${finalSnapshot.failed} failed.`)
      } else {
        toast.success(`Copied ${finalSnapshot.committed} document(s) successfully!`)
      }

      onImportSuccess()
      handleOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deep copy failed"
      toast.error(message)
      setStep("CONFLICT")
    } finally {
      setActiveJobId(null)
      setCancelling(false)
    }
  }

  function handleBack() {
    if (step === "SELECT") {
      setStep("AUTH")
      return
    }
    if (step === "SUMMARY") {
      setStep("SELECT")
      return
    }
    if (step === "CONFLICT") {
      setStep("SUMMARY")
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[90%]! sm:w-[85%]! sm:max-w-[85%]! p-0 gap-0 flex flex-col overflow-hidden shadow-2xl"
      >
        <SheetHeader className="p-3 border-b border-border">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
            <div className="flex items-start justify-between w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <CloudDownload className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Import from Firestore
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => handleOpenChange(false)}
                className="sm:hidden -mr-1.5 rounded-full text-muted-foreground shrink-0"
                disabled={step === "EXECUTE"}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Badge variant="outline">Step {stepIndex + 1} of {STEP_SEQUENCE.length}</Badge>
              <Button
                variant="outline"
                size="icon-lg"
                onClick={() => handleOpenChange(false)}
                className="rounded-full hover:bg-muted text-muted-foreground transition-colors ml-2 hidden sm:inline-flex"
                disabled={step === "EXECUTE"}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 px-1 pb-1 text-left">
            <p className="text-sm text-muted-foreground">
              Deep copy nested collections/documents into <strong>{context.projectId}</strong>
              {" / "}
              <strong>{normalizeDatabaseId(context.databaseId)}</strong>.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STEP_SEQUENCE.map((value, index) => {
                const reached = index <= stepIndex
                const active = value === step
                return (
                  <Badge key={value} variant={active ? "secondary" : reached ? "outline" : "ghost"}>
                    {STEP_LABELS[value]}
                  </Badge>
                )
              })}
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col px-2 sm:px-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-3">
            {step === "AUTH" ? (
              <div className="h-full space-y-4 overflow-y-auto pr-2">
                <div className="rounded-lg border bg-card p-4">
                  <Label className="text-sm font-medium">Source Credentials</Label>
                  <div className="mt-2 grid gap-3">
                    <Select value={useCustomCredentials ? "custom" : "global"} onValueChange={handleCredentialsMode}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Use global credentials</SelectItem>
                        <SelectItem value="custom">Upload source credentials</SelectItem>
                      </SelectContent>
                    </Select>

                    {useCustomCredentials ? (
                      <div className="rounded-md border border-dashed bg-muted/20 p-3">
                        <Label htmlFor="source-credentials-file" className="mb-2 flex items-center gap-2">
                          <FileUp className="h-4 w-4" />
                          Upload JSON Credentials
                        </Label>
                        <Input
                          id="source-credentials-file"
                          type="file"
                          accept=".json,application/json"
                          onChange={handleCustomFileChange}
                        />
                        {customCredentialsFile ? (
                          <p className="mt-2 text-xs text-muted-foreground">Selected: {customCredentialsFile.name}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {globalCredentialsFile
                          ? `Using global credentials: ${globalCredentialsFile.name}`
                          : "No global credentials uploaded yet."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <Label className="text-sm font-medium">Source Context</Label>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        Source Project ID
                        {projectsQuery.isFetching ? <Spinner className="inline-block h-3 w-3" /> : null}
                      </Label>
                      <Select
                        value={sourceProjectId || undefined}
                        onValueChange={handleProjectChange}
                        disabled={!sourceCredentialsReady || projectsQuery.isFetching || projects.length === 0}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={sourceCredentialsReady ? "Load projects" : "Upload credentials"} />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project} value={project}>
                              {project}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm">
                        Source Database
                        {databasesQuery.isFetching ? <Spinner className="inline-block h-3 w-3" /> : null}
                      </Label>
                      <Select
                        value={sourceDatabaseId || "__default__"}
                        onValueChange={handleDatabaseChange}
                        disabled={!sourceProjectId || databasesQuery.isFetching}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder={normalizedDatabaseLabel} />
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
                    </div>
                  </div>
                </div>

                {sourceCredentialsMissing || sourceProjectMissing ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Source setup required</AlertTitle>
                    <AlertDescription>
                      {sourceCredentialsMissing
                        ? "Provide source credentials before continuing."
                        : "Select a source project ID before continuing."}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}

            {step === "SELECT" ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-2 sm:p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
                    <Label className="text-sm font-medium">Select Paths to Import</Label>
                    <Badge variant="outline">Selected: {selectedPaths.size}</Badge>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-2 px-1">
                    <Input
                      placeholder="Firebase path (e.g. channels/UC-...)"
                      className="h-8"
                      value={firebasePathInput}
                      onChange={(event) => setFirebasePathInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void handleLoadFirebasePath()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 sm:w-auto"
                      disabled={isPathLoading}
                      onClick={() => void handleLoadFirebasePath()}
                    >
                      {isPathLoading ? <Spinner data-icon="inline-start" /> : null}
                      Load
                    </Button>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-2 px-1">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={
                          currentPathIsCollection
                            ? "Search documents by ID in this collection..."
                            : "Open a collection to search its documents"
                        }
                        className="h-8 pl-7"
                        value={documentSearch}
                        disabled={!currentPathIsCollection || isSearching}
                        onChange={(event) => setDocumentSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            void runDocumentSearch(documentSearch.trim())
                          }
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 sm:w-auto"
                        disabled={!currentPathIsCollection || isSearching}
                        onClick={() => void runDocumentSearch(documentSearch.trim())}
                      >
                        {isSearching ? <Spinner data-icon="inline-start" /> : null}
                        Search
                      </Button>
                      {appliedDocSearch ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          disabled={isSearching}
                          onClick={() => {
                            setDocumentSearch("")
                            void runDocumentSearch("")
                          }}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
                    <FirestoreSelectionTree
                      tree={tree}
                      currentPath={currentPath}
                      selectedPaths={selectedPaths}
                      isTreeLoading={isPathLoading}
                      onNavigate={handleNavigate}
                      onToggleSelect={toggleSelect}
                      onLoadMore={loadMoreChildren}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {step === "SUMMARY" ? (
              <div className="flex h-full min-h-0 flex-col space-y-4">
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">Import Summary</Label>
                    <Badge variant="outline">{summaryItems.length} item(s)</Badge>
                  </div>

                  <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky top-0 bg-background/95">Source Path</TableHead>
                          <TableHead className="sticky top-0 bg-background/95">Destination Path</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                              No selected paths.
                            </TableCell>
                          </TableRow>
                        ) : null}
                        {summaryItems.map((item, index) => (
                          <TableRow key={`${item.source}-${index}`}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{item.source}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{item.target}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : null}

            {step === "CONFLICT" ? (
              <div className="h-full space-y-4 overflow-y-auto pr-2">
                <div className="rounded-lg border bg-card p-4">
                  <Label className="text-sm font-medium">Conflict Resolution</Label>
                  <RadioGroup
                    value={conflictResolution}
                    onValueChange={(value) => setConflictResolution(value as ConflictResolution)}
                    className="mt-3 space-y-3"
                  >
                    <div
                      className={`flex cursor-pointer items-start space-x-3 rounded-md border p-4 transition-colors hover:bg-muted/50 ${conflictResolution === "MERGE" ? "border-primary bg-muted/20" : ""}`}
                      onClick={() => setConflictResolution("MERGE")}
                    >
                      <RadioGroupItem value="MERGE" id="merge" className="mt-0.5" checked={conflictResolution === "MERGE"} />
                      <div className="grid gap-1.5">
                        <Label htmlFor="merge" className="cursor-pointer font-medium leading-none">Merge Data</Label>
                        <p className="text-sm text-muted-foreground">
                          Existing documents will be updated. New fields are added, existing fields are overwritten.
                        </p>
                      </div>
                    </div>
                    <div
                      className={`flex cursor-pointer items-start space-x-3 rounded-md border p-4 transition-colors hover:bg-muted/50 ${conflictResolution === "OVERWRITE" ? "border-primary bg-muted/20" : ""}`}
                      onClick={() => setConflictResolution("OVERWRITE")}
                    >
                      <RadioGroupItem value="OVERWRITE" id="overwrite" className="mt-0.5" checked={conflictResolution === "OVERWRITE"} />
                      <div className="grid gap-1.5">
                        <Label htmlFor="overwrite" className="cursor-pointer font-medium leading-none">Overwrite (Replace)</Label>
                        <p className="text-sm text-muted-foreground">
                          Existing documents will be completely replaced. Fields not present in the source will be deleted.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                {conflictResolution === "OVERWRITE" ? (
                  <Alert variant="destructive">
                    <ShieldAlert />
                    <AlertTitle>Destructive overwrite selected</AlertTitle>
                    <AlertDescription>
                      Existing destination documents can be fully replaced. Verify the summary before confirming import.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}

            {step === "EXECUTE" ? (
              <div className="flex h-full min-h-80 flex-col items-center justify-center space-y-4 rounded-lg border bg-card p-6 text-center">
                <Spinner className="h-12 w-12 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">{cancelling ? "Cancelling..." : "Copying Data..."}</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Committed: <span className="font-mono font-bold text-foreground">{copiedDocuments.toLocaleString()}</span>
                    {failedDocuments > 0 ? (
                      <span className="ml-2 text-rose-500">· {failedDocuments.toLocaleString()} failed</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Progress counts documents actually written. You can cancel; committed documents remain.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void cancelCopy()}
                  disabled={!activeJobId || cancelling}
                >
                  {cancelling ? "Cancelling..." : "Cancel copy"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap items-center sm:justify-between gap-3 border-t border-border px-4 py-4 sm:px-6 shrink-0 bg-background">
          <div className="w-full sm:w-auto">
            {step !== "AUTH" && step !== "EXECUTE" ? (
              <Button variant="outline" onClick={handleBack} className="w-full sm:w-auto">
                Back
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center w-full sm:w-auto">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={step === "EXECUTE"} className="w-full sm:w-auto">
              Cancel
            </Button>

            {step === "AUTH" ? (
              <Button onClick={() => void proceedToSelect()} disabled={!sourceProjectId || initFirestoreMutation.isPending} className="w-full sm:w-auto shadow-sm">
                {initFirestoreMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                Continue
              </Button>
            ) : null}

            {step === "SELECT" ? (
              <Button onClick={() => setStep("SUMMARY")} disabled={selectedPaths.size === 0} className="w-full sm:w-auto shadow-sm">
                Review Selection
              </Button>
            ) : null}

            {step === "SUMMARY" ? <Button onClick={() => setStep("CONFLICT")} className="w-full sm:w-auto shadow-sm">Set Conflict Policy</Button> : null}

            {step === "CONFLICT" ? (
              <Button
                variant={conflictResolution === "OVERWRITE" ? "destructive" : "default"}
                onClick={() => void executeCopy()}
                className="w-full sm:w-auto shadow-sm"
              >
                Confirm & Import
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
