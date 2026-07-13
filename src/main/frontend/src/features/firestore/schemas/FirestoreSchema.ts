export type ViewMode = "table" | "tree" | "json"

export type OrderDirection = "asc" | "desc"

/** FFP-203: how OR groups of filters combine at the top level. */
export type FilterCombinator = "and" | "or"

/** FFP-203: one order-by clause; a query may carry several, applied left to right. */
export type OrderClause = { field: string; direction: OrderDirection }

export type WhereType = "string" | "number" | "boolean" | "null" | "string-array" | "number-array" | "timestamp"

export type StatusTone = "success" | "warning" | "error"

export type TransferFormat = "json" | "csv"

export type QueryColumn = {
  name: string
  type: string
}

export type FirestoreDocument = {
  id?: string
  _path?: string
  [key: string]: unknown
}

/**
 * FFP-105: The server returns cursor-based pages (`nextCursor`, `hasNextPage`); the page
 * bookkeeping fields (`pageIndex`, `hasPreviousPage`, `pageStart`, `pageEnd`) are derived on
 * the client from its cursor history.
 */
export type QueryResponse = {
  path: string
  documents: FirestoreDocument[]
  columns: QueryColumn[]
  resultCount: number
  elapsedMs: number
  pageSize: number
  hasNextPage: boolean
  nextCursor: string | null
  pageIndex: number
  hasPreviousPage: boolean
  pageStart: number
  pageEnd: number
}

export type WriteMode = "MERGE" | "REPLACE"

/** FFP-102/FFP-103/FFP-104: Safe write contract mirrored from the backend. */
export type DocumentWriteRequest = {
  mode: WriteMode
  fields: Record<string, unknown>
  deleteFieldPaths: string[]
  expectedUpdateTime: string | null
}

/** FFP-106: Result of an atomic bulk delete. */
export type BulkDeleteResponse = {
  deletedCount: number
  failedCount: number
  deletedPaths: string[]
  failedPaths: string[]
  complete: boolean
}

/** FFP-303: Previewable bulk edit. `setFields` values are canonical Firestore wire values. */
export type BulkEditRequest = {
  paths: string[]
  setFields: Record<string, unknown>
  deleteFieldPaths: string[]
  dryRun: boolean
}

export type BulkEditResultItem = {
  path: string
  status: "ok" | "failed" | "skipped" | "preview"
  message?: string
}

export type BulkEditResponse = {
  dryRun: boolean
  requested: number
  succeeded: number
  failed: number
  results: BulkEditResultItem[]
  complete: boolean
}

export type NestedNode = {
  id: string
  path: string
}

export type NestedPageInfo = {
  nextCursor: string | null
  hasMore: boolean
  returnedCount: number
  limit: number
}

export type NestedResponse = {
  currentPath: string
  parentPath: string
  nodeType: "empty" | "collection" | "document"
  documentNodes: NestedNode[]
  childCollectionNodes: NestedNode[]
  nestedHint: string
  nestedError: string
  pageInfo?: NestedPageInfo
}

export type WhereRow = {
  id: number
  field: string
  operator: string
  value: string
  type: WhereType
  /** FFP-203: OR-group index. Rows sharing a groupId are AND-combined; groups combine per the combinator. */
  groupId: number
}

export type CrudBusy = "create" | "update" | "replace" | "delete" | null

export type PreviewEditorTheme = "light" | "dark"

export type PreviewCloseIntent = "close" | "switch"

export type PreviewValidationSummary = {
  errorCount: number
  warningCount: number
  firstErrorMessage: string
}

export type JsonPathSegment = string | number

export type JsonTreeValueType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"

export type JsonTreeNodeMeta = {
  path: string
  parentPath: string | null
  depth: number
  segments: JsonPathSegment[]
  keyLabel: string
  rawKey: JsonPathSegment | null
  isArrayItem: boolean
  valueType: JsonTreeValueType
  value: unknown
  expandable: boolean
  childPaths: string[]
}

export type FirestoreWhereFilter = {
  field: string
  operator: string
  value: string
  type: WhereType
  /** FFP-203: OR-group index of this filter. */
  groupId: number
}

export type FirestoreQueryRequest = {
  path: string
  /** FFP-105: opaque cursor returned by the previous page; null for the first page. */
  cursor: string | null
  limit: number
  /** FFP-203: how OR groups combine at the top level. */
  filterCombinator: FilterCombinator
  /** FFP-203: run a collection-group query where `path` is the collection id. */
  collectionGroup: boolean
  /** FFP-203: ordered list of order-by clauses. */
  orderBy: OrderClause[]
  filters: FirestoreWhereFilter[]
}

export const EMPTY_NESTED_HINT =
  "Run a collection query first, then traverse nested documents and subcollections here."

export const EMPTY_JSON_TEMPLATE = "{\n\n}"

export const DEFAULT_WHERE_ROW: WhereRow = {
  id: 1,
  field: "",
  operator: "==",
  value: "",
  type: "string",
  groupId: 0,
}

export const EMPTY_NESTED_RESPONSE: NestedResponse = {
  currentPath: "",
  parentPath: "",
  nodeType: "empty",
  documentNodes: [],
  childCollectionNodes: [],
  nestedHint: EMPTY_NESTED_HINT,
  nestedError: "",
  pageInfo: {
    nextCursor: null,
    hasMore: false,
    returnedCount: 0,
    limit: 25,
  },
}
