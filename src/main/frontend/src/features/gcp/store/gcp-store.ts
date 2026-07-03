import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type ConnectionMode = "emulator" | "service-account"

export interface ProjectTab {
  id: string;
  projectId: string;
  databaseId: string;
  label: string;
  connectionMode: ConnectionMode;
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
}

function normalizeDatabaseId(databaseId: string): string {
  return databaseId.trim() ? databaseId.trim() : "(default)"
}

function detectConnectionMode(credentialsFile: File | null, projectId: string): ConnectionMode {
  // If no credentials file is provided, assume emulator mode
  if (!credentialsFile) {
    return "emulator"
  }
  
  // Check if the project ID looks like an emulator identifier
  const emulatorPatterns = ["localhost", "127.0.0.1", "test-project"]
  if (emulatorPatterns.some(pattern => projectId.toLowerCase().includes(pattern))) {
    return "emulator"
  }
  
  // Default to service-account mode when credentials are present
  return "service-account"
}

function buildTab(projectId: string, databaseId: string, credentialsFile: File | null): ProjectTab {
  const normalizedProjectId = projectId.trim()
  const normalizedDatabaseId = normalizeDatabaseId(databaseId)
  
  // FFP-003: Detect connection mode based on credentials and project ID
  const connectionMode = detectConnectionMode(credentialsFile, normalizedProjectId)
  
  return {
    id: `${normalizedProjectId}:${normalizedDatabaseId}`,
    projectId: normalizedProjectId,
    databaseId: normalizedDatabaseId === "(default)" ? "" : normalizedDatabaseId,
    label: `${normalizedProjectId} / ${normalizedDatabaseId}`,
    connectionMode,
  }
}

const GcpStoreContext = createContext<GcpState | null>(null)

export function GcpStoreProvider({ children }: { children: ReactNode }) {
  const [credentialsFile, setCredentialsFile] = useState<File | null>(null)
  const [openTabs, setOpenTabs] = useState<ProjectTab[]>([])
  const [activeTabId, setActiveTabId] = useState("")

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

      // FFP-003: Pass credentialsFile to detect connection mode
      const nextTab = buildTab(projectId, databaseId, credentialsFile)
      const nextTabs = previousTabs.map((tab) => (tab.id === tabId ? nextTab : tab))
      setActiveTabId((currentActiveTabId) => (currentActiveTabId === tabId ? nextTab.id : currentActiveTabId))
      return nextTabs
    })
  }, [credentialsFile])

  const addTab = useCallback((tab: ProjectTab) => {
    setOpenTabs((previousTabs) => {
      const existing = previousTabs.find((item) => item.id === tab.id)
      if (existing) {
        return previousTabs.map((item) => (item.id === tab.id ? tab : item))
      }
      return [...previousTabs, tab]
    })
    setActiveTabId(tab.id)
  }, [])

  const removeTab = useCallback((tabId: string) => {
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
    setOpenTabs([])
    setActiveTabId("")
  }, [])

  // FFP-003: Disconnect the active tab (clears connection state)
  const disconnectActiveTab = useCallback(() => {
    if (!activeTabId) return
    
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
