import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/services/api/firestore-query"
import { Avatar, AvatarFallback, AvatarImage } from "@/shadcn/components/ui/avatar"
import { Button } from "@/shadcn/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { cn } from "@/shadcn/lib/utils"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"
import { Link, useNavigate } from "@tanstack/react-router"
import { FolderTree, LayoutDashboard, LogOut, RefreshCw, User } from "lucide-react"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"

interface FirestoreHeaderProps {
  tab: ProjectTab
}

export function FirestoreHeader({ tab }: FirestoreHeaderProps) {
  const navigate = useNavigate()
  const {
    credentialsFile,
    setCredentialsFile,
    clearTabs,
    findTabByContext,
    setActiveTabId,
    updateTabContext,
  } = useGcpStore()

  const selectedProjectId = tab.projectId
  const selectedDatabaseId = tab.databaseId

  const projectsQuery = useFirestoreProjectsQuery({ credentialsFile })
  const databasesQuery = useFirestoreDatabasesQuery({
    projectId: selectedProjectId,
    credentialsFile,
  })
  const initFirestoreMutation = useFirestoreInitMutation()

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const databases = useMemo(() => databasesQuery.data ?? [], [databasesQuery.data])
  const loadingProjects = projectsQuery.isFetching
  const loadingDatabases = databasesQuery.isFetching
  const applyingContext = initFirestoreMutation.isPending

  const normalizedDatabaseLabel = useMemo(
    () => (selectedDatabaseId.trim() ? selectedDatabaseId.trim() : "(default)"),
    [selectedDatabaseId],
  )

  useEffect(() => {
    if (!projectsQuery.error || projectsQuery.errorUpdatedAt === 0) {
      return
    }
    const message = projectsQuery.error.message || "Failed to load project IDs."
    toast.error(message)
  }, [projectsQuery.error, projectsQuery.errorUpdatedAt])

  useEffect(() => {
    if (projectsQuery.dataUpdatedAt === 0) {
      return
    }
    if (projects.length > 0) {
      toast.success(`Loaded ${projects.length} project ID(s).`)
    } else {
      toast.warning("No accessible project IDs found with the uploaded credentials.")
    }
  }, [projects, projectsQuery.dataUpdatedAt])

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

  function handleLogout() {
    setCredentialsFile(null)
    clearTabs()
    navigate({ to: "/" })
  }

  async function loadProjects() {
    if (!credentialsFile) {
      toast.warning("Choose a credentials JSON file first.")
      return
    }

    const result = await projectsQuery.refetch()
    if (result.error) {
      const message = result.error.message || "Failed to load project IDs."
      toast.error(message)
    }
  }

  async function applyTabContext(projectId: string, databaseId: string) {
    const normalizedProjectId = projectId.trim()
    const normalizedDatabaseId = databaseId.trim()

    if (!credentialsFile) {
      toast.warning("Choose a credentials JSON file first.")
      return
    }
    if (!normalizedProjectId) {
      toast.warning("Select a project ID first.")
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
        toast.success(`Switched to existing tab: ${duplicateTab.label}.`)
        return
      }

      updateTabContext(tab.id, normalizedProjectId, normalizedDatabaseId)
      toast.success(
        `Switched context to ${normalizedProjectId} / ${normalizedDatabaseId || "(default)"}.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize Firestore."
      toast.error(message)
    }
  }

  async function handleProjectChange(nextProjectId: string) {
    await applyTabContext(nextProjectId, "")
  }

  async function handleDatabaseChange(nextDatabaseId: string) {
    const normalizedDatabaseId = nextDatabaseId === "__default__" ? "" : nextDatabaseId
    await applyTabContext(selectedProjectId, normalizedDatabaseId)
  }

  const controlsDisabled = !credentialsFile || loadingProjects || loadingDatabases || applyingContext

  return (
    <header className="border-b bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
          <div className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
            <FolderTree className="text-primary" />
            Data Browser
          </div>

          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:flex xl:items-center">
            <div className="min-w-0">
              <label className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70">
                Project ID
                {loadingProjects ? <Spinner className="h-3 w-3" /> : null}
              </label>
              <Select
                value={selectedProjectId || undefined}
                onValueChange={(value) => void handleProjectChange(value)}
                disabled={controlsDisabled || projects.length === 0}
              >
                <SelectTrigger className="h-9 w-full text-sm xl:w-56">
                  <SelectValue placeholder={credentialsFile ? "Load projects" : "Upload credentials"} />
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

            <div className="min-w-0">
              <label className="mb-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70">
                Database
                {loadingDatabases || applyingContext ? <Spinner className="h-3 w-3" /> : null}
              </label>
              <Select
                value={selectedDatabaseId || "__default__"}
                onValueChange={(value) => void handleDatabaseChange(value)}
                disabled={controlsDisabled || !selectedProjectId}
              >
                <SelectTrigger className="h-9 w-full text-sm xl:w-48">
                  <SelectValue placeholder={normalizedDatabaseLabel} />
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

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadProjects()}
              disabled={!credentialsFile || loadingProjects || applyingContext}
              className="h-9 xl:self-end"
            >
              <RefreshCw className={cn(loadingProjects && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted">
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
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
