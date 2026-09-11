import type { TransferFormat } from "@/features/firestore/schemas/FirestoreSchema"
import type { ProjectTab } from "@/features/gcp/store/gcp-store"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shadcn/components/ui/dropdown-menu"
import {
  Download,
  Filter,
  FolderTree,
  ListTree,
  MoreVertical,
  Play,
  Plus,
  Search,
  Trash,
  Upload
} from "lucide-react"

interface WorkspaceControllerDeckProps {
  tab: ProjectTab
  queryPath: string
  setQueryPath: (path: string) => void
  runQuery: (page?: number) => void
  isQuerying: boolean

  drawerMode?: boolean
  onOpenCollectionsDrawer?: () => void
  onOpenNestedDrawer?: () => void
  onOpenFiltersDrawer?: () => void

  exportCollectionCurrentPage: (format: TransferFormat) => void
  exportCollectionFull: (format: TransferFormat) => void
  exportSelectedJSON: () => void
  exportSelectedCSV: () => void
  requestCollectionImport: (format: TransferFormat) => void
  setFirestoreImportDialogOpen: (open: boolean) => void
  openCreateFromHeader: () => void
  transferControlsDisabled: () => boolean
  crudBusy: unknown | null
  previewBusy: unknown | null
  transferBusy: boolean

  selectedRowCount: number
  onRequestDeleteSelected: () => void

  filterPanelOpen: boolean
  setFilterPanelOpen: (open: boolean) => void

  searchQuery: string
  setSearchQuery: (query: string) => void
}

export function WorkspaceControllerDeck({
  queryPath,
  setQueryPath,
  runQuery,
  isQuerying,
  drawerMode = false,
  onOpenCollectionsDrawer,
  onOpenNestedDrawer,
  onOpenFiltersDrawer,
  exportCollectionCurrentPage,
  exportCollectionFull,
  exportSelectedJSON,
  exportSelectedCSV,
  requestCollectionImport,
  setFirestoreImportDialogOpen,
  openCreateFromHeader,
  transferControlsDisabled,
  crudBusy,
  previewBusy,
  transferBusy,
  selectedRowCount,
  onRequestDeleteSelected,
  filterPanelOpen,
  setFilterPanelOpen,
  searchQuery,
  setSearchQuery,
}: WorkspaceControllerDeckProps) {
  return (
    <div className="mx-4 mt-4 bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-colors">
      <div className="p-2 bg-muted/50 border-b border-border flex items-center gap-2">
        {/* FFP-001: Drawer triggers for narrow layouts */}
        {drawerMode && (
          <div className="flex items-center gap-1">
            <span title="Open collections">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Open collections"
                onPress={onOpenCollectionsDrawer}
                className="bg-card shadow-sm"
              >
                <FolderTree className="w-4 h-4 text-muted-foreground" />
              </Button>
            </span>
            <span title="Open nested browser">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Open nested browser"
                onPress={onOpenNestedDrawer}
                className="bg-card shadow-sm"
              >
                <ListTree className="w-4 h-4 text-muted-foreground" />
              </Button>
            </span>
            <span title="Open filters">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Open filters"
                onPress={onOpenFiltersDrawer}
                className="bg-card shadow-sm"
              >
                <Filter className="w-4 h-4 text-muted-foreground" />
              </Button>
            </span>
          </div>
        )}

        {/* Collection Path input */}
        <div className="flex-1 relative">
          <span className="absolute left-3 top-2 text-xs text-muted-foreground font-mono">/</span>
          <Input
            type="text"
            value={queryPath}
            onChange={(e) => setQueryPath(e.target.value)}
            placeholder="users/user_id/posts"
            className="bg-card pl-6 font-mono shadow-sm h-8"
            onKeyDown={(e) => e.key === 'Enter' && runQuery(0)}
          />
        </div>

        {/* Run Query Button */}
        <Button
          size="lg"
          onPress={() => runQuery(0)}
          isDisabled={isQuerying}
          className="px-4 font-bold shadow-md shadow-primary/10 hover:shadow-lg"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isQuerying ? 'Loading...' : 'Run Query'}</span>
        </Button>

        {/* Quick Search */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Quick search..."
            className="bg-card pl-8 shadow-sm h-8"
          />
        </div>

        {/* Actions Dropdown */}
        <DropdownMenuTrigger>
          <span title="More actions">
            <Button
              variant="outline"
              size="icon-lg"
              className="bg-card shadow-sm"
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </Button>
          </span>
          <DropdownMenu placement="bottom end" className="w-56">
            <DropdownMenuItem
              onAction={openCreateFromHeader}
              isDisabled={crudBusy !== null || previewBusy !== null || transferBusy}
            >
              <Plus className="w-4 h-4 mr-2 text-blue-600" />
              <span>Create Document</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onAction={onRequestDeleteSelected}
              isDisabled={selectedRowCount === 0}
            >
              <Trash className="w-4 h-4 mr-2 text-red-500" />
              <span>Delete Selected ({selectedRowCount})</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger isDisabled={transferControlsDisabled()}>
                <Download className="w-4 h-4 mr-2 text-emerald-500" />
                <span>Export</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onAction={() => exportCollectionCurrentPage("json")}>
                  JSON (current page)
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => exportCollectionCurrentPage("csv")}>
                  CSV (current page)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onAction={() => exportCollectionFull("json")}>
                  JSON (full collection)
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => exportCollectionFull("csv")}>
                  CSV (full collection)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onAction={exportSelectedJSON} isDisabled={selectedRowCount === 0}>
                  JSON (selected rows)
                </DropdownMenuItem>
                <DropdownMenuItem onAction={exportSelectedCSV} isDisabled={selectedRowCount === 0}>
                  CSV (selected rows)
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger isDisabled={transferControlsDisabled()}>
                <Upload className="w-4 h-4 mr-2 text-blue-500" />
                <span>Import</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onAction={() => requestCollectionImport("json")}>
                  Import JSON
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => requestCollectionImport("csv")}>
                  Import CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onAction={() => setFirestoreImportDialogOpen(true)}>
                  Import Firestore
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem onAction={() => setFilterPanelOpen(!filterPanelOpen)}>
              <Filter className="w-4 h-4 mr-2" />
              <span>{filterPanelOpen ? "Hide Filters" : "Show Filters"}</span>
            </DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>
      </div>
    </div>
  )
}