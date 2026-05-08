import { useMemo, useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/shadcn/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/components/ui/tabs"
import { AddTabDialog } from "@/view/pages/firestore/components/AddTabDialog"
import FirestorePage from "@/view/pages/firestore/FirestorePage"
import { useGcpStore, type ProjectTab } from "@/store/gcp-store"

export function FirestoreTabsLayout() {
  const { openTabs, activeTabId, addTab, removeTab, setActiveTabId } = useGcpStore()
  const [addDialogOpen, setAddDialogOpen] = useState(false)

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
    <div className="h-screen w-full bg-muted/30">
      <AddTabDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onTabCreated={handleTabCreated}
      />

      {openTabs.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="rounded-lg border bg-card p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold">No Firestore tabs yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
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
          className="h-full gap-0"
        >
          <div className="border-b bg-card px-2 py-1.5">
            <div className="flex items-center gap-2">
              <TabsList className="h-auto max-w-[calc(100%-80px)] overflow-x-auto" variant="line">
                {openTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                    <span className="max-w-52 truncate text-xs">{tab.label}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeTab(tab.id)
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </TabsTrigger>
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
                Add Tab
              </Button>
            </div>
          </div>

          {openTabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              forceMount
              className={tab.id === activeValue ? "h-[calc(100%-52px)]" : "hidden"}
            >
              <FirestorePage tab={tab} onOpenAddTab={() => setAddDialogOpen(true)} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
