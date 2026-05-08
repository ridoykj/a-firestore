import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shadcn/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/shadcn/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { FolderTree, LayoutDashboard, LogOut, Plus, RefreshCw, User } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/services/api/firestore-query"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"

interface FirestoreHeaderProps {
  tab: ProjectTab
  onOpenAddTab: () => void
}

export function FirestoreHeader({ tab, onOpenAddTab }: FirestoreHeaderProps) {
  const navigate = useNavigate()
  const {
    credentialsFile,
    setCredentialsFile,
    clearTabs,
    setAuthStatus,
    findTabByContext,
    setActiveTabId,
    updateTabContext,
  } = useGcpStore()
  const [selectedProjectId, setSelectedProjectId] = useState(tab.projectId)
  const [selectedDatabaseId, setSelectedDatabaseId] = useState(tab.databaseId)
  const projectsQuery = useFirestoreProjectsQuery({ credentialsFile })
  const databasesQuery = useFirestoreDatabasesQuery({
    projectId: selectedProjectId,
    credentialsFile,
  })
  const initFirestoreMutation = useFirestoreInitMutation()

  const projects = projectsQuery.data ?? []
  const databases = databasesQuery.data ?? []
  const loadingProjects = projectsQuery.isFetching
  const loadingDatabases = databasesQuery.isFetching
  const applyingContext = initFirestoreMutation.isPending

  const normalizedDatabaseLabel = useMemo(
    () => (selectedDatabaseId.trim() ? selectedDatabaseId.trim() : "(default)"),
    [selectedDatabaseId],
  )

  useEffect(() => {
    setSelectedProjectId(tab.projectId)
    setSelectedDatabaseId(tab.databaseId)
  }, [tab.id, tab.projectId, tab.databaseId])

  useEffect(() => {
    if (!projectsQuery.error || projectsQuery.errorUpdatedAt === 0) {
      return
    }
    const message = projectsQuery.error.message || "Failed to load project IDs."
    setAuthStatus({ tone: "error", message })
    toast.error(message)
  }, [projectsQuery.error, projectsQuery.errorUpdatedAt, setAuthStatus])

  useEffect(() => {
    if (projectsQuery.dataUpdatedAt === 0) {
      return
    }
    setAuthStatus({
      tone: projects.length > 0 ? "success" : "warning",
      message:
        projects.length > 0
          ? `Loaded ${projects.length} project ID(s).`
          : "No accessible project IDs found with the uploaded credentials.",
    })
  }, [projects, projectsQuery.dataUpdatedAt, setAuthStatus])

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

  function handleLogout() {
    setCredentialsFile(null)
    clearTabs()
    setAuthStatus(null)
    navigate({ to: "/" })
  }

  async function loadProjects() {
    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }

    const result = await projectsQuery.refetch()
    if (result.error) {
      const message = result.error.message || "Failed to load project IDs."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
    }
  }

  async function applyTabContext(projectId: string, databaseId: string) {
    const normalizedProjectId = projectId.trim()
    const normalizedDatabaseId = databaseId.trim()

    if (!credentialsFile) {
      setAuthStatus({ tone: "warning", message: "Choose a credentials JSON file first." })
      return
    }
    if (!normalizedProjectId) {
      setAuthStatus({ tone: "warning", message: "Select a project ID first." })
      return
    }

    try {
      await initFirestoreMutation.mutateAsync({
        projectId: normalizedProjectId,
        credentialsFile,
        databaseId: normalizedDatabaseId,
      })
      const duplicateTab = findTabByContext(normalizedProjectId, normalizedDatabaseId)
      if (duplicateTab && duplicateTab.id !== tab.id) {
        setActiveTabId(duplicateTab.id)
        setAuthStatus({ tone: "success", message: `Switched to existing tab: ${duplicateTab.label}.` })
        return
      }

      updateTabContext(tab.id, normalizedProjectId, normalizedDatabaseId)
      setAuthStatus({
        tone: "success",
        message: `Switched context to ${normalizedProjectId} / ${normalizedDatabaseId || "(default)"}.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize Firestore."
      setAuthStatus({ tone: "error", message })
      toast.error(message)
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    setSelectedProjectId(nextProjectId)
    setSelectedDatabaseId("")
    await applyTabContext(nextProjectId, "")
  }

  async function handleDatabaseChange(nextDatabaseId: string) {
    const normalizedDatabaseId = nextDatabaseId === "__default__" ? "" : nextDatabaseId
    setSelectedDatabaseId(normalizedDatabaseId)
    await applyTabContext(selectedProjectId, normalizedDatabaseId)
  }

  const controlsDisabled = !credentialsFile || loadingProjects || loadingDatabases || applyingContext

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderTree data-icon="inline-start" className="text-primary" />
          Data Browser
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Project ID
              {loadingProjects ? <Spinner className="w-3 h-3 inline-block ml-1" /> : null}
            </label>
            <Select
              value={selectedProjectId || undefined}
              onValueChange={(value) => void handleProjectChange(value)}
              disabled={controlsDisabled || projects.length === 0}
            >
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder={credentialsFile ? "Load projects" : "Upload credentials"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project} value={project} className="text-xs">
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Database
              {loadingDatabases || applyingContext ? <Spinner className="w-3 h-3 inline-block ml-1" /> : null}
            </label>
            <Select
              value={selectedDatabaseId || "__default__"}
              onValueChange={(value) => void handleDatabaseChange(value)}
              disabled={controlsDisabled || !selectedProjectId}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder={normalizedDatabaseLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__" className="text-xs">
                  (default)
                </SelectItem>
                {databases.map((database) => (
                  <SelectItem key={database} value={database} className="text-xs">
                    {database}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void loadProjects()}
            disabled={!credentialsFile || loadingProjects || applyingContext}
          >
            <RefreshCw className={loadingProjects ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onOpenAddTab}>
          <Plus data-icon="inline-start" />
          Add Tab
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-muted">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" alt="User" />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link to="/app" className="flex w-full items-center">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Back to Dashboard</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/30"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
