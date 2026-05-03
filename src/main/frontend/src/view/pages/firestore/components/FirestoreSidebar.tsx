import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shadcn/components/ui/select"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { cn } from "@/shadcn/lib/utils"
import { Database, PanelLeftClose, PanelLeftOpen, RefreshCw, Table2 } from "lucide-react"
import { useGcpStore } from "@/store/gcp-store"

interface FirestoreSidebarProps {
  leftSidebarExpanded: boolean;
  setLeftSidebarExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void;
  collections: string[];
  collectionsLoading: boolean;
  activeCollection: string;
  refreshCollections: () => void;
  runCollectionQuery: (collection: string) => void;
  authLoadingProjects: boolean;
  authLoadingDatabases: boolean;
  authInitializing: boolean;
  handleLoadProjects: () => void;
  handleLoadDatabases: (projectId?: string) => void;
  handleAuthenticate: (dbOverride?: string) => void;
}

export function FirestoreSidebar({
  leftSidebarExpanded,
  setLeftSidebarExpanded,
  collections,
  collectionsLoading,
  activeCollection,
  refreshCollections,
  runCollectionQuery,
  authLoadingProjects,
  authLoadingDatabases,
  authInitializing,
  handleLoadProjects,
  handleLoadDatabases,
  handleAuthenticate,
}: FirestoreSidebarProps) {
  const {
    credentialsFile,
    setCredentialsFile,
    projects,
    setProjects,
    selectedProject,
    setSelectedProject,
    databases,
    setDatabases,
    selectedDatabase,
    setSelectedDatabase,
    authenticated,
    authStatus,
    setAuthStatus
  } = useGcpStore()

  return (
    <aside
      className={cn(
        "border-r border-border bg-card/95 text-foreground transition-all flex flex-col",
        leftSidebarExpanded ? "w-72" : "w-16",
      )}
    >
      <div className="flex shrink-0 h-12 items-center justify-between border-b border-border px-3">
        {leftSidebarExpanded ? (
          <div className="flex items-center gap-2">
            <Database className="text-primary h-5 w-5" />
            <span className="text-sm font-semibold text-foreground">Firebase Console</span>
          </div>
        ) : (
          <Database className="text-primary h-5 w-5 mx-auto" />
        )}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setLeftSidebarExpanded((value) => !value)}
        >
          {leftSidebarExpanded ? <PanelLeftClose data-icon="inline-start" /> : <PanelLeftOpen data-icon="inline-start" />}
        </Button>
      </div>

      {/* SIDEBAR AUTH & CONTEXT SELECTORS */}
      {leftSidebarExpanded ? (
        <div className="shrink-0 border-b border-border p-3 space-y-4 bg-muted/20">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Credentials File
              </label>
              <Input
                id="credentials-file-sidebar"
                type="file"
                accept=".json,application/json"
                className="h-7 text-xs file:text-xs file:h-7 file:border-0 file:bg-transparent file:text-muted-foreground file:font-medium px-2 py-0"
                aria-invalid={!credentialsFile && authStatus?.tone === "warning"}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null
                  setCredentialsFile(nextFile)
                  setProjects([])
                  setDatabases([])
                  setSelectedProject("")
                  setSelectedDatabase("")
                  setAuthStatus(null)
                }}
              />
              <Button
                type="button"
                size="sm"
                className="h-7 text-[10px] w-full"
                onClick={() => void handleLoadProjects()}
                disabled={!credentialsFile || authLoadingProjects}
              >
                {authLoadingProjects ? <Spinner className="w-3 h-3 mr-1" /> : null}
                Load Projects
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] flex items-center justify-between font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Project ID</span>
                {authLoadingDatabases && <Spinner className="w-3 h-3" />}
              </label>
              <Select
                value={selectedProject || undefined}
                onValueChange={(value) => {
                  setSelectedProject(value)
                  setDatabases([])
                  setSelectedDatabase("")
                  
                  // Auto-fetch the databases for this new project value immediately
                  void handleLoadDatabases(value)
                }}
              >
                <SelectTrigger className="h-7 w-full text-xs">
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

            <div className="space-y-1.5">
              <label className="text-[10px] flex items-center justify-between font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Database ID</span>
                {authInitializing && <Spinner className="w-3 h-3" />}
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
                <SelectTrigger className="h-7 w-full text-xs">
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

            {authStatus ? (
              <div className={cn("text-[10px] px-2 py-1.5 rounded-md", 
                authStatus.tone === "error" ? "bg-destructive/10 text-destructive" :
                authStatus.tone === "warning" ? "bg-warning/10 text-warning" :
                "bg-success/10 text-success"
              )}>
                {authStatus.message}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* COLLECTIONS LIST */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-3 flex items-center justify-between">
          {leftSidebarExpanded ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Collections
            </span>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void refreshCollections()}
            disabled={collectionsLoading || !authenticated}
          >
            <RefreshCw data-icon="inline-start" className={cn(collectionsLoading && "animate-spin")} />
          </Button>
        </div>
        
        {authenticated ? (
          <div className="grid gap-1">
            {collections.map((collection) => {
              const isActive = collection === activeCollection
              return (
                <Button
                  key={collection}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full justify-start gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => runCollectionQuery(collection)}
                >
                  <Table2 data-icon="inline-start" />
                  {leftSidebarExpanded ? <span className="truncate">{collection}</span> : null}
                </Button>
              )
            })}
            {!collectionsLoading && collections.length === 0 ? (
              <Empty className="border-none p-2">
                <EmptyHeader>
                  <EmptyTitle>No collections</EmptyTitle>
                  <EmptyDescription>Run a query to load collections.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
        ) : leftSidebarExpanded ? (
           <div className="text-center p-4">
             <p className="text-xs text-muted-foreground">Authenticate above to view collections.</p>
           </div>
        ) : null}
      </div>
    </aside>
  )
}