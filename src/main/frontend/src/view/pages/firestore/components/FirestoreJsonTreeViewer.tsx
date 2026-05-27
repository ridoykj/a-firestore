import { useMemo } from "react"
import JsonView from "@microlink/react-json-view"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { useTheme } from "next-themes"

type FirestoreJsonTreeViewerProps = {
  draft: string
  onDraftChange?: (newDraft: string) => void
}

export function FirestoreJsonTreeViewer({ draft, onDraftChange }: FirestoreJsonTreeViewerProps) {
  const { resolvedTheme } = useTheme()

  const parsedJson = useMemo(() => {
    try {
      const data: unknown = JSON.parse(draft)
      return { data, parseError: "" }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON."
      return { data: null as unknown, parseError: message }
    }
  }, [draft])

  if (parsedJson.parseError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Tree View Unavailable</AlertTitle>
        <AlertDescription>
          {`Current JSON draft is invalid: ${parsedJson.parseError}`}
        </AlertDescription>
      </Alert>
    )
  }

  if (!parsedJson.data) {
    return (
      <Alert>
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>There is no JSON data to render in tree view.</AlertDescription>
      </Alert>
    )
  }

  const handleEdit = onDraftChange 
    ? (interaction: { updated_src: object }) => onDraftChange(JSON.stringify(interaction.updated_src, null, 2))
    : undefined

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between pb-3">
        <h3 className="font-semibold text-sm">Tree View</h3>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md p-4 border wrap-break-word">
        <JsonView 
          src={parsedJson.data as object} 
          theme={resolvedTheme === 'dark' ? 'ashes' : 'rjv-default'} 
          displayDataTypes={false}
          displayObjectSize={true}
          enableClipboard={true}
          collapseStringsAfterLength={50}
          groupArraysAfterLength={100}
          onEdit={handleEdit}
          onAdd={handleEdit}
          onDelete={handleEdit}
          style={{ backgroundColor: 'transparent' }}
        />
      </div>
    </div>
  )
}


