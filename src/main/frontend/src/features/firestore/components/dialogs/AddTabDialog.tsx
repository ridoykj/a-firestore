import {
  useFirestoreDatabasesQuery,
  useFirestoreInitEmulatorMutation,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/features/firestore/api/firestore-query"
import { Button } from "@/shadcn/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/shadcn/components/ui/toggle-group"
import {
  normalizeDatabaseId,
  tabIdFor,
  toStoredDatabaseId,
} from "@/features/firestore/api/firestore-utils"
import { useGcpStore, type ConnectionMode, type ProjectTab } from "@/features/gcp/store/gcp-store"
import { Cloud, Server } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

interface AddTabDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTabCreated: (tab: ProjectTab) => void
}

type TabMode = "cloud" | "emulator"

const DEFAULT_EMULATOR_HOST = "localhost:8080"

// FFP-205: build a tab with an explicit connection mode (no more hardcoded "service-account").
function buildTab(
  projectId: string,
  databaseId: string,
  connectionMode: ConnectionMode,
  emulatorHost?: string,
): ProjectTab {
  const normalizedProject = projectId.trim()
  const normalizedDb = normalizeDatabaseId(databaseId)
  return {
    id: tabIdFor(normalizedProject, normalizedDb),
    projectId: normalizedProject,
    databaseId: toStoredDatabaseId(normalizedDb),
    label: `${normalizedProject} / ${normalizedDb}`,
    connectionMode,
    emulatorHost: connectionMode === "emulator" ? emulatorHost?.trim() : undefined,
  }
}

