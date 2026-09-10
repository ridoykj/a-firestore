import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { STORAGE_PREFIX, readJson, writeJson } from "@/shared/lib/persistent-storage"
import { clearQueryState } from "@/features/firestore/api/query-state-storage"
import {
  normalizeDatabaseId,
  tabIdFor,
  toStoredDatabaseId,
} from "@/features/firestore/api/firestore-utils"

export type ConnectionMode = "emulator" | "service-account"

export interface ProjectTab {
  id: string;
  projectId: string;
  databaseId: string;
  label: string;
  connectionMode: ConnectionMode;
  /** FFP-205: present for emulator tabs; the host clients connect to (no credentials). */
  emulatorHost?: string;
}

export interface GcpState {
  credentialsFile: File | null;
  openTabs: ProjectTab[];
  activeTabId: string;
  // FFP-003: Real connection status tracking
  isInitialized: boolean;
  activeConnectionMode: ConnectionMode | null;

  setCredentialsFile: (file: File | null) => void;
  findTabByContext: (projectId: string, databaseId: string) => ProjectTab | undefined;
  updateTabContext: (tabId: string, projectId: string, databaseId: string) => void;
  addTab: (tab: ProjectTab) => void;
  removeTab: (tabId: string) => void;
  setActiveTabId: (tabId: string) => void;
  clearTabs: () => void;
  // FFP-003: Disconnect lifecycle
  disconnectActiveTab: () => void;
  // FFP-201: Reattachment gate. A restored tab is not "attached" until its backend client is
  // re-initialized in this session; requests must be blocked until then.
  isTabAttached: (tabId: string) => boolean;
  markTabAttached: (tabId: string) => void;
}

