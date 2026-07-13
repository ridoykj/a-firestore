import { render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { FirestoreQueryResults } from "@/features/firestore/components/query/FirestoreQueryResults"
import type { QueryResponse } from "@/features/firestore/schemas/FirestoreSchema"

// Radix ScrollArea requires ResizeObserver, which jsdom does not provide.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

const queryResponse: QueryResponse = {
  path: "users",
  documents: [
    { id: "doc-1", _path: "users/doc-1", name: "Alice" },
    { id: "doc-2", _path: "users/doc-2", name: "Bob" },
  ],
  columns: [
    { name: "id", type: "string" },
    { name: "name", type: "string" },
  ],
  resultCount: 2,
  elapsedMs: 5,
  pageSize: 25,
  hasNextPage: false,
  nextCursor: null,
  pageIndex: 0,
  hasPreviousPage: false,
  pageStart: 1,
  pageEnd: 2,
}

// Regression: onSelectionChange feeds parent state exactly like FirestorePage does
// (onSelectionChange={setQuerySelectedRows}). When `rows`/`selectedRows` lose their
// memoization the selection effect fires on every render with a fresh array, the parent
// setState can never bail out, and React aborts with "Maximum update depth exceeded".
describe("FirestoreQueryResults selection propagation", () => {
  function Harness({ onSelectionCall }: { onSelectionCall: () => void }) {
    const [, setSelectedRows] = useState<unknown[]>([])
    return (
      <FirestoreQueryResults
        queryLoading={false}
        queryError=""
        queryResponse={queryResponse}
        selectedPreviewPath=""
        onRequestPreviewFromRow={vi.fn()}
        onSelectionChange={(rows) => {
          onSelectionCall()
          setSelectedRows(rows)
        }}
        page={0}
        onRunPrevPage={vi.fn()}
        onRunNextPage={vi.fn()}
        queryStats=""
        quickSearchText=""
        onFilterMatchCountChange={vi.fn()}
        indexUrl={null}
        tabId="tab-1"
      />
    )
  }

  it("renders without exceeding the update depth when selection state lives in the parent", () => {
    const onSelectionCall = vi.fn()

    expect(() => render(<Harness onSelectionCall={onSelectionCall} />)).not.toThrow()

    // The rows actually rendered (mobile card + desktop table both mount).
    expect(screen.getAllByText("doc-1").length).toBeGreaterThan(0)
    // The selection effect must settle instead of re-firing on every render.
    expect(onSelectionCall.mock.calls.length).toBeLessThan(5)
  })
})
