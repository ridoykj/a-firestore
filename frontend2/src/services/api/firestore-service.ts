import createAxiosInstance from "@/config/axios-config"
import type {
  FirestoreQueryRequest,
  NestedResponse,
  QueryResponse,
} from "@/dto/firestore/FirestoreSchema"
import { encodePath, extractApiMessage } from "@/view/pages/firestore/lib/firestore-utils"
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"
import { AxiosError } from "axios"

type FirestoreMutationError = Error
type FirestoreDocumentPayload = Record<string, unknown>

type CreateDocumentVariables = {
  collectionPath: string
  payload: FirestoreDocumentPayload
}

type UpdateDocumentVariables = {
  documentPath: string
  payload: FirestoreDocumentPayload
}

type ReplaceDocumentVariables = {
  documentPath: string
  payload: FirestoreDocumentPayload
}

type DeleteDocumentVariables = {
  documentPath: string
}

type LoadProjectsVariables = {
  credentialsFile: File
}

type LoadDatabasesVariables = {
  projectId: string
  credentialsFile: File
}

type InitFirestoreVariables = {
  projectId: string
  credentialsFile: File
  databaseId?: string
}

type FirestoreImpl = {
  getCollections: () => Promise<string[]>
  getNested: (path: string) => Promise<NestedResponse>
  runQuery: (request: FirestoreQueryRequest) => Promise<QueryResponse>
  createDocument: (collectionPath: string, payload: FirestoreDocumentPayload) => Promise<FirestoreDocumentPayload>
  updateDocument: (documentPath: string, payload: FirestoreDocumentPayload) => Promise<FirestoreDocumentPayload>
  replaceDocument: (documentPath: string, payload: FirestoreDocumentPayload) => Promise<FirestoreDocumentPayload>
  deleteDocument: (documentPath: string) => Promise<string>
  loadProjects: (credentialsFile: File) => Promise<string[]>
  loadDatabases: (projectId: string, credentialsFile: File) => Promise<string[]>
  initFirestore: (projectId: string, credentialsFile: File, databaseId?: string) => Promise<string>
  createDocumentMutation: UseMutationResult<
    FirestoreDocumentPayload,
    FirestoreMutationError,
    CreateDocumentVariables,
    unknown
  >
  updateDocumentMutation: UseMutationResult<
    FirestoreDocumentPayload,
    FirestoreMutationError,
    UpdateDocumentVariables,
    unknown
  >
  replaceDocumentMutation: UseMutationResult<
    FirestoreDocumentPayload,
    FirestoreMutationError,
    ReplaceDocumentVariables,
    unknown
  >
  deleteDocumentMutation: UseMutationResult<string, FirestoreMutationError, DeleteDocumentVariables, unknown>
  loadProjectsMutation: UseMutationResult<string[], FirestoreMutationError, LoadProjectsVariables, unknown>
  loadDatabasesMutation: UseMutationResult<string[], FirestoreMutationError, LoadDatabasesVariables, unknown>
  initFirestoreMutation: UseMutationResult<string, FirestoreMutationError, InitFirestoreVariables, unknown>
}

type FirestoreServiceApi = {
  getCollections: () => Promise<string[]>
  getNested: (path: string) => Promise<NestedResponse>
  runQuery: (request: FirestoreQueryRequest) => Promise<QueryResponse>
  createDocument: (collectionPath: string, payload: FirestoreDocumentPayload) => Promise<FirestoreDocumentPayload>
  updateDocument: (documentPath: string, payload: FirestoreDocumentPayload) => Promise<FirestoreDocumentPayload>
  replaceDocument: (documentPath: string, payload: FirestoreDocumentPayload) => Promise<FirestoreDocumentPayload>
  deleteDocument: (documentPath: string) => Promise<string>
  loadProjects: (credentialsFile: File) => Promise<string[]>
  loadDatabases: (projectId: string, credentialsFile: File) => Promise<string[]>
  initFirestore: (projectId: string, credentialsFile: File, databaseId?: string) => Promise<string>
}

