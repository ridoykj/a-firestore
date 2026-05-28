import { useMemo, useState, type ChangeEvent, type ReactNode } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/shadcn/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shadcn/components/ui/table"
import {
  AlertCircle,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CloudDownload,
  FileText,
  FileUp,
  Folder,
  ShieldAlert,
  Square,
} from "lucide-react"
import type { NestedNode } from "@/dto/firestore/FirestoreSchema"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
  useFirestoreTransferDeepCopyMutation,
} from "@/services/api/firestore-query"
import { firestoreService } from "@/services/api/firestore-service"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"

interface FirestoreToFirestoreImportDialogProps {
  context: ProjectTab & { activePath: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onImportSuccess: () => void
}

type Step = "AUTH" | "SELECT" | "SUMMARY" | "CONFLICT" | "EXECUTE"
type ConflictResolution = "MERGE" | "OVERWRITE"

interface TreeNode {
  path: string
  name: string
  type: "collection" | "document"
  children?: TreeNode[]
  isLoaded: boolean
  isLoading: boolean
}

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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [firebasePathInput, setFirebasePathInput] = useState("")
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>("MERGE")
  const [authAttempted, setAuthAttempted] = useState(false)

  const activeCredentialsFile = useCustomCredentials ? customCredentialsFile : globalCredentialsFile
  const sourceCredentialsReady = Boolean(activeCredentialsFile)

  const normalizedDatabaseLabel = useMemo(
    () => (sourceDatabaseId.trim() ? sourceDatabaseId.trim() : "(default)"),
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
  const copyMutation = useFirestoreTransferDeepCopyMutation()

  const projects = projectsQuery.data ?? []
  const databases = databasesQuery.data ?? []

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
    setExpandedPaths(new Set())
    setSelectedPaths(new Set())
    setFirebasePathInput("")
    setConflictResolution("MERGE")
    setAuthAttempted(false)
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
      setExpandedPaths(new Set())
      setSelectedPaths(new Set())
      setFirebasePathInput("")
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
    setExpandedPaths(new Set())
  }

