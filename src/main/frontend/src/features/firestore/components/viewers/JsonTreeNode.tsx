import { safePreviewValue } from "@/features/firestore/api/firestore-utils"

export function JsonTreeNode({ label, value }: { label: string; value: unknown }) {
  const isObject = value !== null && typeof value === "object" && !Array.isArray(value)
  const isArray = Array.isArray(value)

  if (isObject) {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <details className="rounded-sm border border-border/60 bg-background/70 px-2 py-1" open>
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          {label} {"{"} {entries.length} {"}"}
        </summary>
        <div className="mt-1 ml-3 grid gap-1 border-l border-border pl-2">
          {entries.map(([key, nestedValue]) => (
            <JsonTreeNode key={key} label={key} value={nestedValue} />
          ))}
        </div>
      </details>
    )
  }

  if (isArray) {
    const list = value as unknown[]
    return (
      <details className="rounded-sm border border-border/60 bg-background/70 px-2 py-1" open>
        <summary className="cursor-pointer text-xs font-medium text-foreground">
          {label} [{" "} {list.length} {" "}]
        </summary>
        <div className="mt-1 ml-3 grid gap-1 border-l border-border pl-2">
          {list.map((item, index) => (
            <JsonTreeNode key={`${label}-${index}`} label={`[${index}]`} value={item} />
          ))}
        </div>
      </details>
    )
  }

  return (
    <div className="rounded-sm border border-border/60 bg-background/70 px-2 py-1 text-xs">
      <span className="font-medium text-foreground">{label}:</span>{" "}
      <span className="text-muted-foreground">{safePreviewValue(value)}</span>
    </div>
  )
}