const baseUrl: string = import.meta.env.VITE_BASE_URL || ""
const axiosInstance = createAxiosInstance(baseUrl)

const firestoreQueryKeys = {
  root: ["firestore"] as const,
  collections: () => [...firestoreQueryKeys.root, "collections"] as const,
  nested: (path: string) => [...firestoreQueryKeys.root, "nested", path] as const,
  query: (request: FirestoreQueryRequest) => [...firestoreQueryKeys.root, "query", request] as const,
  projects: (fileKey: string) => [...firestoreQueryKeys.root, "projects", fileKey] as const,
  databases: (projectId: string, fileKey: string) =>
    [...firestoreQueryKeys.root, "databases", projectId, fileKey] as const,
} as const

function toRequestError(error: unknown): Error {
  if (error instanceof AxiosError) {
    return new Error(extractApiMessage(error.response?.data ?? error.message))
  }
  if (error instanceof Error) {
    return error
  }
  return new Error("Request failed.")
}

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    const { data } = await call()
    return data
  } catch (error) {
    throw toRequestError(error)
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error(extractApiMessage(value))
  }
  return value.filter((item): item is string => typeof item === "string")
}

function buildQueryParams(requestData: FirestoreQueryRequest): URLSearchParams {
  const params = new URLSearchParams()
  params.set("path", requestData.path)
  params.set("page", String(Math.max(0, requestData.page)))
  params.set("limit", String(requestData.limit))
  params.set("orderDirection", requestData.orderDirection)

  if (requestData.orderField?.trim()) {
    params.set("orderField", requestData.orderField.trim())
  }

  for (const filter of requestData.filters) {
    if (!filter.field.trim()) {
      continue
    }
    params.append("whereField", filter.field.trim())
    params.append("whereOperator", filter.operator)
    params.append("whereValue", filter.value)
    params.append("whereType", filter.type)
  }

  return params
}

const firestoreApi: FirestoreServiceApi = {
  getCollections: () => request(() => axiosInstance.get("/api/collections")),

  getNested: (path) =>
    request(() => axiosInstance.get(`/api/workbench/nested?path=${encodeURIComponent(path)}`)),

  runQuery: (requestData) => {
    const params = buildQueryParams(requestData)
    return request(() => axiosInstance.get(`/api/workbench/query?${params.toString()}`))
  },

  createDocument: (collectionPath, payload) =>
    request(() => axiosInstance.post(`/api/collections/${encodePath(collectionPath)}`, payload)),

  updateDocument: (documentPath, payload) =>
    request(() => axiosInstance.put(`/api/collections/${encodePath(documentPath)}`, payload)),

  replaceDocument: (documentPath, payload) =>
    request(() => axiosInstance.post("/api/workbench/replace", { documentPath, payload })),

  deleteDocument: (documentPath) =>
    request(() => axiosInstance.delete(`/api/collections/${encodePath(documentPath)}`)),

  loadProjects: async (credentialsFile) => {
    const form = new FormData()
    form.append("file", credentialsFile)
    const response = await request<unknown>(() => axiosInstance.post("/api/gcp/projects", form))
    return toStringArray(response)
  },

  loadDatabases: async (projectId, credentialsFile) => {
    const form = new FormData()
    form.append("projectId", projectId)
    form.append("file", credentialsFile)
    const response = await request<unknown>(() => axiosInstance.post("/api/workbench/databases", form))
    return toStringArray(response)
  },

  initFirestore: (projectId, credentialsFile, databaseId) => {
    const form = new FormData()
    form.append("projectId", projectId)
    if (databaseId?.trim()) {
      form.append("databaseId", databaseId.trim())
    }
    form.append("file", credentialsFile)
    return request(() => axiosInstance.post("/api/firestore/init", form))
  },
}

