import type { TransferFormat } from "@/dto/firestore/FirestoreSchema"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/services/api/firestore-query"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"
import {
  Download,
  Filter,
  Play,
  Plus,
  Search,
  Upload
} from "lucide-react"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"

interface WorkspaceControllerDeckProps {
  tab: ProjectTab
  queryPath: string
  setQueryPath: (path: string) => void
  runQuery: (page?: number) => void
  isQuerying: boolean

  exportCollectionCurrentPage: (format: TransferFormat) => void
  exportCollectionFull: (format: TransferFormat) => void
  requestCollectionImport: (format: TransferFormat) => void
  setFirestoreImportDialogOpen: (open: boolean) => void
  openCreateFromHeader: () => void
  transferControlsDisabled: () => boolean
  crudBusy: unknown | null
  previewBusy: unknown | null
  transferBusy: boolean

  filterPanelOpen: boolean
  setFilterPanelOpen: (open: boolean) => void

  searchQuery: string
  setSearchQuery: (query: string) => void
}

export function WorkspaceControllerDeck({
  tab,
  queryPath,
  setQueryPath,
  runQuery,
  isQuerying,
  exportCollectionCurrentPage,
  exportCollectionFull,
  requestCollectionImport,
  setFirestoreImportDialogOpen,
  openCreateFromHeader,
  transferControlsDisabled,
  crudBusy,
  previewBusy,
  transferBusy,
  filterPanelOpen,
  setFilterPanelOpen,
  searchQuery,
  setSearchQuery,
}: WorkspaceControllerDeckProps) {
  const {
    credentialsFile,
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

  useEffect(() => {
    if (!projectsQuery.error || projectsQuery.errorUpdatedAt === 0) return
    toast.error(projectsQuery.error.message || "Failed to load project IDs.")
  }, [projectsQuery.error, projectsQuery.errorUpdatedAt])

  useEffect(() => {
    if (!databasesQuery.error || databasesQuery.errorUpdatedAt === 0) return
    toast.error(databasesQuery.error.message || "Failed to load databases.")
  }, [databasesQuery.error, databasesQuery.errorUpdatedAt])

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
    <div className="m-4 bg-card border border-border rounded-2xl shadow-sm overflow-hidden transition-colors">
      {/* COMPACT SELECTOR & PATH CONTROLLER DECK */}
      <div className="p-4 bg-muted/50 border-b border-border grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        {/* Project select */}
        <div className="md:col-span-3 flex flex-col">
          <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            Project ID
            {loadingProjects ? <Spinner className="h-3 w-3" /> : null}
          </label>
          <div className="relative">
            <Select
              value={selectedProjectId || undefined}
              onValueChange={(value) => void handleProjectChange(value)}
              disabled={controlsDisabled || projects.length === 0}
            >
              <SelectTrigger className="w-full bg-card text-xs font-semibold px-3 py-5 rounded-xl border border-border shadow-sm">
                <SelectValue placeholder={credentialsFile ? "Load projects" : "Upload credentials"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project} value={project} className="text-xs font-medium">
                    {project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Database select */}
        <div className="md:col-span-3 flex flex-col">
          <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            Database
            {loadingDatabases ? <Spinner className="h-3 w-3" /> : null}
          </label>
          <div className="relative">
            <Select
              value={selectedDatabaseId || "__default__"}
              onValueChange={(value) => void handleDatabaseChange(value)}
              disabled={controlsDisabled || databases.length === 0}
            >
              <SelectTrigger className="w-full bg-card text-xs font-semibold px-3 py-5 rounded-xl border border-border shadow-sm">
                <SelectValue placeholder="(default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__" className="text-xs font-medium">(default)</SelectItem>
                {databases.map((db) => (
                  <SelectItem key={db} value={db} className="text-xs font-medium">
                    {db}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Collection Path input & execution */}
        <div className="md:col-span-6 flex flex-col">
          <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">Path Location</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3.5 top-2.5 text-xs text-muted-foreground font-mono">/</span>
              <input
                type="text"
                value={queryPath}
                onChange={(e) => setQueryPath(e.target.value)}
                placeholder="users/user_id/posts"
                className="w-full bg-card text-foreground pl-6 pr-4 py-2 rounded-xl text-xs font-mono border border-border focus:outline-none focus:ring-2 focus:ring-primary shadow-sm h-10"
                onKeyDown={(e) => e.key === 'Enter' && runQuery(0)}
              />
            </div>
            <button
              onClick={() => runQuery(0)}
              disabled={isQuerying}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md shadow-primary/10 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 h-10"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isQuerying ? 'Loading...' : 'Run Query'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ACTION OPTIONS: TABLE VIEW, EXPORT, IMPORT, CREATE DOCUMENT */}
      <div className="px-4 py-3 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-3">


        {/* Right Export / Import / Create / Filters elements */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Quick search document ID, path, or field values..."
              className="w-full bg-muted/50 text-xs pl-9 pr-4 py-2 rounded-xl border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={transferControlsDisabled()}
                className="px-3.5 py-1.5 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl border border-border flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Export</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCollectionCurrentPage("json")}>
                JSON (current page)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCollectionCurrentPage("csv")}>
                CSV (current page)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportCollectionFull("json")}>
                JSON (full collection)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCollectionFull("csv")}>
                CSV (full collection)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={transferControlsDisabled()}
                className="px-3.5 py-1.5 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl border border-border flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-blue-500" />
                <span>Import</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => requestCollectionImport("json")}>
                Import JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => requestCollectionImport("csv")}>
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFirestoreImportDialogOpen(true)}>
                Import Firestore
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={openCreateFromHeader}
            disabled={crudBusy !== null || previewBusy !== null || transferBusy}
            className="px-3.5 py-1.5 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-xl border border-border flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Create</span>
          </button>

          <div className="h-5 w-px bg-border mx-1"></div>

          <button
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ${filterPanelOpen
              ? 'bg-secondary border-primary/20 text-secondary-foreground'
              : 'bg-card border-border text-foreground hover:bg-accent'
              }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filterPanelOpen ? "Hide Filters" : "Show Filters"}</span>
          </button>
        </div>
      </div>
    </div>
  )
}