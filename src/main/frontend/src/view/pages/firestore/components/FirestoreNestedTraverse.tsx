import { Button } from "@/shadcn/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { AlertCircle, ChevronLeft, RefreshCw } from "lucide-react"
import { type NestedResponse } from "@/dto/firestore/FirestoreSchema"
import { pathIsCollection } from "@/view/pages/firestore/lib/firestore-utils"

interface FirestoreNestedTraverseProps {
  nestedLoading: boolean;
  nestedResponse: NestedResponse | null;
  queryPath: string;
  setQueryPath: (path: string) => void;
  runQuery: (page: number, pathOverride?: string) => void;
  refreshNested: (pathValue: string) => void;
}

export function FirestoreNestedTraverse({
  nestedLoading,
  nestedResponse,
  queryPath,
  setQueryPath,
  runQuery,
  refreshNested
}: FirestoreNestedTraverseProps) {
  return (
    <aside className="w-72 shrink-0 border-r bg-card">
      <div className="flex h-10 items-center border-b px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Nested Traverse
      </div>
      <div className="h-[calc(100%-2.5rem)] overflow-auto p-3">
        {nestedLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner />
            Loading...
          </div>
        ) : null}
        {nestedResponse?.nestedError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Nested Traversal Error</AlertTitle>
            <AlertDescription>{nestedResponse.nestedError}</AlertDescription>
          </Alert>
        ) : null}

        {!nestedLoading && !nestedResponse?.nestedError ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              {nestedResponse?.parentPath ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    const parent = nestedResponse.parentPath
                    setQueryPath(`/${parent}`)
                    if (pathIsCollection(parent)) {
                      void runQuery(0, parent)
                    } else {
                      void refreshNested(parent)
                    }
                  }}
                >
                  <ChevronLeft data-icon="inline-start" />
                  Up
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="xs" onClick={() => void refreshNested(queryPath)}>
                <RefreshCw data-icon="inline-start" />
                Refresh
              </Button>
            </div>

            {nestedResponse?.nodeType === "collection"
              ? nestedResponse.documentNodes.map((node) => (
                  <Button
                    key={node.path}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-xs"
                    onClick={() => void refreshNested(node.path)}
                  >
                    <div className="grid">
                      <span className="font-medium">{node.id}</span>
                    </div>
                  </Button>
                ))
              : null}

            {nestedResponse?.nodeType === "document"
              ? nestedResponse.childCollectionNodes.map((node) => (
                  <Button
                    key={node.path}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto w-full justify-start rounded-md px-2 py-1.5 text-left text-xs"
                    onClick={() => {
                      setQueryPath(`/${node.path}`)
                      void runQuery(0, node.path)
                    }}
                  >
                    <div className="grid">
                      <span className="font-medium">{node.id}</span>
                      <span className="text-muted-foreground">{node.path}</span>
                    </div>
                  </Button>
                ))
              : null}

            {nestedResponse?.nestedHint ? (
              <p className="text-xs text-muted-foreground">{nestedResponse.nestedHint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}