// FFP-201: Persisted workspace shape (non-secret only). ProjectTab carries no credentials.
const WORKSPACE_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.v1`

type PersistedWorkspace = {
  tabs: ProjectTab[]
  activeTabId: string
}

function isConnectionMode(value: unknown): value is ConnectionMode {
  return value === "emulator" || value === "service-account"
}

function isProjectTab(value: unknown): value is ProjectTab {
  if (!value || typeof value !== "object") {
    return false
  }
  const tab = value as Record<string, unknown>
  return (
    typeof tab.id === "string" &&
    typeof tab.projectId === "string" &&
    typeof tab.databaseId === "string" &&
    typeof tab.label === "string" &&
    isConnectionMode(tab.connectionMode) &&
    (tab.emulatorHost === undefined || typeof tab.emulatorHost === "string")
  )
}

function isPersistedWorkspace(value: unknown): value is PersistedWorkspace {
  if (!value || typeof value !== "object") {
    return false
  }
  const workspace = value as Record<string, unknown>
  return (
    Array.isArray(workspace.tabs) &&
    workspace.tabs.every(isProjectTab) &&
    typeof workspace.activeTabId === "string"
  )
}

function loadPersistedWorkspace(): PersistedWorkspace {
  return readJson<PersistedWorkspace>(
    WORKSPACE_STORAGE_KEY,
    isPersistedWorkspace,
    { tabs: [], activeTabId: "" },
  )
}

// DUP-004: id, label, and stored databaseId all derive from the shared normalization, so a tab's
// requests and its persisted state can never key to different connections.
function buildTab(projectId: string, databaseId: string, connectionMode: ConnectionMode): ProjectTab {
  const normalizedProjectId = projectId.trim()
  const normalizedDatabaseId = normalizeDatabaseId(databaseId)

  return {
    id: tabIdFor(normalizedProjectId, normalizedDatabaseId),
    projectId: normalizedProjectId,
    databaseId: toStoredDatabaseId(normalizedDatabaseId),
    label: `${normalizedProjectId} / ${normalizedDatabaseId}`,
    connectionMode,
  }
}

const GcpStoreContext = createContext<GcpState | null>(null)

export function GcpStoreProvider({ children }: { children: ReactNode }) {
  const [credentialsFile, setCredentialsFile] = useState<File | null>(null)
  // FFP-201: hydrate tabs from localStorage so a browser refresh restores the workspace.
  const persistedWorkspace = useMemo(loadPersistedWorkspace, [])
  const [openTabs, setOpenTabs] = useState<ProjectTab[]>(persistedWorkspace.tabs)
  const [activeTabId, setActiveTabId] = useState(persistedWorkspace.activeTabId)
  // FFP-201: which tabs have a live backend client this session. Not persisted, so every tab
  // restored from storage starts detached and must be reattached before it can issue requests.
  const attachedTabIdsRef = useRef<Set<string>>(new Set())
  const [attachedVersion, setAttachedVersion] = useState(0)

  // FFP-201: write the (non-secret) tab list through to storage on every change.
  useEffect(() => {
    writeJson<PersistedWorkspace>(WORKSPACE_STORAGE_KEY, { tabs: openTabs, activeTabId })
  }, [openTabs, activeTabId])

  const markTabAttached = useCallback((tabId: string) => {
    if (!tabId || attachedTabIdsRef.current.has(tabId)) {
      return
    }
    attachedTabIdsRef.current.add(tabId)
    setAttachedVersion((version) => version + 1)
  }, [])

  const isTabAttached = useCallback(
    (tabId: string) => attachedTabIdsRef.current.has(tabId),
    // attachedVersion forces consumers to re-read after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachedVersion],
  )

  const findTabByContext = useCallback(
    (projectId: string, databaseId: string) => {
      const targetProjectId = projectId.trim()
      const targetDatabaseId = normalizeDatabaseId(databaseId)
      return openTabs.find((tab) => tab.id === `${targetProjectId}:${targetDatabaseId}`)
    },
    [openTabs],
  )

  const updateTabContext = useCallback((tabId: string, projectId: string, databaseId: string) => {
    setOpenTabs((previousTabs) => {
      const existingTab = previousTabs.find((tab) => tab.id === tabId)
      if (!existingTab) {
        return previousTabs
      }

      // Preserve the tab's connection mode (and emulator host) across a context switch.
      const nextTab: ProjectTab = {
        ...buildTab(projectId, databaseId, existingTab.connectionMode),
        emulatorHost: existingTab.emulatorHost,
      }
      const nextTabs = previousTabs.map((tab) => (tab.id === tabId ? nextTab : tab))
      // The new context was just re-initialized by the caller, so treat it as attached.
      markTabAttached(nextTab.id)
      setActiveTabId((currentActiveTabId) => (currentActiveTabId === tabId ? nextTab.id : currentActiveTabId))
      return nextTabs
    })
  }, [markTabAttached])

  const addTab = useCallback((tab: ProjectTab) => {
    // Adding a tab always follows a successful backend init, so mark it attached.
    markTabAttached(tab.id)
    setOpenTabs((previousTabs) => {
      const existing = previousTabs.find((item) => item.id === tab.id)
      if (existing) {
        return previousTabs.map((item) => (item.id === tab.id ? tab : item))
      }
      return [...previousTabs, tab]
    })
    setActiveTabId(tab.id)
  }, [markTabAttached])

  const removeTab = useCallback((tabId: string) => {
    attachedTabIdsRef.current.delete(tabId)
    clearQueryState(tabId)
    setOpenTabs((previousTabs) => {
      const nextTabs = previousTabs.filter((tab) => tab.id !== tabId)
      setActiveTabId((currentActiveTabId) => {
        if (nextTabs.length === 0) {
          return ""
        }
        if (currentActiveTabId !== tabId) {
          return currentActiveTabId
        }
        return nextTabs[nextTabs.length - 1]?.id ?? ""
      })
      return nextTabs
    })
  }, [])

  const clearTabs = useCallback(() => {
    attachedTabIdsRef.current.clear()
    setOpenTabs([])
    setActiveTabId("")
  }, [])

  // FFP-003: Disconnect the active tab (clears connection state)
  const disconnectActiveTab = useCallback(() => {
    if (!activeTabId) return

    attachedTabIdsRef.current.delete(activeTabId)
    clearQueryState(activeTabId)
    setOpenTabs((previousTabs) => {
      const nextTabs = previousTabs.filter((tab) => tab.id !== activeTabId)
      setActiveTabId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : "")
      return nextTabs
    })

    // Clear credentials file on disconnect
    setCredentialsFile(null)
  }, [activeTabId])

  const value = useMemo<GcpState>(
    () => ({
      credentialsFile,
      openTabs,
      activeTabId,
      isInitialized: openTabs.length > 0,
      activeConnectionMode: openTabs.length > 0 ? (openTabs.find(t => t.id === activeTabId) || openTabs[0])?.connectionMode ?? null : null,
      setCredentialsFile,
      findTabByContext,
      updateTabContext,
      addTab,
      removeTab,
      setActiveTabId,
      clearTabs,
      disconnectActiveTab,
      isTabAttached,
      markTabAttached,
    }),
    [
      credentialsFile,
      openTabs,
      activeTabId,
      findTabByContext,
      updateTabContext,
      addTab,
      removeTab,
      setActiveTabId,
      clearTabs,
      disconnectActiveTab,
      isTabAttached,
      markTabAttached,
    ],
  )

  return createElement(GcpStoreContext.Provider, { value }, children)
}

export function useGcpStore(): GcpState {
  const context = useContext(GcpStoreContext)
  if (!context) {
    throw new Error("useGcpStore must be used within a GcpStoreProvider.")
  }
  return context
}
