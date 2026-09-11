import { AddTabDialog } from "@/features/firestore/components/dialogs/AddTabDialog"
import { firestoreService } from "@/features/firestore/api/firestore-service"
import FirestorePage from "@/features/firestore/pages/FirestorePage"
import { useGcpStore, type ConnectionMode, type ProjectTab } from "@/features/gcp/store/gcp-store"
import { Button } from "@/shadcn/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"
import { cn } from "@/shadcn/lib/utils"
import { useTheme } from "@/shared/components/ui/shadcn/components/theme-provider"
import { useRegisterCommands } from "@/shared/components/command/command-registry"
import { Database, Folder, Moon, Plus, Sun, X, LogOut, WifiOff } from "lucide-react"
import { useMemo, useState } from "react"
import { normalizeDatabaseId } from "@/features/firestore/api/firestore-utils"

function getConnectionBadge(mode: ConnectionMode) {
  switch (mode) {
    case "emulator":
      return {
        color: "bg-yellow-500",
        shadow: "shadow-[0_0_8px_rgba(234,179,8,0.6)]",
        label: "Emulator",
      }
    case "service-account":
      return {
        color: "bg-green-500",
        shadow: "shadow-[0_0_8px_rgba(34,197,94,0.6)]",
        label: "Connected",
      }
  }
}

export function FirestoreTabsLayout() {
  const { openTabs, activeTabId, addTab, removeTab, setActiveTabId, disconnectActiveTab, isTabAttached } = useGcpStore()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const isMobile = useIsMobile()
  const { theme, setTheme } = useTheme()

  // FFP-003: Determine active connection mode from the active tab or credentials
  const activeConnectionMode = useMemo((): ConnectionMode | null => {
    if (openTabs.length === 0) return null

    const activeTab = openTabs.find(t => t.id === activeTabId) || openTabs[0]
    return activeTab.connectionMode
  }, [activeTabId, openTabs])

  // FFP-003: Remove hardcoded account profile UI; show real connection info instead
  const activeTab = useMemo((): ProjectTab | null => {
    if (openTabs.length === 0) return null
    return openTabs.find(t => t.id === activeTabId) || openTabs[0]
  }, [activeTabId, openTabs])

  // FFP-201: a restored tab has no live backend client until reattached; don't claim "Connected".
  const activeTabAttached = activeTab ? isTabAttached(activeTab.id) : false

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

  // FFP-003: Close the matching backend client, then clear frontend context.
  async function handleDisconnect() {
    if (activeTab) {
      try {
        await firestoreService.disconnectConnection(activeTab.projectId, activeTab.databaseId)
      } catch {
        // The backend client may already be gone; still clear the frontend context.
      }
    }
    disconnectActiveTab()
  }

  // FFP-206: workspace-level commands (tab management, theme).
  function cycleTab(direction: 1 | -1) {
    if (openTabs.length === 0) return
    const currentIndex = openTabs.findIndex((t) => t.id === activeValue)
    const baseIndex = currentIndex < 0 ? 0 : currentIndex
    const nextIndex = (baseIndex + direction + openTabs.length) % openTabs.length
    setActiveTabId(openTabs[nextIndex].id)
  }

  useRegisterCommands("workspace-tabs", [
    { id: "tab.add", label: "New tab", group: "Workspace", run: () => setAddDialogOpen(true) },
    {
      id: "tab.close",
      label: "Close active tab",
      group: "Workspace",
      run: () => {
        if (activeTab) removeTab(activeTab.id)
      },
    },
    { id: "tab.next", label: "Next tab", group: "Workspace", run: () => cycleTab(1) },
    { id: "tab.prev", label: "Previous tab", group: "Workspace", run: () => cycleTab(-1) },
    {
      id: "theme.toggle",
      label: "Toggle light/dark theme",
      group: "Appearance",
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
  ])

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
            {/* FFP-003: Show real connection status instead of hardcoded "Emulator Connected" */}
            {activeConnectionMode ? (
              activeTabAttached ? (
                <>
                  <span
                    className={cn(
                      "flex h-2 w-2 rounded-full",
                      getConnectionBadge(activeConnectionMode).color,
                      getConnectionBadge(activeConnectionMode).shadow,
                    )}
                    title={`${getConnectionBadge(activeConnectionMode).label}: ${activeTab?.projectId ?? ""}`}
                  ></span>
                  <span className="text-xs text-neutral-400">
                    {getConnectionBadge(activeConnectionMode).label} · {activeTab?.projectId}
                  </span>
                </>
              ) : (
                /* FFP-201: restored tab awaiting reattachment */
                <span className="flex items-center gap-2 text-xs text-amber-400">
                  <span className="flex h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>
                  Reconnect required · {activeTab?.projectId}
                </span>
              )
            ) : (
              <span className="flex items-center gap-2 text-xs text-neutral-500">
                <WifiOff className="h-3 w-3" />
                Disconnected
              </span>
            )}
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

          {/* FFP-003: Replace placeholder account dropdown with real disconnect control */}
          {activeTab && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400 font-mono">
                {activeTab.projectId}/{normalizeDatabaseId(activeTab.databaseId)}
              </span>
              <span title="Disconnect from current connection">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onPress={handleDisconnect}
                  className="h-8 w-8 text-neutral-400 hover:text-red-400 hover:bg-neutral-800"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </span>
            </div>
          )}
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
            <Button className="mt-4" onPress={() => setAddDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              Add Tab
            </Button>
          </div>
        </div>
      ) : (
        <Tabs
          selectedKey={activeValue}
          onSelectionChange={(key) => setActiveTabId(String(key))}
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
        >
          {/* SUB-HEADER TABS PANEL */}
          <div className="flex border-b bg-muted/30 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-border/60 bg-muted p-1">
              <TabsList
                className="h-8 min-w-0 flex-1 justify-start gap-1 rounded-none bg-transparent p-0 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {openTabs.map((tab) => {
                  const isActive = tab.id === activeValue
                  return (
                    <div key={tab.id} className="group relative shrink-0">
                      <TabsTrigger
                        id={tab.id}
                        className={cn(
                          "h-8 min-w-0 max-w-60 justify-start gap-2 rounded-lg text-xs font-medium border border-foreground-700 px-3 pr-8 transition-all",
                          "bg-transparent text-muted-foreground shadow-none",
                          "hover:bg-foreground/10 hover:text-foreground",
                          "data-selected:border-blue-500/80 data-selected:bg-blue-600 data-selected:text-white",
                          "data-selected:hover:bg-blue-600",
                          "data-selected:shadow-sm",
                        )}
                      >
                        <Folder className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-white" : "text-slate-500")} />
                        <span className="truncate" title={isMobile ? tab.projectId : tab.label}>
                          {isMobile ? tab.projectId : tab.label}
                        </span>
                      </TabsTrigger>
                      <span title={`Close tab ${tab.label}`}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Close tab ${tab.label}`}
                          className={cn(
                            "absolute top-1/2 right-1 z-10 h-5 w-5 -translate-y-1/2 rounded-md transition-opacity",
                            isActive
                              ? "opacity-100 text-white/90 hover:bg-white/20 hover:text-white"
                              : "opacity-0 text-muted-foreground group-hover:opacity-100 hover:bg-background hover:text-foreground",
                          )}
                          onPress={() => removeTab(tab.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </span>
                    </div>
                  )
                })}
              </TabsList>

              <span title="Add tab">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
                  onPress={() => setAddDialogOpen(true)}
                  aria-label="Add tab"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </span>
            </div>
          </div>

          {openTabs.map((tab) => (
            <TabsContent
              key={tab.id}
              id={tab.id}
              shouldForceMount
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
