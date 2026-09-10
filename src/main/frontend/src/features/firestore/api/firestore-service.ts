import createAxiosInstance from "@/shared/api/axiosClient"
import type {
  BulkDeleteResponse,
  BulkEditRequest,
  BulkEditResponse,
  DocumentWriteRequest,
  FirestoreDocument,
  FirestoreQueryRequest,
  NestedResponse,
  QueryResponse,
} from "@/features/firestore/schemas/FirestoreSchema"
import {
  contextKeyFor,
  encodePath,
  extractApiMessage,
  firestoreContextHeaders,
  mapDocumentDtoToFirestoreDocument,
} from "@/features/firestore/api/firestore-utils"
import {
  normalizeFirestoreFields,
  unwrapFirestoreFields,
  type FirestoreWireValue,
} from "@/features/firestore/api/firestore-value-utils"
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"
import { AxiosError } from "axios"

type FirestoreMutationError = Error
type FirestoreDocumentPayload = Record<string, unknown>

export type FirestoreDocumentDetails = {
  id: string
  path: string
  fields: Record<string, unknown>
  typedFields: Record<string, FirestoreWireValue>
  collections: string[]
  createTime: string | null
  updateTime: string | null
}

/**
 * FFP-104: Raised when a write or delete fails its update-time precondition (HTTP 409).
 * Carries the latest server document so the UI can offer reload/compare/overwrite.
 */
export class FirestoreConflictError extends Error {
  readonly latestDocument: FirestoreDocumentDetails | null

  constructor(message: string, latestDocument: FirestoreDocumentDetails | null) {
    super(message)
    this.name = "FirestoreConflictError"
    this.latestDocument = latestDocument
  }
}

/**
 * FFP-203: Raised when a query needs a Firestore composite index. Carries the create-index URL
 * (when Firestore provided one) so the UI can offer an actionable link.
 */
export class FirestoreIndexError extends Error {
  readonly indexUrl: string | null

