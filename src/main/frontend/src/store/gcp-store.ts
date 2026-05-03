import { create } from 'zustand';
import { type StatusMessage } from '@/dto/firestore/FirestoreSchema';

export interface GcpState {
  credentialsFile: File | null;
  projects: string[];
  selectedProject: string;
  databases: string[];
  selectedDatabase: string;
  authenticated: boolean;
  authStatus: StatusMessage | null;

  setCredentialsFile: (file: File | null) => void;
  setProjects: (projects: string[]) => void;
  setSelectedProject: (project: string) => void;
  setDatabases: (databases: string[]) => void;
  setSelectedDatabase: (database: string) => void;
  setAuthenticated: (status: boolean) => void;
  setAuthStatus: (status: StatusMessage | null) => void;
}

export const useGcpStore = create<GcpState>((set) => ({
  credentialsFile: null,
  projects: [],
  selectedProject: '',
  databases: [],
  selectedDatabase: '',
  authenticated: false,
  authStatus: null,

  setCredentialsFile: (credentialsFile) => set({ credentialsFile }),
  setProjects: (projects) => set({ projects }),
  setSelectedProject: (selectedProject) => set({ selectedProject }),
  setDatabases: (databases) => set({ databases }),
  setSelectedDatabase: (selectedDatabase) => set({ selectedDatabase }),
  setAuthenticated: (authenticated) => set({ authenticated }),
  setAuthStatus: (authStatus) => set({ authStatus }),
}));
