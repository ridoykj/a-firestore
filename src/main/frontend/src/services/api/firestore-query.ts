import { firestoreService } from "@/services/api/firestore-service"
import { useMutation, useQuery } from "@tanstack/react-query"

export const firestoreQueryKeys = {
  root: ["firestore"] as const,
  projects: (credentialsKey: string) => [...firestoreQueryKeys.root, "projects", credentialsKey] as const,
  databases: (projectId: string, credentialsKey: string) =>
    [...firestoreQueryKeys.root, "databases", projectId, credentialsKey] as const,
} as const

export function getCredentialsCacheKey(credentialsFile: File | null): string {
  if (!credentialsFile) {
    return ""
  }
  return `${credentialsFile.name}-${credentialsFile.lastModified}-${credentialsFile.size}`
}

type ProjectsQueryOptions = {
  credentialsFile: File | null
  enabled?: boolean
}

type DatabasesQueryOptions = {
  projectId: string
  credentialsFile: File | null
  enabled?: boolean
}

export function useFirestoreProjectsQuery({ credentialsFile, enabled = true }: ProjectsQueryOptions) {
  const credentialsKey = getCredentialsCacheKey(credentialsFile)
  return useQuery({
    queryKey: firestoreQueryKeys.projects(credentialsKey),
    enabled: enabled && Boolean(credentialsFile),
    queryFn: () => firestoreService.loadProjects(credentialsFile as File),
    staleTime: 5 * 60 * 1000,
  })
}

export function useFirestoreDatabasesQuery({
  projectId,
  credentialsFile,
  enabled = true,
}: DatabasesQueryOptions) {
  const credentialsKey = getCredentialsCacheKey(credentialsFile)
  const normalizedProjectId = projectId.trim()
  return useQuery({
    queryKey: firestoreQueryKeys.databases(normalizedProjectId, credentialsKey),
    enabled: enabled && Boolean(credentialsFile) && Boolean(normalizedProjectId),
    queryFn: () => firestoreService.loadDatabases(normalizedProjectId, credentialsFile as File),
    staleTime: 5 * 60 * 1000,
  })
}

export function useFirestoreInitMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      credentialsFile,
      databaseId,
    }: {
      projectId: string
      credentialsFile: File
      databaseId?: string
    }) => firestoreService.initFirestore(projectId, credentialsFile, databaseId),
  })
}

export function useFirestoreTransferInitMutation() {
  return useMutation({
    mutationFn: (file: File) => firestoreService.initTransfer(file),
  })
}

export function useFirestoreTransferInitSourceMutation() {
  return useMutation({
    mutationFn: (args: { projectId: string; databaseId: string; serviceAccountJson: string }) =>
      firestoreService.initSourceDb(args.projectId, args.databaseId, args.serviceAccountJson),
  })
}

export function useFirestoreTransferDeepCopyMutation() {
  return useMutation({
    mutationFn: (payload: {
      sourceProjectId: string
      sourceDatabaseId: string
      sourcePaths: string[]
      targetProjectId: string
      targetDatabaseId: string
      targetBasePath: string
      conflictResolution: "MERGE" | "OVERWRITE"
    }) => firestoreService.deepCopy(payload),
  })
}
