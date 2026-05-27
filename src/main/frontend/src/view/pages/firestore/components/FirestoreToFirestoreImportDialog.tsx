import { useMemo, useState, type ChangeEvent, type ReactNode } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import { Button } from "@/shadcn/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Input } from "@/shadcn/components/ui/input"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { RadioGroup, RadioGroupItem } from "@/shadcn/components/ui/radio-group"
import { Label } from "@/shadcn/components/ui/label"
import { CheckSquare, ChevronDown, ChevronRight, FileText, FileUp, Folder, Square } from "lucide-react"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
  useFirestoreTransferDeepCopyMutation,
} from "@/services/api/firestore-query"
import { firestoreService } from "@/services/api/firestore-service"
import type { NestedNode } from "@/dto/firestore/FirestoreSchema"

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
  }

  function handleCustomFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setCustomCredentialsFile(file)
    setSourceProjectId("")
    setSourceDatabaseId("")
  }

  function handleProjectChange(nextProjectId: string) {
    setSourceProjectId(nextProjectId)
    setSourceDatabaseId("")
  }

  function handleDatabaseChange(nextDatabaseId: string) {
    setSourceDatabaseId(nextDatabaseId === "__default__" ? "" : nextDatabaseId)
  }

  async function proceedToSelect() {
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
              className="flex items-center rounded py-1 hover:bg-muted/50"
              style={{ paddingLeft: `${depth * 1.25}rem` }}
            >
              <button
                type="button"
                className="mr-1 flex h-6 w-6 items-center justify-center"
                onClick={() => toggleExpand(node.path, node.isLoaded)}
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
                className="mr-2"
                onClick={() => toggleSelect(node.path)}
                title={isSelected ? "Unselect" : "Select"}
              >
                {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
              </button>

              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => toggleExpand(node.path, node.isLoaded)}
              >
                {node.type === "collection" ? (
                  <Folder className="h-4 w-4 text-blue-500" />
                ) : (
                  <FileText className="h-4 w-4 text-orange-500" />
                )}
                <span className="font-mono text-sm">{node.name}</span>
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-[95vw] min-h-[60vh] max-h-[90vh] overflow-y-auto flex flex-col sm:w-[80vw] sm:max-w-[80vw]">
        <DialogHeader>
          <DialogTitle>Import from Firestore</DialogTitle>
          <DialogDescription>
            Deep copy nested collections and documents from an external Firestore database.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden py-4">
          {step === "AUTH" && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Source Credentials</Label>
                <Select value={useCustomCredentials ? "custom" : "global"} onValueChange={handleCredentialsMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Use global credentials</SelectItem>
                    <SelectItem value="custom">Upload source credentials</SelectItem>
                  </SelectContent>
                </Select>

                {useCustomCredentials ? (
                  <div className="rounded-md border border-dashed p-3">
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
                  <p className="text-xs text-muted-foreground">
                    {globalCredentialsFile
                      ? `Using global credentials: ${globalCredentialsFile.name}`
                      : "No global credentials uploaded yet."}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-1.5">
                    Source Project ID
                    {projectsQuery.isFetching ? <Spinner className="ml-1 inline-block h-3 w-3" /> : null}
                  </Label>
                  <Select
                    value={sourceProjectId || undefined}
                    onValueChange={handleProjectChange}
                    disabled={!sourceCredentialsReady || projectsQuery.isFetching || projects.length === 0}
                  >
                    <SelectTrigger className="mt-1">
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

                <div>
                  <Label className="flex items-center gap-1.5">
                    Source Database
                    {databasesQuery.isFetching ? <Spinner className="ml-1 inline-block h-3 w-3" /> : null}
                  </Label>
                  <Select
                    value={sourceDatabaseId || "__default__"}
                    onValueChange={handleDatabaseChange}
                    disabled={!sourceProjectId || databasesQuery.isFetching}
                  >
                    <SelectTrigger className="mt-1">
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
          )}

          {step === "SELECT" && (
            <div className="flex flex-1 flex-col min-h-0 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Label>Select Paths to Import</Label>
                <div className="flex w-full max-w-md items-center gap-2">
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
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleLoadFirebasePath()}>
                    Load
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto rounded-md border bg-background p-2">
                {renderTree(tree)}
              </div>
              <div className="text-sm text-muted-foreground">Selected: {selectedPaths.size} items</div>
            </div>
          )}

          {step === "SUMMARY" && (
            <div className="flex flex-1 flex-col min-h-0 space-y-4">
              <Label>Import Summary</Label>
              <div className="flex-1 overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-xs uppercase">
                    <tr>
                      <th className="border-b border-r px-4 py-2">Source Path</th>
                      <th className="border-b px-4 py-2">Destination Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryItems.map((item, index) => (
                      <tr key={`${item.source}-${index}`} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="border-r px-4 py-2 font-mono text-xs text-muted-foreground">{item.source}</td>
                        <td className="px-4 py-2 font-mono text-xs text-primary">{item.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "CONFLICT" && (
            <div className="space-y-6">
              <Label>Conflict Resolution</Label>
              <RadioGroup
                value={conflictResolution}
                onValueChange={(value) => setConflictResolution(value as ConflictResolution)}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3 rounded-md border p-4">
                  <RadioGroupItem value="MERGE" id="merge" />
                  <div className="grid gap-1.5">
                    <Label htmlFor="merge">Merge Data</Label>
                    <p className="text-sm text-muted-foreground">
                      Existing documents will be updated. New fields are added, existing fields are overwritten.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 rounded-md border p-4">
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
          )}

          {step === "EXECUTE" && (
            <div className="flex flex-1 flex-col items-center justify-center space-y-4">
              <Spinner className="h-12 w-12 text-primary" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">Copying Data...</h3>
                <p className="text-sm text-muted-foreground">
                  This may take a few moments depending on the size of the selection.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-between">
          <div>
            {step !== "AUTH" && step !== "EXECUTE" ? (
              <Button
                variant="outline"
                onClick={() => {
                  if (step === "SELECT") {
                    setStep("AUTH")
                  } else if (step === "SUMMARY") {
                    setStep("SELECT")
                  } else if (step === "CONFLICT") {
                    setStep("SUMMARY")
                  }
                }}
              >
                Back
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={step === "EXECUTE"}>
              Cancel
            </Button>

            {step === "AUTH" ? (
              <Button onClick={() => void proceedToSelect()} disabled={!sourceProjectId || initFirestoreMutation.isPending}>
                {initFirestoreMutation.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
                Next
              </Button>
            ) : null}

            {step === "SELECT" ? (
              <Button onClick={() => setStep("SUMMARY")} disabled={selectedPaths.size === 0}>
                Next
              </Button>
            ) : null}

            {step === "SUMMARY" ? <Button onClick={() => setStep("CONFLICT")}>Next</Button> : null}

            {step === "CONFLICT" ? <Button onClick={() => void executeCopy()}>Confirm & Import</Button> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
