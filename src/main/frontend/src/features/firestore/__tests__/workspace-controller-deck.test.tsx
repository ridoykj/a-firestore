import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WorkspaceControllerDeck } from "@/features/firestore/components/layout/WorkspaceControllerDeck"
import type { ProjectTab } from "@/features/gcp/store/gcp-store"

const tab: ProjectTab = {
  id: "demo-project:(default)",
  projectId: "demo-project",
  databaseId: "",
  label: "demo-project / (default)",
  connectionMode: "emulator",
}

function renderDeck(overrides: Partial<Parameters<typeof WorkspaceControllerDeck>[0]> = {}) {
  const handlers = {
    onOpenCollectionsDrawer: vi.fn(),
    onOpenNestedDrawer: vi.fn(),
    onOpenFiltersDrawer: vi.fn(),
  }
  render(
    <WorkspaceControllerDeck
      tab={tab}
      queryPath=""
      setQueryPath={vi.fn()}
      runQuery={vi.fn()}
      isQuerying={false}
      exportCollectionCurrentPage={vi.fn()}
      exportCollectionFull={vi.fn()}
      exportSelectedJSON={vi.fn()}
      exportSelectedCSV={vi.fn()}
      requestCollectionImport={vi.fn()}
      setFirestoreImportDialogOpen={vi.fn()}
      openCreateFromHeader={vi.fn()}
      transferControlsDisabled={() => false}
      crudBusy={null}
      previewBusy={null}
      transferBusy={false}
      selectedRowCount={0}
      onRequestDeleteSelected={vi.fn()}
      filterPanelOpen={false}
      setFilterPanelOpen={vi.fn()}
      searchQuery=""
      setSearchQuery={vi.fn()}
      {...handlers}
      {...overrides}
    />,
  )
  return handlers
}

// FFP-001: Narrow layouts must expose keyboard-accessible triggers that open
// the collections, nested-traversal, and filter drawers.
describe("WorkspaceControllerDeck drawer triggers", () => {
  it("hides drawer triggers on wide layouts", () => {
    renderDeck({ drawerMode: false })

    expect(screen.queryByRole("button", { name: "Open collections" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Open nested browser" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Open filters" })).toBeNull()
  })

  it("shows all three drawer triggers in drawer mode", () => {
    renderDeck({ drawerMode: true })

    expect(screen.getByRole("button", { name: "Open collections" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open nested browser" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open filters" })).toBeInTheDocument()
  })

  it("opens the matching drawer when a trigger is clicked", async () => {
    const user = userEvent.setup()
    const handlers = renderDeck({ drawerMode: true })

    await user.click(screen.getByRole("button", { name: "Open collections" }))
    await user.click(screen.getByRole("button", { name: "Open nested browser" }))
    await user.click(screen.getByRole("button", { name: "Open filters" }))

    expect(handlers.onOpenCollectionsDrawer).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenNestedDrawer).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenFiltersDrawer).toHaveBeenCalledTimes(1)
  })

  it("supports keyboard activation of the drawer triggers", async () => {
    const user = userEvent.setup()
    const handlers = renderDeck({ drawerMode: true })

    const collectionsTrigger = screen.getByRole("button", { name: "Open collections" })
    collectionsTrigger.focus()
    await user.keyboard("{Enter}")

    expect(handlers.onOpenCollectionsDrawer).toHaveBeenCalledTimes(1)
  })
})