export function useFirestoreService(): FirestoreImpl {
  const queryClient = useQueryClient()

  async function getCollections(): Promise<string[]> {
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.collections(),
      queryFn: firestoreApi.getCollections,
    })
  }

  async function getNested(path: string): Promise<NestedResponse> {
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.nested(path),
      queryFn: () => firestoreApi.getNested(path),
    })
  }

  async function runQuery(requestData: FirestoreQueryRequest): Promise<QueryResponse> {
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.query(requestData),
      queryFn: () => firestoreApi.runQuery(requestData),
    })
  }

  const createDocumentMutation = useMutation({
    mutationFn: ({ collectionPath, payload }: CreateDocumentVariables) =>
      firestoreApi.createDocument(collectionPath, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.collections() })
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.root })
    },
  })

  const updateDocumentMutation = useMutation({
    mutationFn: ({ documentPath, payload }: UpdateDocumentVariables) =>
      firestoreApi.updateDocument(documentPath, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.root })
    },
  })

  const replaceDocumentMutation = useMutation({
    mutationFn: ({ documentPath, payload }: ReplaceDocumentVariables) =>
      firestoreApi.replaceDocument(documentPath, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.root })
    },
  })

  const deleteDocumentMutation = useMutation({
    mutationFn: ({ documentPath }: DeleteDocumentVariables) => firestoreApi.deleteDocument(documentPath),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.collections() })
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.root })
    },
  })

  const loadProjectsMutation = useMutation({
    mutationFn: ({ credentialsFile }: LoadProjectsVariables) => firestoreApi.loadProjects(credentialsFile),
  })

  const loadDatabasesMutation = useMutation({
    mutationFn: ({ projectId, credentialsFile }: LoadDatabasesVariables) =>
      firestoreApi.loadDatabases(projectId, credentialsFile),
  })

  const initFirestoreMutation = useMutation({
    mutationFn: ({ projectId, credentialsFile, databaseId }: InitFirestoreVariables) =>
      firestoreApi.initFirestore(projectId, credentialsFile, databaseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.collections() })
    },
  })

  async function createDocument(collectionPath: string, payload: FirestoreDocumentPayload) {
    return createDocumentMutation.mutateAsync({ collectionPath, payload })
  }

  async function updateDocument(documentPath: string, payload: FirestoreDocumentPayload) {
    return updateDocumentMutation.mutateAsync({ documentPath, payload })
  }

  async function replaceDocument(documentPath: string, payload: FirestoreDocumentPayload) {
    return replaceDocumentMutation.mutateAsync({ documentPath, payload })
  }

  async function deleteDocument(documentPath: string) {
    return deleteDocumentMutation.mutateAsync({ documentPath })
  }

  async function loadProjects(credentialsFile: File) {
    const cacheKey = `${credentialsFile.name}-${credentialsFile.lastModified}`
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.projects(cacheKey),
      queryFn: () => loadProjectsMutation.mutateAsync({ credentialsFile }),
    })
  }

  async function loadDatabases(projectId: string, credentialsFile: File) {
    const cacheKey = `${credentialsFile.name}-${credentialsFile.lastModified}`
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.databases(projectId, cacheKey),
      queryFn: () => loadDatabasesMutation.mutateAsync({ projectId, credentialsFile }),
    })
  }

  async function initFirestore(projectId: string, credentialsFile: File, databaseId?: string) {
    return initFirestoreMutation.mutateAsync({ projectId, credentialsFile, databaseId })
  }

  return {
    getCollections,
    getNested,
    runQuery,
    createDocument,
    updateDocument,
    replaceDocument,
    deleteDocument,
    loadProjects,
    loadDatabases,
    initFirestore,
    createDocumentMutation,
    updateDocumentMutation,
    replaceDocumentMutation,
    deleteDocumentMutation,
    loadProjectsMutation,
    loadDatabasesMutation,
    initFirestoreMutation,
  }
}

export const firestoreService = firestoreApi