  constructor(message: string, indexUrl: string | null) {
    super(message)
    this.name = "FirestoreIndexError"
    this.indexUrl = indexUrl
  }
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

type WriteDocumentVariables = {
  context: FirestoreContext
  documentPath: string
  writeRequest: DocumentWriteRequest
}

type ReplaceDocumentVariables = {
  context: FirestoreContext
  documentPath: string
  payload: FirestoreDocumentPayload
}

type DeleteDocumentVariables = {
  context: FirestoreContext
  documentPath: string
  expectedUpdateTime?: string | null
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
  writeDocument: (
    context: FirestoreContext,
    documentPath: string,
    writeRequest: DocumentWriteRequest,
  ) => Promise<FirestoreDocumentDetails>
  replaceDocument: (
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) => Promise<FirestoreDocumentPayload>
  deleteDocument: (
    context: FirestoreContext,
    documentPath: string,
    expectedUpdateTime?: string | null,
  ) => Promise<string>
  bulkDeleteDocuments: (context: FirestoreContext, paths: string[]) => Promise<BulkDeleteResponse>
  loadProjects: (credentialsFile: File) => Promise<string[]>
  loadDatabases: (projectId: string, credentialsFile: File) => Promise<string[]>
  initFirestore: (projectId: string, credentialsFile: File, databaseId?: string) => Promise<string>
  createDocumentMutation: UseMutationResult<
    FirestoreDocumentPayload,
    FirestoreMutationError,
    CreateDocumentVariables,
    unknown
  >
  writeDocumentMutation: UseMutationResult<
    FirestoreDocumentDetails,
    FirestoreMutationError,
    WriteDocumentVariables,
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

  initTransfer: (file: File) => Promise<{ projectId: string; databases: string[]; serviceAccountJson: string }>
  initSourceDb: (projectId: string, databaseId: string, serviceAccountJson: string) => Promise<unknown>
  deepCopy: (payload: {
    sourceProjectId: string
    sourceDatabaseId: string
    sourcePaths: string[]
    targetProjectId: string
    targetDatabaseId: string
    targetBasePath: string
    conflictResolution: "MERGE" | "OVERWRITE"
  }) => Promise<{ success: boolean; copiedDocuments: number }>
}

/** FFP-304: a typed backup artifact. */
export type BackupArtifact = {
  formatVersion: number
  manifest: { path: string; kind: string; exportedAt: string; documentCount: number }
  documents: Array<{ id: string; path: string; fields: Record<string, unknown> }>
}

/** FFP-304/FFP-305: a job progress snapshot. */
export type JobSnapshot = {
  jobId: string
  type: string
  status: string
  committed: number
  failed: number
  total: number
  message: string
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
  // FFP-302: bounded collection sample (typed) for the schema profiler.
  sampleCollection: (
    context: FirestoreContext,
    collectionPath: string,
    limit?: number,
  ) => Promise<FirestoreDocument[]>
  createDocument: (
    context: FirestoreContext,
    collectionPath: string,
    payload: FirestoreDocumentPayload,
    docId?: string,
  ) => Promise<FirestoreDocumentPayload>
  writeDocument: (
    context: FirestoreContext,
    documentPath: string,
    writeRequest: DocumentWriteRequest,
  ) => Promise<FirestoreDocumentDetails>
  replaceDocument: (
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) => Promise<FirestoreDocumentPayload>
  deleteDocument: (
    context: FirestoreContext,
    documentPath: string,
    expectedUpdateTime?: string | null,
  ) => Promise<string>
  bulkDeleteDocuments: (context: FirestoreContext, paths: string[]) => Promise<BulkDeleteResponse>
  // FFP-303: previewable bulk edit (dry-run + execute).
  bulkEditDocuments: (
    context: FirestoreContext,
    request: BulkEditRequest,
  ) => Promise<BulkEditResponse>
  loadProjects: (credentialsFile: File) => Promise<string[]>
  loadDatabases: (projectId: string, credentialsFile: File) => Promise<string[]>
  initFirestore: (projectId: string, credentialsFile: File, databaseId?: string) => Promise<string>
  // FFP-205: credential-free emulator connection.
  initEmulator: (projectId: string, databaseId: string, emulatorHost: string) => Promise<string>

  // FFP-003: Connection lifecycle methods
  getConnectionStatus: () => Promise<{ status: string; projectId?: string; databaseId?: string }>
  disconnectConnection: (projectId: string, databaseId?: string) => Promise<string>
  disconnectAllConnections: () => Promise<string>

  initTransfer: (file: File) => Promise<{ projectId: string; databases: string[]; serviceAccountJson: string }>
  initSourceDb: (projectId: string, databaseId: string, serviceAccountJson: string) => Promise<unknown>
  deepCopy: (payload: {
    sourceProjectId: string
    sourceDatabaseId: string
    sourcePaths: string[]
    targetProjectId: string
    targetDatabaseId: string
    targetBasePath: string
    conflictResolution: "MERGE" | "OVERWRITE"
  }) => Promise<{ success: boolean; copiedDocuments: number }>

  // FFP-304: streaming backup (typed artifact download).
  backup: (context: FirestoreContext, path: string, limit?: number) => Promise<BackupArtifact>
  // FFP-304/FFP-305: durable jobs.
  createDeepCopyJob: (payload: {
    sourceProjectId: string
    sourceDatabaseId: string
    sourcePaths: string[]
    targetProjectId: string
    targetDatabaseId: string
    targetBasePath: string
    conflictResolution: "MERGE" | "OVERWRITE"
  }) => Promise<{ jobId: string }>
  createRestoreJob: (
    context: FirestoreContext,
    body: { documents: Array<{ path: string; fields: Record<string, unknown> }>; conflictPolicy: string; dryRun: boolean },
  ) => Promise<{ jobId: string }>
  cancelJob: (jobId: string) => Promise<JobSnapshot>
  getJobReport: (jobId: string) => Promise<{ jobId: string; committed: number; failed: number; failures: Array<{ path: string; reason: string }> }>
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
    .map(mapDocumentDtoToFirestoreDocument)
}

function toDocumentDetails(value: unknown): FirestoreDocumentDetails {
  if (!value || typeof value !== "object") {
    throw new Error(extractApiMessage(value))
  }

  const payload = value as Record<string, unknown>
  const id = typeof payload.id === "string" ? payload.id : ""
  const path = typeof payload.path === "string" ? payload.path : ""

  const rawFields = payload.fields
  const typedFields = normalizeFirestoreFields(rawFields)

  const collections = Array.isArray(payload.subcollections)
    ? payload.subcollections.filter((item): item is string => typeof item === "string")
    : []

  return {
    id,
    path,
    fields: unwrapFirestoreFields(rawFields),
    typedFields,
    collections,
    createTime: typeof payload.createTime === "string" ? payload.createTime : null,
    updateTime: typeof payload.updateTime === "string" ? payload.updateTime : null,
  }
}

function toBulkDeleteResponse(value: unknown): BulkDeleteResponse {
  if (!value || typeof value !== "object") {
    throw new Error(extractApiMessage(value))
  }
  const payload = value as Record<string, unknown>
  const deletedPaths = Array.isArray(payload.deletedPaths)
    ? payload.deletedPaths.filter((item): item is string => typeof item === "string")
    : []
  const failedPaths = Array.isArray(payload.failedPaths)
    ? payload.failedPaths.filter((item): item is string => typeof item === "string")
    : []
  return {
    deletedCount: typeof payload.deletedCount === "number" ? payload.deletedCount : deletedPaths.length,
    failedCount: typeof payload.failedCount === "number" ? payload.failedCount : failedPaths.length,
    deletedPaths,
    failedPaths,
    complete: payload.complete === true,
  }
}

function toConflictError(error: unknown): FirestoreConflictError | null {
  if (!(error instanceof AxiosError) || error.response?.status !== 409) {
    return null
  }
  const body = error.response.data as Record<string, unknown> | undefined
  const message =
    body && typeof body.message === "string" && body.message.trim()
      ? body.message
      : "The document was modified since it was last read."
  let latestDocument: FirestoreDocumentDetails | null = null
  if (body && body.latestDocument && typeof body.latestDocument === "object") {
    try {
      latestDocument = toDocumentDetails(body.latestDocument)
    } catch {
      latestDocument = null
    }
  }
  return new FirestoreConflictError(message, latestDocument)
}

function toIndexError(error: unknown): FirestoreIndexError | null {
  if (!(error instanceof AxiosError) || error.response?.status !== 400) {
    return null
  }
  const body = error.response.data as Record<string, unknown> | undefined
  if (!body || body.errorCode !== "INDEX_REQUIRED") {
    return null
  }
  const message =
    typeof body.message === "string" && body.message.trim()
      ? body.message
      : "This query needs a Firestore composite index."
  const indexUrl = typeof body.indexUrl === "string" && body.indexUrl.trim() ? body.indexUrl : null
  return new FirestoreIndexError(message, indexUrl)
}

function buildQueryParams(requestData: FirestoreQueryRequest): URLSearchParams {
  const params = new URLSearchParams()
  params.set("path", requestData.path)
  if (requestData.cursor && requestData.cursor.trim()) {
    params.set("cursor", requestData.cursor.trim())
  }
  params.set("limit", String(requestData.limit))
  // FFP-203: top-level OR-group combinator and collection-group flag.
  params.set("filterCombinator", requestData.filterCombinator)
  if (requestData.collectionGroup) {
    params.set("collectionGroup", "true")
  }

  // FFP-203: repeated order clauses, applied left to right.
  for (const order of requestData.orderBy) {
    if (!order.field.trim()) {
      continue
    }
    params.append("orderField", order.field.trim())
    params.append("orderDirection", order.direction)
  }

  // FFP-203: each filter carries its OR-group index (aligned by position with the other arrays).
  for (const filter of requestData.filters) {
    if (!filter.field.trim()) {
      continue
    }
    params.append("whereField", filter.field.trim())
    params.append("whereOperator", filter.operator)
    params.append("whereValue", filter.value)
    params.append("whereType", filter.type)
    params.append("whereGroup", String(filter.groupId))
  }

  return params
}

// DUP-004/DUP-009: the cache scope and the request headers both come from the shared helpers, so
// they cannot disagree with the backend connection key or with the SSE streams.
function contextKey(context: FirestoreContext): string {
  return contextKeyFor(context.projectId, context.databaseId)
}

function firestoreHeaders(context: FirestoreContext): Record<string, string> {
  return firestoreContextHeaders(context.projectId, context.databaseId)
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

  runQuery: async (context, requestData) => {
    const params = buildQueryParams(requestData)
    try {
      const { data: response } = await axiosInstance.get<QueryResponse>(
        `/api/workbench/query?${params.toString()}`,
        { headers: firestoreHeaders(context) },
      )
      return {
        ...response,
        documents: response.documents?.map(mapDocumentDtoToFirestoreDocument) ?? [],
        nextCursor: response.nextCursor ?? null,
        // FFP-105: page bookkeeping is derived by the caller from its cursor history.
        pageIndex: 0,
        hasPreviousPage: false,
        pageStart: response.documents?.length ? 1 : 0,
        pageEnd: response.documents?.length ?? 0,
      }
    } catch (error) {
      // FFP-203: surface a missing-index error with its create-index link.
      const indexError = toIndexError(error)
      if (indexError) {
        throw indexError
      }
      throw toRequestError(error)
    }
  },

  createDocument: (context, collectionPath, payload, docId) =>
    request(() =>
      axiosInstance.post(`/api/collections/${encodePath(collectionPath)}`, payload, {
        headers: firestoreHeaders(context),
        params: docId?.trim() ? { docId: docId.trim() } : undefined,
      }),
    ),

  writeDocument: async (context, documentPath, writeRequest) => {
    try {
      const { data } = await axiosInstance.put(
        `/api/collections/${encodePath(documentPath)}`,
        writeRequest,
        { headers: firestoreHeaders(context) },
      )
      return toDocumentDetails(data)
    } catch (error) {
      const conflict = toConflictError(error)
      if (conflict) {
        throw conflict
      }
      throw toRequestError(error)
    }
  },

  replaceDocument: (context, documentPath, payload) =>
    request(() =>
      axiosInstance.post(
        "/api/workbench/replace",
        { documentPath, payload },
        { headers: firestoreHeaders(context) },
      ),
    ),

  deleteDocument: async (context, documentPath, expectedUpdateTime) => {
    const params = new URLSearchParams()
    if (expectedUpdateTime && expectedUpdateTime.trim()) {
      params.set("expectedUpdateTime", expectedUpdateTime.trim())
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : ""
    try {
      const { data } = await axiosInstance.delete(
        `/api/collections/${encodePath(documentPath)}${suffix}`,
        { headers: firestoreHeaders(context) },
      )
      return extractApiMessage(data)
    } catch (error) {
      const conflict = toConflictError(error)
      if (conflict) {
        throw conflict
      }
      throw toRequestError(error)
    }
  },

  bulkDeleteDocuments: async (context, paths) => {
    const response = await request<unknown>(() =>
      axiosInstance.post(
        "/api/workbench/bulk-delete",
        { paths },
        { headers: firestoreHeaders(context) },
      ),
    )
    return toBulkDeleteResponse(response)
  },

  // FFP-302: bounded typed sample of a collection.
  sampleCollection: async (context, collectionPath, limit = 200) => {
    const params = new URLSearchParams({ path: collectionPath, limit: String(limit) })
    const response = await request<{ documents?: unknown }>(() =>
      axiosInstance.get(`/api/workbench/sample?${params.toString()}`, {
        headers: firestoreHeaders(context),
      }),
    )
    return toDocumentArray(response?.documents)
  },

  // FFP-303: previewable bulk edit (dry-run or execute).
  bulkEditDocuments: async (context, editRequest) => {
    const response = await request<BulkEditResponse>(() =>
      axiosInstance.post("/api/workbench/bulk-edit", editRequest, {
        headers: firestoreHeaders(context),
      }),
    )
    return response
  },

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

  // FFP-205: initialize a credential-free emulator connection.
  initEmulator: (projectId, databaseId, emulatorHost) =>
    request(() =>
      axiosInstance.post("/api/firestore/init-emulator", {
        projectId: projectId.trim(),
        databaseId: databaseId.trim() ? databaseId.trim() : null,
        emulatorHost: emulatorHost.trim(),
      }),
    ),

  // FFP-003: Connection lifecycle methods
  getConnectionStatus: () =>
    request(() => axiosInstance.get("/api/firestore/connection/status")),

  disconnectConnection: (projectId, databaseId) => {
    const params = new URLSearchParams({ projectId })
    if (databaseId?.trim()) {
      params.set("databaseId", databaseId.trim())
    }
    return request(() => axiosInstance.delete(`/api/firestore/connection?${params.toString()}`))
  },

  disconnectAllConnections: () =>
    request(() => axiosInstance.delete("/api/firestore/connection/all")),

  initTransfer: (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    return request(() =>
      axiosInstance.post("/api/transfer/init", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    )
  },

  initSourceDb: (projectId: string, databaseId: string, serviceAccountJson: string) =>
    request(() =>
      axiosInstance.post("/api/transfer/init-source-db", { projectId, databaseId, serviceAccountJson })
    ),

  deepCopy: (payload) => request(() => axiosInstance.post("/api/transfer/deep-copy", payload)),

  // FFP-304: download a typed backup artifact for a subtree.
  backup: (context, path, limit = 5000) => {
    const params = new URLSearchParams({ path, limit: String(limit) })
    return request<BackupArtifact>(() =>
      axiosInstance.get(`/api/workbench/backup?${params.toString()}`, {
        headers: firestoreHeaders(context),
      }),
    )
  },

  // FFP-305: create a durable deep-copy job.
  createDeepCopyJob: (payload) =>
    request<{ jobId: string }>(() => axiosInstance.post("/api/jobs/deep-copy", payload)),

  // FFP-304: create a restore job into the active context.
  createRestoreJob: (context, body) =>
    request<{ jobId: string }>(() =>
      axiosInstance.post("/api/jobs/restore", body, { headers: firestoreHeaders(context) }),
    ),

  cancelJob: (jobId) =>
    request<JobSnapshot>(() => axiosInstance.post(`/api/jobs/${jobId}/cancel`)),

  getJobReport: (jobId) =>
    request<{ jobId: string; committed: number; failed: number; failures: Array<{ path: string; reason: string }> }>(
      () => axiosInstance.get(`/api/jobs/${jobId}/report`),
    ),
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

  const writeDocumentMutation = useMutation({
    mutationFn: ({ context, documentPath, writeRequest }: WriteDocumentVariables) =>
      firestoreApi.writeDocument(context, documentPath, writeRequest),
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
    mutationFn: ({ context, documentPath, expectedUpdateTime }: DeleteDocumentVariables) =>
      firestoreApi.deleteDocument(context, documentPath, expectedUpdateTime),
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

  async function writeDocument(
    context: FirestoreContext,
    documentPath: string,
    writeRequest: DocumentWriteRequest,
  ) {
    return writeDocumentMutation.mutateAsync({ context, documentPath, writeRequest })
  }

  async function replaceDocument(
    context: FirestoreContext,
    documentPath: string,
    payload: FirestoreDocumentPayload,
  ) {
    return replaceDocumentMutation.mutateAsync({ context, documentPath, payload })
  }

  async function deleteDocument(
    context: FirestoreContext,
    documentPath: string,
    expectedUpdateTime?: string | null,
  ) {
    return deleteDocumentMutation.mutateAsync({ context, documentPath, expectedUpdateTime })
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
    writeDocument,
    replaceDocument,
    deleteDocument,
    bulkDeleteDocuments: firestoreApi.bulkDeleteDocuments,
    loadProjects,
    loadDatabases,
    initFirestore,
    initTransfer: firestoreApi.initTransfer,
    initSourceDb: firestoreApi.initSourceDb,
    deepCopy: firestoreApi.deepCopy,
    createDocumentMutation,
    writeDocumentMutation,
    replaceDocumentMutation,
    deleteDocumentMutation,
    loadProjectsMutation,
    loadDatabasesMutation,
    initFirestoreMutation,
  }
}

export const firestoreService = firestoreApi
