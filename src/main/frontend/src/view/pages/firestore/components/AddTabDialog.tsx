import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/services/api/firestore-query"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { cn } from "@/shadcn/lib/utils"

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
  }
}

export function AddTabDialog({ open, onOpenChange, onTabCreated }: AddTabDialogProps) {
  const {
    credentialsFile,
    authStatus,
    setCredentialsFile,
    setAuthStatus,
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

  const projects = projectsQuery.data ?? []
  const databases = databasesQuery.data ?? []
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
    setAuthStatus({ tone: "error", message })
    toast.error(message)
  }, [databasesQuery.error, databasesQuery.errorUpdatedAt, setAuthStatus])

  useEffect(() => {
    if (databasesQuery.dataUpdatedAt === 0) {
      return
    }
    setAuthStatus({
      tone: "success",
      message:
        databases.length > 0
          ? `Loaded ${databases.length} database ID(s).`
          : "No explicit database IDs found. '(default)' will be used.",
    })
  }, [databases, databasesQuery.dataUpdatedAt, setAuthStatus])

  async function handleLoadProjects() {
    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }

    setSelectedProject("")
    setSelectedDatabase("")
    const result = await projectsQuery.refetch()
    if (result.error) {
      const message = result.error.message || "Failed to load project IDs."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
      return
    }

    const loadedProjects = result.data ?? []
    const initialProject = loadedProjects[0] ?? ""
    setSelectedProject(initialProject)
    setAuthStatus({
      tone: initialProject ? "success" : "warning",
      message: initialProject
        ? `Loaded ${loadedProjects.length} project ID(s).`
        : "No accessible project IDs found with the uploaded credentials.",
    })
  }

  async function handleCreateTab() {
    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }
    if (!selectedProject) {
      setAuthStatus({ tone: "warning", message: "Select a project ID first." })
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
      setAuthStatus({ tone: "success", message: `Connected to ${tab.label}.` })
      toast.success(`Opened tab for ${tab.label}`)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize Firestore."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Firestore Tab</DialogTitle>
          <DialogDescription>
            Upload credentials, choose a project/database, and open a separate tab context.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Credentials JSON</label>
            <Input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                setCredentialsFile(nextFile)
                setSelectedProject("")
                setSelectedDatabase("")
                setAuthStatus(null)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleLoadProjects()}
              disabled={!credentialsFile || loadingProjects}
            >
              {loadingProjects ? <Spinner className="w-3 h-3 mr-1" /> : null}
              Load Projects
            </Button>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Project ID
              {loadingDatabases ? <Spinner className="w-3 h-3 inline-block ml-1" /> : null}
            </label>
            <Select
              value={selectedProject || undefined}
              onValueChange={(value) => {
                setSelectedProject(value)
                setSelectedDatabase("")
              }}
              disabled={loadingProjects || projects.length === 0}
            >
              <SelectTrigger>
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
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Database ID
              {initializing ? <Spinner className="w-3 h-3 inline-block ml-1" /> : null}
            </label>
            <Select
              value={selectedDatabase || "__default__"}
              onValueChange={(value) => setSelectedDatabase(value === "__default__" ? "" : value)}
              disabled={!selectedProject || loadingDatabases || initializing}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDatabases ? "Loading..." : "(default)"} />
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

          {authStatus ? (
            <div
              className={cn(
                "text-xs px-2 py-1.5 rounded-md",
                authStatus.tone === "error"
                  ? "bg-destructive/10 text-destructive"
                  : authStatus.tone === "warning"
                    ? "bg-warning/10 text-warning"
                    : "bg-success/10 text-success",
              )}
            >
              {authStatus.message}
            </div>
          ) : null}
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