  async function handleLoadFirebasePath() {
    const normalizedPath = normalizeFirebasePath(firebasePathInput)
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
          children: childNodes,
        },
      ])
      setExpandedPaths(new Set([normalizedPath]))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid Firebase path."
      toast.error(message)
    }
  }

  async function loadChildren(nodePath: string) {
    try {
      const response = await firestoreService.getNested(
        { projectId: sourceProjectId, databaseId: sourceDatabaseId },
        nodePath,
        100,
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

  function toggleExpand(nodePath: string, isLoaded: boolean) {
    const nextExpanded = new Set(expandedPaths)

    if (nextExpanded.has(nodePath)) {
      nextExpanded.delete(nodePath)
      setExpandedPaths(nextExpanded)
      return
    }

    nextExpanded.add(nodePath)
    setExpandedPaths(nextExpanded)

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

  function renderTree(nodes: TreeNode[], depth = 0): ReactNode {
    return nodes
      .map((node) => {
        const isExpanded = expandedPaths.has(node.path)
        const isSelected = selectedPaths.has(node.path)

        return (
          <div key={node.path} className="flex flex-col">
            <div
              className="flex items-center rounded-md py-1 hover:bg-muted/50"
              style={{ paddingLeft: `${depth * 1.25}rem` }}
            >
              <button
                type="button"
                className="mr-1 flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted"
                onClick={() => toggleExpand(node.path, node.isLoaded)}
                aria-label={`Toggle ${node.name}`}
              >
                {node.isLoading ? (
                  <Spinner className="h-4 w-4" />
                ) : isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                className="mr-2 rounded-sm p-0.5 hover:bg-muted"
                onClick={() => toggleSelect(node.path)}
                title={isSelected ? "Unselect" : "Select"}
                aria-label={isSelected ? `Unselect ${node.name}` : `Select ${node.name}`}
              >
                {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
              </button>

              <button
                type="button"
                className="flex flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-muted"
                onClick={() => toggleExpand(node.path, node.isLoaded)}
              >
                {node.type === "collection" ? (
                  <Folder className="h-4 w-4 text-blue-500" />
                ) : (
                  <FileText className="h-4 w-4 text-orange-500" />
                )}
                <span className="truncate font-mono text-sm">{node.name}</span>
              </button>
            </div>

            {isExpanded && node.children && renderTree(node.children, depth + 1)}
          </div>
        )
      })
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

  async function executeCopy() {
    setStep("EXECUTE")
    try {
      const response = await copyMutation.mutateAsync({
        sourceProjectId,
        sourceDatabaseId,
        sourcePaths: Array.from(selectedPaths),
        targetProjectId: context.projectId,
        targetDatabaseId: context.databaseId,
        targetBasePath: context.activePath,
        conflictResolution,
      })

      toast.success(`Copied ${response.copiedDocuments} documents successfully!`)
      onImportSuccess()
      handleOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deep copy failed"
      toast.error(message)
      setStep("CONFLICT")
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-5xl gap-0 overflow-hidden p-0 sm:w-[90vw] md:w-[84vw]">
        <DialogHeader className="border-b px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <DialogTitle className="inline-flex items-center gap-2">
                <CloudDownload className="text-primary" />
                Import from Firestore
              </DialogTitle>
              <DialogDescription className="mt-1">
                Deep copy nested collections/documents into <strong>{context.projectId}</strong>
                {" / "}
                <strong>{context.databaseId || "(default)"}</strong>.
              </DialogDescription>
            </div>
            <Badge variant="outline">Step {stepIndex + 1} of {STEP_SEQUENCE.length}</Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
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
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            {step === "AUTH" ? (
              <div className="space-y-4">
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
              <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-sm font-medium">Select Paths to Import</Label>
                    <Badge variant="outline">Selected: {selectedPaths.size}</Badge>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      placeholder="Firebase path (e.g. channels/UC-...)"
                      className="h-9"
                      value={firebasePathInput}
                      onChange={(event) => setFirebasePathInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void handleLoadFirebasePath()
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" className="h-9 sm:w-auto" onClick={() => void handleLoadFirebasePath()}>
                      Load
                    </Button>
                  </div>

                  <div className="mt-3 max-h-[48vh] overflow-auto rounded-md border bg-background p-2">
                    {tree.length > 0 ? renderTree(tree) : (
                      <Empty className="border-none p-4">
                        <EmptyHeader>
                          <EmptyTitle>No paths loaded yet</EmptyTitle>
                          <EmptyDescription>Load root collections or a Firebase path to start selecting.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {step === "SUMMARY" ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">Import Summary</Label>
                    <Badge variant="outline">{summaryItems.length} item(s)</Badge>
                  </div>

                  <div className="mt-3 max-h-[46vh] overflow-auto rounded-md border">
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
              <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                  <Label className="text-sm font-medium">Conflict Resolution</Label>
                  <RadioGroup
                    value={conflictResolution}
                    onValueChange={(value) => setConflictResolution(value as ConflictResolution)}
                    className="mt-3 space-y-3"
                  >
                    <div className="flex items-start space-x-3 rounded-md border p-4">
                      <RadioGroupItem value="MERGE" id="merge" />
                      <div className="grid gap-1.5">
                        <Label htmlFor="merge">Merge Data</Label>
                        <p className="text-sm text-muted-foreground">
                          Existing documents will be updated. New fields are added, existing fields are overwritten.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 rounded-md border p-4">
                      <RadioGroupItem value="OVERWRITE" id="overwrite" />
                      <div className="grid gap-1.5">
                        <Label htmlFor="overwrite">Overwrite (Replace)</Label>
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
              <div className="flex min-h-[320px] flex-col items-center justify-center space-y-4 rounded-lg border bg-card p-6 text-center">
                <Spinner className="h-12 w-12 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">Copying Data...</h3>
                  <p className="text-sm text-muted-foreground">
                    This may take a few moments depending on the size of the selection.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t bg-background px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {step !== "AUTH" && step !== "EXECUTE" ? (
                  <Button variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={step === "EXECUTE"}>
                  Cancel
                </Button>

                {step === "AUTH" ? (
                  <Button onClick={() => void proceedToSelect()} disabled={!sourceProjectId || initFirestoreMutation.isPending}>
                    {initFirestoreMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
                    Continue
                  </Button>
                ) : null}

                {step === "SELECT" ? (
                  <Button onClick={() => setStep("SUMMARY")} disabled={selectedPaths.size === 0}>
                    Review Selection
                  </Button>
                ) : null}

                {step === "SUMMARY" ? <Button onClick={() => setStep("CONFLICT")}>Set Conflict Policy</Button> : null}

                {step === "CONFLICT" ? (
                  <Button
                    variant={conflictResolution === "OVERWRITE" ? "destructive" : "default"}
                    onClick={() => void executeCopy()}
                  >
                    Confirm & Import
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
