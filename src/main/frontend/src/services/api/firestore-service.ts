import createAxiosInstance from "@/config/axios-config"
import type {
  FirestoreDocument,
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
type FirestoreDocumentDetails = {
  id: string
  fields: Record<string, unknown>
  collections: string[]
}

export type FirestoreContext = {
  projectId: string
  databaseId?: string
}

type CreateDocumentVariables = {
  context: FirestoreContext
  collectionPath: string
  docId?: string
  payload: FirestoreDocumentPayload
}

type UpdateDocumentVariables = {
  context: FirestoreContext
  documentPath: string
  payload: FirestoreDocumentPayload
}

type ReplaceDocumentVariables = {
  context: FirestoreContext
  documentPath: string
  payload: FirestoreDocumentPayload
}

type DeleteDocumentVariables = {
  context: FirestoreContext
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
  getCollections: (context: FirestoreContext) => Promise<string[]>
  getCollectionDocuments: (
    context: FirestoreContext,
    collectionPath: string,
  ) => Promise<FirestoreDocument[]>
  getDocumentDetails: (
    context: FirestoreContext,
    documentPath: string,
  ) => Promise<FirestoreDocumentDetails>
  getNested: (
    context: FirestoreContext,
    path: string,
    limit?: number,
    cursor?: string | null,
    idFilter?: string,
  ) => Promise<NestedResponse>
  runQuery: (context: FirestoreContext, request: FirestoreQueryRequest) => Promise<QueryResponse>
  createDocument: (
    context: FirestoreContext,
    collectionPath: string,
    payload: FirestoreDocumentPayload,
    docId?: string,
  ) => Promise<FirestoreDocumentPayload>
  updateDocument: (
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) => Promise<FirestoreDocumentPayload>
  replaceDocument: (
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) => Promise<FirestoreDocumentPayload>
  deleteDocument: (context: FirestoreContext, documentPath: string) => Promise<string>
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
  getCollections: (context: FirestoreContext) => Promise<string[]>
  getCollectionDocuments: (
    context: FirestoreContext,
    collectionPath: string,
  ) => Promise<FirestoreDocument[]>
  getDocumentDetails: (
    context: FirestoreContext,
    documentPath: string,
  ) => Promise<FirestoreDocumentDetails>
  getNested: (
    context: FirestoreContext,
    path: string,
    limit?: number,
    cursor?: string | null,
    idFilter?: string,
  ) => Promise<NestedResponse>
  runQuery: (context: FirestoreContext, request: FirestoreQueryRequest) => Promise<QueryResponse>
  createDocument: (
    context: FirestoreContext,
    collectionPath: string,
    payload: FirestoreDocumentPayload,
    docId?: string,
  ) => Promise<FirestoreDocumentPayload>
  updateDocument: (
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) => Promise<FirestoreDocumentPayload>
  replaceDocument: (
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) => Promise<FirestoreDocumentPayload>
  deleteDocument: (context: FirestoreContext, documentPath: string) => Promise<string>
  loadProjects: (credentialsFile: File) => Promise<string[]>
  loadDatabases: (projectId: string, credentialsFile: File) => Promise<string[]>
  initFirestore: (projectId: string, credentialsFile: File, databaseId?: string) => Promise<string>
}

const baseUrl: string = import.meta.env.VITE_BASE_URL || ""
const axiosInstance = createAxiosInstance(baseUrl)

const firestoreQueryKeys = {
  root: ["firestore"] as const,
  contextRoot: (context: FirestoreContext) =>
    [...firestoreQueryKeys.root, contextKey(context)] as const,
  collections: (context: FirestoreContext) =>
    [...firestoreQueryKeys.contextRoot(context), "collections"] as const,
  nested: (
    context: FirestoreContext,
    path: string,
    limit: number,
    cursor: string | null,
    idFilter: string,
  ) => [...firestoreQueryKeys.contextRoot(context), "nested", path, limit, cursor, idFilter] as const,
  query: (context: FirestoreContext, request: FirestoreQueryRequest) =>
    [...firestoreQueryKeys.contextRoot(context), "query", request] as const,
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

function toDocumentArray(value: unknown): FirestoreDocument[] {
  if (!Array.isArray(value)) {
    throw new Error(extractApiMessage(value))
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => item as FirestoreDocument)
}

function toDocumentDetails(value: unknown): FirestoreDocumentDetails {
  if (!value || typeof value !== "object") {
    throw new Error(extractApiMessage(value))
  }

  const payload = value as Record<string, unknown>
  const id = typeof payload.id === "string" ? payload.id : ""

  const rawFields = payload.fields
  const fields =
    rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)
      ? (rawFields as Record<string, unknown>)
      : {}

  const collections = Array.isArray(payload.collections)
    ? payload.collections.filter((item): item is string => typeof item === "string")
    : []

  return { id, fields, collections }
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

function normalizedDatabaseId(databaseId?: string): string {
  if (!databaseId || !databaseId.trim()) {
    return "(default)"
  }
  return databaseId.trim()
}

function contextKey(context: FirestoreContext): string {
  return `${context.projectId}::${normalizedDatabaseId(context.databaseId)}`
}

function firestoreHeaders(context: FirestoreContext): Record<string, string> {
  return {
    "X-Project-Id": context.projectId,
    "X-Database-Id": normalizedDatabaseId(context.databaseId),
  }
}

const firestoreApi: FirestoreServiceApi = {
  getCollections: (context) =>
    request(() => axiosInstance.get("/api/collections", { headers: firestoreHeaders(context) })),

  getCollectionDocuments: async (context, collectionPath) => {
    const response = await request<unknown>(() =>
      axiosInstance.get(`/api/collections/${encodePath(collectionPath)}`, {
        headers: firestoreHeaders(context),
      }),
    )
    return toDocumentArray(response)
  },

  getDocumentDetails: async (context, documentPath) => {
    const response = await request<unknown>(() =>
      axiosInstance.get(`/api/collections/${encodePath(documentPath)}`, {
        headers: firestoreHeaders(context),
      }),
    )
    return toDocumentDetails(response)
  },

  getNested: (context, path, limit = 25, cursor = null, idFilter = "") => {
    const params = new URLSearchParams({
      path,
      limit: String(Math.max(1, limit)),
    })
    if (cursor && cursor.trim()) {
      params.set("cursor", cursor.trim())
    }
    if (idFilter.trim()) {
      params.set("idFilter", idFilter.trim())
    }

    return request(() =>
      axiosInstance.get(`/api/workbench/nested?${params.toString()}`, {
        headers: firestoreHeaders(context),
      }),
    )
  },

  runQuery: (context, requestData) => {
    const params = buildQueryParams(requestData)
    return request(() =>
      axiosInstance.get(`/api/workbench/query?${params.toString()}`, {
        headers: firestoreHeaders(context),
      }),
    )
  },

  createDocument: (context, collectionPath, payload, docId) =>
    request(() =>
      axiosInstance.post(`/api/collections/${encodePath(collectionPath)}`, payload, {
        headers: firestoreHeaders(context),
        params: docId?.trim() ? { docId: docId.trim() } : undefined,
      }),
    ),

  updateDocument: (context, documentPath, payload) =>
    request(() =>
      axiosInstance.put(`/api/collections/${encodePath(documentPath)}`, payload, {
        headers: firestoreHeaders(context),
      }),
    ),

  replaceDocument: (context, documentPath, payload) =>
    request(() =>
      axiosInstance.post(
        "/api/workbench/replace",
        { documentPath, payload },
        { headers: firestoreHeaders(context) },
      ),
    ),

  deleteDocument: (context, documentPath) =>
    request(() =>
      axiosInstance.delete(`/api/collections/${encodePath(documentPath)}`, {
        headers: firestoreHeaders(context),
      }),
    ),

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

  async function getCollections(context: FirestoreContext): Promise<string[]> {
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.collections(context),
      queryFn: () => firestoreApi.getCollections(context),
    })
  }

  async function getCollectionDocuments(
    context: FirestoreContext,
    collectionPath: string,
  ): Promise<FirestoreDocument[]> {
    return queryClient.fetchQuery({
      queryKey: [...firestoreQueryKeys.contextRoot(context), "collection-documents", collectionPath],
      queryFn: () => firestoreApi.getCollectionDocuments(context, collectionPath),
    })
  }

  async function getDocumentDetails(
    context: FirestoreContext,
    documentPath: string,
  ): Promise<FirestoreDocumentDetails> {
    return queryClient.fetchQuery({
      queryKey: [...firestoreQueryKeys.contextRoot(context), "document", documentPath],
      queryFn: () => firestoreApi.getDocumentDetails(context, documentPath),
    })
  }

  async function getNested(
    context: FirestoreContext,
    path: string,
    limit = 25,
    cursor: string | null = null,
    idFilter = "",
  ): Promise<NestedResponse> {
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.nested(context, path, limit, cursor, idFilter),
      queryFn: () => firestoreApi.getNested(context, path, limit, cursor, idFilter),
    })
  }

  async function runQuery(context: FirestoreContext, requestData: FirestoreQueryRequest): Promise<QueryResponse> {
    return queryClient.fetchQuery({
      queryKey: firestoreQueryKeys.query(context, requestData),
      queryFn: () => firestoreApi.runQuery(context, requestData),
    })
  }

  const createDocumentMutation = useMutation({
    mutationFn: ({ context, collectionPath, docId, payload }: CreateDocumentVariables) =>
      firestoreApi.createDocument(context, collectionPath, payload, docId),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.contextRoot(variables.context) })
    },
  })

  const updateDocumentMutation = useMutation({
    mutationFn: ({ context, documentPath, payload }: UpdateDocumentVariables) =>
      firestoreApi.updateDocument(context, documentPath, payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.contextRoot(variables.context) })
    },
  })

  const replaceDocumentMutation = useMutation({
    mutationFn: ({ context, documentPath, payload }: ReplaceDocumentVariables) =>
      firestoreApi.replaceDocument(context, documentPath, payload),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.contextRoot(variables.context) })
    },
  })

  const deleteDocumentMutation = useMutation({
    mutationFn: ({ context, documentPath }: DeleteDocumentVariables) =>
      firestoreApi.deleteDocument(context, documentPath),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: firestoreQueryKeys.contextRoot(variables.context) })
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
  })

  async function createDocument(
    context: FirestoreContext,
    collectionPath: string,
    payload: FirestoreDocumentPayload,
    docId?: string,
  ) {
    return createDocumentMutation.mutateAsync({ context, collectionPath, docId, payload })
  }

  async function updateDocument(
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) {
    return updateDocumentMutation.mutateAsync({ context, documentPath, payload })
  }

  async function replaceDocument(
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) {
    return replaceDocumentMutation.mutateAsync({ context, documentPath, payload })
  }

  async function deleteDocument(context: FirestoreContext, documentPath: string) {
    return deleteDocumentMutation.mutateAsync({ context, documentPath })
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
    getCollectionDocuments,
    getDocumentDetails,
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