export function AddTabDialog({ open, onOpenChange, onTabCreated }: AddTabDialogProps) {
  const {
    credentialsFile,
    setCredentialsFile,
  } = useGcpStore()
  const [mode, setMode] = useState<TabMode>("cloud")
  const [selectedProject, setSelectedProject] = useState("")
  const [selectedDatabase, setSelectedDatabase] = useState("")
  // FFP-205: emulator fields (no credentials).
  const [emulatorHost, setEmulatorHost] = useState(DEFAULT_EMULATOR_HOST)
  const [emulatorProject, setEmulatorProject] = useState("")
  const [emulatorDatabase, setEmulatorDatabase] = useState("")

  const projectsQuery = useFirestoreProjectsQuery({ credentialsFile, enabled: false })
  const databasesQuery = useFirestoreDatabasesQuery({
    projectId: selectedProject,
    credentialsFile,
    enabled: Boolean(selectedProject),
  })
  const initFirestoreMutation = useFirestoreInitMutation()
  const initEmulatorMutation = useFirestoreInitEmulatorMutation()

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const databases = useMemo(() => databasesQuery.data ?? [], [databasesQuery.data])
  const loadingProjects = projectsQuery.isFetching
  const loadingDatabases = databasesQuery.isFetching
  const initializing = initFirestoreMutation.isPending || initEmulatorMutation.isPending

  const canCreate = useMemo(() => {
    if (initializing) {
      return false
    }
    if (mode === "emulator") {
      return Boolean(emulatorProject.trim() && emulatorHost.trim())
    }
    return Boolean(credentialsFile && selectedProject)
  }, [mode, initializing, emulatorProject, emulatorHost, credentialsFile, selectedProject])

  useEffect(() => {
    if (!databasesQuery.error || databasesQuery.errorUpdatedAt === 0) {
      return
    }
    const message = databasesQuery.error.message || "Failed to load databases."
    toast.error(message)
  }, [databasesQuery.error, databasesQuery.errorUpdatedAt])

  useEffect(() => {
    if (databasesQuery.dataUpdatedAt === 0) {
      return
    }
    toast.success(
      databases.length > 0
        ? `Loaded ${databases.length} database ID(s).`
        : "No explicit database IDs found. '(default)' will be used.",
    )
  }, [databases, databasesQuery.dataUpdatedAt])

  useEffect(() => {
    if (mode !== "cloud" || !credentialsFile || projectsQuery.isFetching) {
      return
    }

    const loadProjects = async () => {
      setSelectedProject("")
      setSelectedDatabase("")
      const result = await projectsQuery.refetch()
      if (result.error) {
        const message = result.error.message || "Failed to load project IDs."
        toast.error(message)
        return
      }

      const loadedProjects = result.data ?? []
      const initialProject = loadedProjects[0] ?? ""
      setSelectedProject(initialProject)
      if (initialProject) {
        toast.success(`Loaded ${loadedProjects.length} project ID(s).`)
      } else {
        toast.warning("No accessible project IDs found with the uploaded credentials.")
      }
    }

    void loadProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialsFile, mode])

  async function handleCreateCloudTab() {
    if (!credentialsFile) {
      toast.warning("Choose a credentials JSON file first.")
      return
    }
    if (!selectedProject) {
      toast.warning("Select a project ID first.")
      return
    }

    try {
      await initFirestoreMutation.mutateAsync({
        projectId: selectedProject,
        credentialsFile,
        databaseId: selectedDatabase,
      })
      const tab = buildTab(selectedProject, selectedDatabase, "service-account")
      onTabCreated(tab)
      toast.success(`Opened tab for ${tab.label}`)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize Firestore."
      toast.error(message)
    }
  }

  async function handleCreateEmulatorTab() {
    const projectId = emulatorProject.trim()
    const host = emulatorHost.trim()
    if (!projectId) {
      toast.warning("Enter the emulator project ID.")
      return
    }
    if (!host) {
      toast.warning("Enter the emulator host (e.g. localhost:8080).")
      return
    }

    try {
      await initEmulatorMutation.mutateAsync({
        projectId,
        databaseId: emulatorDatabase,
        emulatorHost: host,
      })
      const tab = buildTab(projectId, emulatorDatabase, "emulator", host)
      onTabCreated(tab)
      toast.success(`Connected to emulator ${host}`)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect to the emulator."
      toast.error(message)
    }
  }

  function handleCreateTab() {
    if (mode === "emulator") {
      void handleCreateEmulatorTab()
      return
    }
    void handleCreateCloudTab()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Firestore Tab</DialogTitle>
          <DialogDescription>
            Connect to Google Cloud with a service account, or to a local Firestore emulator.
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value === "cloud" || value === "emulator") {
              setMode(value)
            }
          }}
          variant="outline"
          className="w-full"
        >
          <ToggleGroupItem value="cloud" className="flex-1 gap-2">
            <Cloud className="h-4 w-4" />
            Google Cloud
          </ToggleGroupItem>
          <ToggleGroupItem value="emulator" className="flex-1 gap-2">
            <Server className="h-4 w-4" />
            Emulator
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === "cloud" ? (
          <div className="grid gap-4">
            <div className="rounded-3xl border border-border/70 bg-muted/80 p-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Credentials JSON</p>
                  <p className="text-xs text-muted-foreground">
                    Upload a service account key to automatically load available Firestore projects.
                  </p>
                </div>
                <Input
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null
                    setCredentialsFile(nextFile)
                    setSelectedProject("")
                    setSelectedDatabase("")
                  }}
                  className="h-12 rounded-2xl border-dashed border-border/70 bg-background text-sm"
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-3xl border border-border/70 bg-background p-4 shadow-sm min-w-0">
              <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                <div className="grid gap-2 min-w-0">
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <Label className="text-sm text-muted-foreground">Project ID</Label>
                    <span className="text-xs text-muted-foreground truncate">
                      {loadingProjects ? "Loading projects..." : projects.length > 0 ? `${projects.length} found` : "No projects loaded yet"}
                    </span>
                  </div>
                  <Select
                    value={selectedProject || undefined}
                    onValueChange={(value) => {
                      setSelectedProject(value)
                      setSelectedDatabase("")
                    }}
                    disabled={!credentialsFile || loadingProjects || projects.length === 0}
                  >
                    <SelectTrigger className="h-12 text-sm w-full min-w-0">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project} value={project} className="text-sm pr-8">
                          {project}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 min-w-0">
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <Label className="text-sm text-muted-foreground">Database ID</Label>
                    {initializing ? (
                      <span className="text-xs text-muted-foreground truncate">Initializing...</span>
                    ) : null}
                  </div>
                  <Select
                    value={selectedDatabase || "__default__"}
                    onValueChange={(value) => setSelectedDatabase(value === "__default__" ? "" : value)}
                    disabled={!selectedProject || loadingDatabases || initializing}
                  >
                    <SelectTrigger className="h-12 text-sm w-full min-w-0">
                      <SelectValue placeholder={loadingDatabases ? "Loading..." : "(default)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__" className="text-sm pr-8">
                        (default)
                      </SelectItem>
                      {databases.map((database) => (
                        <SelectItem key={database} value={database} className="text-sm pr-8">
                          {database}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">
              Connect to a running Firestore emulator. No credentials are required or stored.
            </p>
            <div className="grid gap-2">
              <Label className="text-sm text-muted-foreground">Emulator host</Label>
              <Input
                value={emulatorHost}
                onChange={(event) => setEmulatorHost(event.target.value)}
                placeholder={DEFAULT_EMULATOR_HOST}
                className="h-11 text-sm font-mono"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-sm text-muted-foreground">Project ID</Label>
                <Input
                  value={emulatorProject}
                  onChange={(event) => setEmulatorProject(event.target.value)}
                  placeholder="demo-project"
                  className="h-11 text-sm font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm text-muted-foreground">Database ID</Label>
                <Input
                  value={emulatorDatabase}
                  onChange={(event) => setEmulatorDatabase(event.target.value)}
                  placeholder="(default)"
                  className="h-11 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateTab} disabled={!canCreate}>
            {mode === "emulator" ? "Connect Emulator" : "Open Tab"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
