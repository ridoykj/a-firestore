import {
  useFirestoreDatabasesQuery,
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
import { useGcpStore, type ProjectTab } from "@/features/gcp/store/gcp-store"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

interface AddTabDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTabCreated: (tab: ProjectTab) => void
}

function normalizeDatabase(databaseId: string): string {
  return databaseId.trim() ? databaseId.trim() : "(default)"
}

function buildTab(projectId: string, databaseId: string): ProjectTab {
  const normalizedProject = projectId.trim()
  const normalizedDb = normalizeDatabase(databaseId)
  return {
    id: `${normalizedProject}:${normalizedDb}`,
    projectId: normalizedProject,
    databaseId: normalizedDb === "(default)" ? "" : normalizedDb,
    label: `${normalizedProject} / ${normalizedDb}`,
    connectionMode: "service-account", // Default to service-account; can be overridden based on credentials
  }
}

export function AddTabDialog({ open, onOpenChange, onTabCreated }: AddTabDialogProps) {
  const {
    credentialsFile,
    setCredentialsFile,
  } = useGcpStore()
  const [selectedProject, setSelectedProject] = useState("")
  const [selectedDatabase, setSelectedDatabase] = useState("")
  const projectsQuery = useFirestoreProjectsQuery({ credentialsFile, enabled: false })
  const databasesQuery = useFirestoreDatabasesQuery({
    projectId: selectedProject,
    credentialsFile,
    enabled: Boolean(selectedProject),
  })
  const initFirestoreMutation = useFirestoreInitMutation()

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const databases = useMemo(() => databasesQuery.data ?? [], [databasesQuery.data])
  const loadingProjects = projectsQuery.isFetching
  const loadingDatabases = databasesQuery.isFetching
  const initializing = initFirestoreMutation.isPending

  const canCreate = useMemo(
    () => Boolean(credentialsFile && selectedProject && !initializing),
    [credentialsFile, selectedProject, initializing],
  )

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
    if (!credentialsFile || projectsQuery.isFetching) {
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
  }, [credentialsFile])

  async function handleCreateTab() {
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
      const tab = buildTab(selectedProject, selectedDatabase)
      onTabCreated(tab)
      toast.success(`Opened tab for ${tab.label}`)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize Firestore."
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Firestore Tab</DialogTitle>
          <DialogDescription>
            Upload credentials, choose a project/database, and open a separate tab context.
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreateTab()} disabled={!canCreate}>
            Open Tab
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
