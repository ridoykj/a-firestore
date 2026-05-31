import { useMemo, useState } from "react"
import { Plus, X, Database, Sun, Moon, Folder } from "lucide-react"
import { Button } from "@/shadcn/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import { cn } from "@/shadcn/lib/utils"
import { AddTabDialog } from "@/view/pages/firestore/components/AddTabDialog"
import FirestorePage from "@/view/pages/firestore/FirestorePage"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"
import { useTheme } from "next-themes"

export function FirestoreTabsLayout() {
  const { openTabs, activeTabId, addTab, removeTab, setActiveTabId } = useGcpStore()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()

  const activeValue = useMemo(() => {
    if (activeTabId) {
      return activeTabId
    }
    return openTabs[0]?.id ?? ""
  }, [activeTabId, openTabs])

  function handleTabCreated(tab: ProjectTab) {
    addTab(tab)
    setAddDialogOpen(false)
  }

  return (
    <div className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden bg-background">
      {/* Top Header Console Banner */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-neutral-900 px-4 text-white dark:bg-neutral-950">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-tight">Firestore Workspace</span>
            <span className="flex h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Emulator Connected"></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          <div
            onClick={() => {
              // Simulating the prompt requirement to show profile info
              alert("Dashboard Profile Info:\nUser: tanstack.router@gmail.com\nRole: admin\nWorkspace rules applied.");
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700 text-sm font-medium text-white cursor-pointer hover:ring-2 ring-white transition-all active:scale-95"
            title="Account Profile: tanstack.router@gmail.com"
          >
            TR
          </div>
        </div>
      </header>

      <AddTabDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onTabCreated={handleTabCreated}
      />

      {openTabs.length === 0 ? (
        <div className="flex min-h-full flex-1 items-center justify-center px-4 py-6 bg-muted/30">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold">No Firestore tabs yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Open a project/database connection to start browsing data.
            </p>
            <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              Add Tab
            </Button>
          </div>
        </div>
      ) : (
        <Tabs
          value={activeValue}
          onValueChange={setActiveTabId}
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
        >
          {/* SUB-HEADER TABS PANEL */}
          <div className="flex border-b bg-muted/30 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-border/60 bg-muted p-1">
              <TabsList
                className="h-8 min-w-0 flex-1 justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0"
                variant="line"
              >
                {openTabs.map((tab) => {
                  const isActive = tab.id === activeValue
                  return (
                    <div key={tab.id} className="group relative shrink-0">
                      <TabsTrigger
                        value={tab.id}                        
                        className={cn(
                          "h-8 min-w-0 max-w-60 justify-start gap-2 rounded-lg text-xs font-medium border border-foreground-700 px-3 pr-8 transition-all",
                          "bg-transparent text-muted-foreground shadow-none",
                          "hover:bg-foreground/10 hover:text-foreground",
                          "data-[state=active]:border-blue-500/80 data-[state=active]:bg-blue-600 data-[state=active]:text-white",
                          "data-[state=active]:hover:bg-blue-600",
                          "data-[state=active]:shadow-sm",
                        )}
                      >
                        <Folder className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-white" : "text-slate-500")} />
                        <span className="truncate">{isMobile ? tab.projectId : tab.label}</span>
                      </TabsTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Close tab ${tab.label}`}
                        title={`Close tab ${tab.label}`}
                        className={cn(
                          "absolute top-1/2 right-1 z-10 h-5 w-5 -translate-y-1/2 rounded-md transition-opacity",
                          isActive
                            ? "opacity-100 text-white/90 hover:bg-white/20 hover:text-white"
                            : "opacity-0 text-muted-foreground group-hover:opacity-100 hover:bg-background hover:text-foreground",
                        )}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeTab(tab.id)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })}
              </TabsList>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => setAddDialogOpen(true)}
                aria-label="Add tab"
                title="Add tab"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {openTabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              forceMount
              className={cn("min-h-0 flex-1 overflow-hidden bg-background", tab.id === activeValue ? "flex" : "hidden")}
            >
              <FirestorePage tab={tab} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
