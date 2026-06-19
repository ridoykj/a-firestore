import { useMemo, useState } from "react"
import JsonView from "@microlink/react-json-view"
import { Alert, AlertDescription, AlertTitle } from "@/shadcn/components/ui/alert"
import { Badge } from "@/shadcn/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/shadcn/components/ui/toggle-group"
import { useIsMobile } from "@/shadcn/hooks/use-mobile"
import { useTheme } from "@/shared/components/ui/shadcn/components/theme-provider"
import { ScrollArea, ScrollBar } from "@/shadcn/components/ui/scroll-area"
type FirestoreJsonTreeViewerProps = {
  draft: string
  onDraftChange?: (newDraft: string) => void
}

type CollapseMode = "auto" | "expand" | "compact"

export function FirestoreJsonTreeViewer({ draft, onDraftChange }: FirestoreJsonTreeViewerProps) {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const [collapseMode, setCollapseMode] = useState<CollapseMode>("auto")

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
      <Alert variant="destructive" className="wrap-break-word">
        <AlertTitle>Tree View Unavailable</AlertTitle>
        <AlertDescription>
          {`Current JSON draft is invalid: ${parsedJson.parseError}`}
        </AlertDescription>
      </Alert>
    )
  }

  if (parsedJson.data === null || typeof parsedJson.data === "undefined") {
    return (
      <Alert className="wrap-break-word">
        <AlertTitle>No Data</AlertTitle>
        <AlertDescription>There is no JSON data to render in tree view.</AlertDescription>
      </Alert>
    )
  }

  const handleEdit = onDraftChange
    ? (interaction: { updated_src: unknown }) =>
      onDraftChange(JSON.stringify(interaction.updated_src, null, 2))
    : undefined

  const collapsedDepth =
    collapseMode === "expand" ? false : collapseMode === "compact" ? 2 : isMobile ? 1 : 2

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Tree View</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={onDraftChange ? "secondary" : "outline"}>
            {onDraftChange ? "Editable" : "Read only"}
          </Badge>
          <ToggleGroup
            type="single"
            value={collapseMode}
            spacing={0}
            onValueChange={(value) => {
              if (value) {
                setCollapseMode(value as CollapseMode)
              }
            }}
            className="rounded-full overflow-hidden border"
            size="sm"
          >
            <ToggleGroupItem value="auto" >Auto</ToggleGroupItem>
            <ToggleGroupItem value="compact" >Compact</ToggleGroupItem>
            <ToggleGroupItem value="expand" >Expand All</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1 rounded-md border bg-muted/10 p-2 sm:p-3 md:p-4">
        <div className="min-w-max">
          <JsonView
            src={parsedJson.data as object}
            theme={theme === "dark" ? "ashes" : "rjv-default"}
            displayDataTypes={false}
            displayObjectSize={true}
            enableClipboard={true}
            collapseStringsAfterLength={isMobile ? 30 : 50}
            groupArraysAfterLength={isMobile ? 60 : 100}
            collapsed={collapsedDepth}
            iconStyle="triangle"
            indentWidth={2}
            onEdit={handleEdit}
            onAdd={handleEdit}
            onDelete={handleEdit}
            style={{
              backgroundColor: "transparent",
              fontSize: isMobile ? "12px" : "13px",
              lineHeight: 1.5,
            }}
          />
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
