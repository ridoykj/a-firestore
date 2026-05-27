export type ViewMode = "table" | "tree" | "json"

export type OrderDirection = "asc" | "desc"

export type WhereType = "string" | "number" | "boolean" | "null"

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

export type QueryResponse = {
  path: string
  documents: FirestoreDocument[]
  columns: QueryColumn[]
  resultCount: number
  elapsedMs: number
  pageIndex: number
  pageSize: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  pageStart: number
  pageEnd: number
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
}

export type FirestoreQueryRequest = {
  path: string
  page: number
  limit: number
  orderDirection: OrderDirection
  orderField?: string
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
