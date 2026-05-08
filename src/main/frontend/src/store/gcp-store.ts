import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { type StatusMessage } from "@/dto/firestore/FirestoreSchema"

export interface ProjectTab {
  id: string;
  projectId: string;
  databaseId: string;
  label: string;
}

export interface GcpState {
  credentialsFile: File | null;
  openTabs: ProjectTab[];
  activeTabId: string;
  authStatus: StatusMessage | null;

  setCredentialsFile: (file: File | null) => void;
  findTabByContext: (projectId: string, databaseId: string) => ProjectTab | undefined;
  updateTabContext: (tabId: string, projectId: string, databaseId: string) => void;
  addTab: (tab: ProjectTab) => void;
  removeTab: (tabId: string) => void;
  setActiveTabId: (tabId: string) => void;
  clearTabs: () => void;
  setAuthStatus: (status: StatusMessage | null) => void;
}

function normalizeDatabaseId(databaseId: string): string {
  return databaseId.trim() ? databaseId.trim() : "(default)"
}

function buildTab(projectId: string, databaseId: string): ProjectTab {
  const normalizedProjectId = projectId.trim()
  const normalizedDatabaseId = normalizeDatabaseId(databaseId)
  return {
    id: `${normalizedProjectId}:${normalizedDatabaseId}`,
    projectId: normalizedProjectId,
    databaseId: normalizedDatabaseId === "(default)" ? "" : normalizedDatabaseId,
    label: `${normalizedProjectId} / ${normalizedDatabaseId}`,
  }
}

const GcpStoreContext = createContext<GcpState | null>(null)

export function GcpStoreProvider({ children }: { children: ReactNode }) {
  const [credentialsFile, setCredentialsFile] = useState<File | null>(null)
  const [openTabs, setOpenTabs] = useState<ProjectTab[]>([])
  const [activeTabId, setActiveTabId] = useState("")
  const [authStatus, setAuthStatus] = useState<StatusMessage | null>(null)

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

      const nextTab = buildTab(projectId, databaseId)
      const nextTabs = previousTabs.map((tab) => (tab.id === tabId ? nextTab : tab))
      setActiveTabId((currentActiveTabId) => (currentActiveTabId === tabId ? nextTab.id : currentActiveTabId))
      return nextTabs
    })
  }, [])

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

  const value = useMemo<GcpState>(
    () => ({
      credentialsFile,
      openTabs,
      activeTabId,
      authStatus,
      setCredentialsFile,
      findTabByContext,
      updateTabContext,
      addTab,
      removeTab,
      setActiveTabId,
      clearTabs,
      setAuthStatus,
    }),
    [
      credentialsFile,
      openTabs,
      activeTabId,
      authStatus,
      findTabByContext,
      updateTabContext,
      addTab,
      removeTab,
      setActiveTabId,
      clearTabs,
      setAuthStatus,
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
