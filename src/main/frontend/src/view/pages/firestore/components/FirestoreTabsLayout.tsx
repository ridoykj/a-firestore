import { useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/shadcn/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import { cn } from "@/shadcn/lib/utils"
import { AddTabDialog } from "@/view/pages/firestore/components/AddTabDialog"
import FirestorePage from "@/view/pages/firestore/FirestorePage"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"

export function FirestoreTabsLayout() {
  const { openTabs, activeTabId, addTab, removeTab, setActiveTabId } = useGcpStore()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const isMobile = useIsMobile()

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
    <div className="flex min-h-0 h-full w-full flex-1 flex-col overflow-hidden bg-muted/30">
      <AddTabDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onTabCreated={handleTabCreated}
      />

      {openTabs.length === 0 ? (
        <div className="flex min-h-full items-center justify-center px-4 py-6">
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
          className="flex min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <div className="border-b bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <TabsList
                className="h-auto min-w-0 flex-1 justify-start overflow-x-auto rounded-md border bg-muted/40 p-1"
                variant="line"
              >
                {openTabs.map((tab) => (
                  <div key={tab.id} className="group relative shrink-0">
                    <TabsTrigger value={tab.id} className="min-w-0 max-w-60 gap-1.5 rounded-md pr-6">
                      <span className="truncate text-sm">
                        {isMobile ? tab.projectId : tab.label}
                      </span>
                    </TabsTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Close tab ${tab.label}`}
                      title={`Close tab ${tab.label}`}
                      className="absolute top-1/2 right-0.5 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeTab(tab.id)
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </TabsList>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus data-icon="inline-start" />
                {!isMobile ? "Add Tab" : null}
              </Button>
            </div>
          </div>

          {openTabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              forceMount
              className={cn("min-h-0 flex-1 overflow-hidden", tab.id === activeValue ? "flex" : "hidden")}
            >
              <FirestorePage tab={tab} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
