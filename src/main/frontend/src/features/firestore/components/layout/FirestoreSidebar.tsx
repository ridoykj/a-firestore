import { Button } from "@/shadcn/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
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
import { useState, useMemo, useEffect, useCallback, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { toast } from "sonner"
import { useGcpStore, type ProjectTab } from "@/features/gcp/store/gcp-store"
import {
  useFirestoreDatabasesQuery,
  useFirestoreInitMutation,
  useFirestoreProjectsQuery,
} from "@/features/firestore/api/firestore-query"
import { normalizeDatabaseId } from "@/features/firestore/api/firestore-utils"

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
  /** FFP-202: optional saved-queries/history section rendered below the collection list. */
  belowCollections?: ReactNode
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
  belowCollections,
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

  // The tab's own project/database is already a live connection, so it must always be
  // selectable/visible even if the "list projects"/"list databases" call comes back without it —
  // e.g. a service account scoped to Firestore data access but not `resourcemanager.projects.list`,
  // or a project with only the default database. Without this, the Select shows blank (no matching
  // SelectItem for the current value) and disables itself (an empty list), even though the
  // connection the tab is already using is perfectly valid.
  const projectOptions = useMemo(() => {
    if (!selectedProjectId || projects.includes(selectedProjectId)) {
      return projects
    }
    return [selectedProjectId, ...projects]
  }, [projects, selectedProjectId])

  const databaseOptions = useMemo(() => {
    if (!selectedDatabaseId || databases.includes(selectedDatabaseId)) {
      return databases
    }
    return [selectedDatabaseId, ...databases]
  }, [databases, selectedDatabaseId])

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
        `Switched context to ${normalizedProjectId} / ${normalizeDatabaseId(normalizedDatabaseId)}.`,
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

  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  // Virtualize inside a plain scrollable div, not a Radix ScrollArea: Radix composes refs into a
  // new function each render, so a setState-based ref attached to it thrashes (detach→attach)
  // under React 19 and loops. A stable callback ref on a plain div fires once on mount.
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return
    }
    setScrollElement((prev) => (prev === node ? prev : node))
  }, [])

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filteredCollections.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 40,
    overscan: 10,
  })

  const contextSelectors = (
    <div className="p-3 border-b border-border bg-muted/20 flex flex-col gap-3 shrink-0">
      <div className="flex flex-col">
        <Label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 gap-1.5">
          Project ID
          {loadingProjects ? <Spinner className="size-3" /> : null}
        </Label>
        <Select
          value={selectedProjectId || undefined}
          onValueChange={(value) => void handleProjectChange(value)}
          disabled={controlsDisabled || projectOptions.length === 0}
        >
          <SelectTrigger className="w-full bg-card text-xs font-semibold px-3 py-4 rounded-xl border border-border shadow-sm">
            <SelectValue placeholder={credentialsFile ? "Load projects" : "Upload credentials"} />
          </SelectTrigger>
          <SelectContent>
            {projectOptions.map((project) => (
              <SelectItem key={project} value={project} className="text-xs font-medium">
                {project}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col">
        <Label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5 gap-1.5">
          Database
          {loadingDatabases ? <Spinner className="size-3" /> : null}
        </Label>
        <Select
          value={selectedDatabaseId || "__default__"}
          onValueChange={(value) => void handleDatabaseChange(value)}
          disabled={controlsDisabled}
        >
          <SelectTrigger className="w-full bg-card text-xs font-semibold px-3 py-4 rounded-xl border border-border shadow-sm">
            <SelectValue placeholder="(default)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__" className="text-xs font-medium">(default)</SelectItem>
            {databaseOptions.map((db) => (
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="mb-3 px-3 pt-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search collections..."
            value={collectionSearch}
            onChange={(e) => setCollectionSearch(e.target.value)}
            className="bg-muted/50 text-[11px] pl-8 font-medium"
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-2">
        {!collectionsLoading && collections.length === 0 ? (
          <Empty className="border-none p-2">
            <EmptyHeader>
              <EmptyTitle>No collections</EmptyTitle>
              <EmptyDescription>Run a query to load collections.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const collection = filteredCollections[virtualRow.index]
              const isActive = collection === activeCollection
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-0.5"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "w-full h-auto justify-start px-3 py-2.5 rounded-xl text-left text-xs font-normal",
                      isActive
                        ? "bg-secondary text-primary font-bold border-l-4 border-primary shadow-sm hover:bg-secondary hover:text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    onClick={() => {
                      runCollectionQuery(collection)
                      onDrawerOpenChange?.(false)
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className={cn("size-3.5 shrink-0", isActive ? "text-primary" : "text-amber-500")} />
                      <span className="truncate">{collection}</span>
                    </div>
                  </Button>
                </div>
              )
            })}
          </div>
        )}
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
          {belowCollections}
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
              <Layers className="size-[18px] text-primary" />
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Collections</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void refreshCollections()}
                disabled={collectionsLoading}
                className="text-primary"
                title="Refresh collections schema"
              >
                <RefreshCw className={cn("size-4", collectionsLoading && "animate-spin")} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setLeftSidebarExpanded(false)}
                className="text-muted-foreground"
                title="Hide Left Side Panel"
              >
                <ChevronLeft className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="secondary"
            size="icon-lg"
            onClick={() => setLeftSidebarExpanded(true)}
            className="rounded-xl text-primary shadow-sm"
            title="Expand Left side panel"
          >
            <Layers className="size-5" />
          </Button>
        )}
      </div>

      {leftSidebarExpanded ? (
        <>
          {contextSelectors}
          {collectionList}
          {belowCollections}
        </>
      ) : null}
    </aside>
  )
}
