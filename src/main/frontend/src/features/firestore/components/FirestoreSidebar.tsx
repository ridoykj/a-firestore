import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shadcn/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shadcn/components/ui/select"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { cn } from "@/shadcn/lib/utils"
import { ChevronLeft, Database, Folder, Layers, RefreshCw, Search } from "lucide-react"
import { useState, useMemo, useEffect } from "react"
import { toast } from "sonner"
import { useGcpStore, type ProjectTab } from "@/features/gcp/store/gcp-store"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/features/firestore/api/firestore-query"

interface FirestoreSidebarProps {
  tab: ProjectTab
  leftSidebarExpanded: boolean
  setLeftSidebarExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void
  collections: string[]
  collectionsLoading: boolean
  activeCollection: string
  refreshCollections: () => void
  runCollectionQuery: (collection: string) => void
  drawerMode?: boolean
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}

export function FirestoreSidebar({
  tab,
  leftSidebarExpanded,
  setLeftSidebarExpanded,
  collections,
  collectionsLoading,
  activeCollection,
  refreshCollections,
  runCollectionQuery,
  drawerMode = false,
  drawerOpen = false,
  onDrawerOpenChange,
}: FirestoreSidebarProps) {
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

  const [collectionSearch, setCollectionSearch] = useState("")

  const filteredCollections = useMemo(() => {
    return collections.filter(c => c.toLowerCase().includes(collectionSearch.toLowerCase()))
  }, [collections, collectionSearch])

  const contextSelectors = (
    <div className="p-3 border-b border-border bg-muted/20 flex flex-col gap-3 shrink-0">
      <div className="flex flex-col">
        <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          Project ID
          {loadingProjects ? <Spinner className="h-3 w-3" /> : null}
        </label>
        <Select
          value={selectedProjectId || undefined}
          onValueChange={(value) => void handleProjectChange(value)}
          disabled={controlsDisabled || projects.length === 0}
        >
          <SelectTrigger className="w-full bg-card text-xs font-semibold px-3 py-4 rounded-xl border border-border shadow-sm">
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

      <div className="flex flex-col">
        <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          Database
          {loadingDatabases ? <Spinner className="h-3 w-3" /> : null}
        </label>
        <Select
          value={selectedDatabaseId || "__default__"}
          onValueChange={(value) => void handleDatabaseChange(value)}
          disabled={controlsDisabled || databases.length === 0}
        >
          <SelectTrigger className="w-full bg-card text-xs font-semibold px-3 py-4 rounded-xl border border-border shadow-sm">
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
  )

  const collectionList = (
    <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col h-full min-h-0">
      <div className="mb-3 px-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search collections..."
            value={collectionSearch}
            onChange={(e) => setCollectionSearch(e.target.value)}
            className="w-full bg-muted/50 text-[11px] pl-8 pr-3 py-1.5 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary transition-all font-medium"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 space-y-0.5">
        {filteredCollections.map((collection) => {
          const isActive = collection === activeCollection
          return (
            <button
              key={collection}
              type="button"
              className={cn(
                "w-full flex items-center justify-start px-3 py-2.5 rounded-xl text-left text-xs transition-all",
                isActive
                  ? "bg-secondary text-primary font-bold border-l-4 border-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => {
                runCollectionQuery(collection)
                onDrawerOpenChange?.(false)
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Folder className={cn("w-3.5 h-3.5 flex-shrink-0", isActive ? "text-primary" : "text-amber-500")} />
                <span className="truncate">{collection}</span>
              </div>
            </button>
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
    </div>
  )

  if (drawerMode) {
    return (
      <Sheet open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="inline-flex items-center gap-2 text-base">
              <Database className="text-primary" />
              Firestore Collections
            </SheetTitle>
            <SheetDescription>Browse available root collections and run quick queries.</SheetDescription>
          </SheetHeader>
          {contextSelectors}
          {collectionList}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      className={cn(
        "hidden bg-card border-r border-border text-foreground transition-all duration-300 md:flex md:flex-col",
        leftSidebarExpanded ? "md:w-60" : "md:w-12",
      )}
    >
      <div className={cn("flex shrink-0 items-center border-b border-border transition-all", leftSidebarExpanded ? "h-14 px-5 justify-between" : "h-14 px-0 justify-center")}>
        {leftSidebarExpanded ? (
          <>
            <div className="flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-primary" />
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Collections</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => void refreshCollections()}
                disabled={collectionsLoading}
                className="p-1 rounded-lg hover:bg-muted text-primary transition-colors"
                title="Refresh collections schema"
              >
                <RefreshCw className={cn("w-4 h-4", collectionsLoading && "animate-spin")} />
              </button>
              <button
                onClick={() => setLeftSidebarExpanded(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                title="Hide Left Side Panel"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setLeftSidebarExpanded(true)}
            className="p-2.5 rounded-xl bg-secondary text-primary hover:bg-secondary/80 transition-all shadow-sm"
            title="Expand Left side panel"
          >
            <Layers className="w-5 h-5" />
          </button>
        )}
      </div>

      {leftSidebarExpanded ? (
        <>
          {contextSelectors}
          {collectionList}
        </>
      ) : null}
    </aside>
  )
}
