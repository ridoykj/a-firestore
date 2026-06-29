import type { TransferFormat } from "@/features/firestore/schemas/FirestoreSchema"
import type { ProjectTab } from "@/features/gcp/store/gcp-store"
import {
  DropdownMenu,
  DropdownMenuContent,
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
  onRequestDeleteSelected: (documentPaths: string[]) => Promise<void>

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
        {/* Collection Path input */}
        <div className="flex-1 relative">
          <span className="absolute left-3 top-2 text-xs text-muted-foreground font-mono">/</span>
          <input
            type="text"
            value={queryPath}
            onChange={(e) => setQueryPath(e.target.value)}
            placeholder="users/user_id/posts"
            className="w-full bg-card text-foreground pl-6 pr-3 py-1.5 rounded-lg text-xs font-mono border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8"
            onKeyDown={(e) => e.key === 'Enter' && runQuery(0)}
          />
        </div>

        {/* Run Query Button */}
        <button
          onClick={() => runQuery(0)}
          disabled={isQuerying}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs px-4 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-primary/10 hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 h-8"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isQuerying ? 'Loading...' : 'Run Query'}</span>
        </button>

        {/* Quick Search */}
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Quick search..."
            className="w-full bg-card text-xs pl-8 pr-3 py-1.5 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary shadow-sm h-8"
          />
        </div>

        {/* Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="px-2 py-1.5 bg-card hover:bg-accent text-foreground text-xs font-semibold rounded-lg border border-border flex items-center justify-center transition-all shadow-sm h-8"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={openCreateFromHeader}
              disabled={crudBusy !== null || previewBusy !== null || transferBusy}
            >
              <Plus className="w-4 h-4 mr-2 text-blue-600" />
              <span>Create Document</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => onRequestDeleteSelected([])}
              disabled={selectedRowCount === 0}
            >
              <Trash className="w-4 h-4 mr-2 text-red-500" />
              <span>Delete Selected ({selectedRowCount})</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={transferControlsDisabled()}>
                <Download className="w-4 h-4 mr-2 text-emerald-500" />
                <span>Export</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportSelectedJSON} disabled={selectedRowCount === 0}>
                  JSON (selected rows)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportSelectedCSV} disabled={selectedRowCount === 0}>
                  CSV (selected rows)
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={transferControlsDisabled()}>
                <Upload className="w-4 h-4 mr-2 text-blue-500" />
                <span>Import</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
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
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => setFilterPanelOpen(!filterPanelOpen)}>
              <Filter className="w-4 h-4 mr-2" />
              <span>{filterPanelOpen ? "Hide Filters" : "Show Filters"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}