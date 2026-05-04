import { Button } from "@/shadcn/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/shadcn/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/shadcn/components/ui/dropdown-menu"
import { FolderTree, LayoutDashboard, LogOut, User } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useGcpStore } from "@/store/gcp-store"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Spinner } from "@/shadcn/components/ui/spinner"

interface FirestoreHeaderProps {
  authLoadingDatabases: boolean;
  authInitializing: boolean;
  handleLoadDatabases: (projectId?: string) => void;
  handleAuthenticate: (dbOverride?: string) => void;
}

export function FirestoreHeader({
  authLoadingDatabases,
  authInitializing,
  handleLoadDatabases,
  handleAuthenticate
}: FirestoreHeaderProps) {
  const navigate = useNavigate()
  const {
    projects,
    selectedProject,
    databases,
    selectedDatabase,
    setCredentialsFile,
    setProjects,
    setSelectedProject,
    setDatabases,
    setSelectedDatabase,
    setAuthenticated,
    setAuthStatus
  } = useGcpStore()

  function handleLogout() {
    setCredentialsFile(null)
    setProjects([])
    setSelectedProject("")
    setDatabases([])
    setSelectedDatabase("")
    setAuthenticated(false)
    setAuthStatus(null)
    navigate({ to: '/' })
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderTree data-icon="inline-start" className="text-primary" />
          Data Browser
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Project ID
              {authLoadingDatabases && <Spinner className="w-3 h-3 inline-block ml-1" />}
            </label>
            <Select
              value={selectedProject || undefined}
              onValueChange={(value) => {
                setSelectedProject(value)
                setDatabases([])
                setSelectedDatabase("")
                void handleLoadDatabases(value)
              }}
            >
              <SelectTrigger className="h-8 w-45 text-xs">
                <SelectValue placeholder="Select a project" />
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

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Database ID
              {authInitializing && <Spinner className="w-3 h-3 inline-block ml-1" />}
            </label>
            <Select
              value={selectedDatabase || "__default__"}
              onValueChange={(value) => {
                const dbVal = value === "__default__" ? "" : value;
                setSelectedDatabase(dbVal)
                void handleAuthenticate(dbVal)
              }}
              disabled={authLoadingDatabases || !selectedProject || authInitializing}
            >
              <SelectTrigger className="h-8 w-45 text-xs">
                <SelectValue placeholder={authLoadingDatabases ? "Loading..." : "(default)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__" className="text-xs">(default)</SelectItem>
                {databases.map((database) => (
                  <SelectItem key={database} value={database} className="text-xs">
                    {database}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
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
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/30">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}