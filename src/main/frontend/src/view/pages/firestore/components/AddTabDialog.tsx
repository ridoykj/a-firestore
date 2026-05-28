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

  async function handleLoadProjects() {
    if (!credentialsFile) {
      toast.warning("Choose a credentials JSON file first.")
      return
    }

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
          <div className="grid gap-2">
            <label className="text-sm font-medium text-muted-foreground">Credentials JSON</label>
            <Input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                setCredentialsFile(nextFile)
                setSelectedProject("")
                setSelectedDatabase("")
              }}
              className="h-10 text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleLoadProjects()}
              disabled={!credentialsFile || loadingProjects}
              className="h-9"
            >
              {loadingProjects ? <Spinner className="w-3 h-3 mr-1" /> : null}
              Load Projects
            </Button>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-muted-foreground">
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
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project} value={project} className="text-sm">
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Database ID
              {initializing ? <Spinner className="w-3 h-3 inline-block ml-1" /> : null}
            </label>
            <Select
              value={selectedDatabase || "__default__"}
              onValueChange={(value) => setSelectedDatabase(value === "__default__" ? "" : value)}
              disabled={!selectedProject || loadingDatabases || initializing}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder={loadingDatabases ? "Loading..." : "(default)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__" className="text-sm">
                  (default)
                </SelectItem>
                {databases.map((database) => (
                  <SelectItem key={database} value={database} className="text-sm">
                    {database}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
