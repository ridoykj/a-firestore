import { useState } from "react"
import { toast } from "sonner"
import { BarChart3, ShieldCheck, Trash2 } from "lucide-react"

import { Button } from "@/shadcn/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shadcn/components/ui/dialog"
import { Input } from "@/shadcn/components/ui/input"
import { Label } from "@/shadcn/components/ui/label"
import { Badge } from "@/shadcn/components/ui/badge"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"
import { firestoreService, type FirestoreContext } from "@/features/firestore/api/firestore-service"
import {
  deriveRules,
  hasTypeConflict,
  profileSample,
  type SchemaProfile,
} from "@/features/firestore/api/schema-profiler"
import {
  clearRules,
  hasRules,
  loadRules,
  saveRules,
} from "@/features/firestore/api/validation-rules-storage"
import {
  normalizeFirestoreFields,
  type FirestoreWireValue,
} from "@/features/firestore/api/firestore-value-utils"
import { normalizePath, pathIsCollection } from "@/features/firestore/api/firestore-utils"

type FirestoreProfilerDialogProps = {
  context: FirestoreContext
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPath?: string
}

export function FirestoreProfilerDialog({
  context,
  open,
  onOpenChange,
  initialPath = "",
}: FirestoreProfilerDialogProps) {
  const [path, setPath] = useState(initialPath)
  const [limit, setLimit] = useState(200)
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<SchemaProfile | null>(null)
  const [rulesVersion, setRulesVersion] = useState(0)

  const normalizedPath = normalizePath(path)
  const rulesExist = normalizedPath
    ? (void rulesVersion, hasRules(context.projectId, context.databaseId ?? "", normalizedPath))
    : false

  async function runProfile() {
    if (!normalizedPath || !pathIsCollection(normalizedPath)) {
      toast.error("Enter a collection path (odd segment count).")
      return
    }
    setBusy(true)
    setProfile(null)
    try {
      const documents = await firestoreService.sampleCollection(context, normalizedPath, limit)
      const samples = documents.map((document) => {
        const typed = (document as Record<string, unknown>)._typedFields
        return typed && typeof typed === "object"
          ? (typed as Record<string, FirestoreWireValue>)
          : normalizeFirestoreFields(document)
      })
      setProfile(profileSample(samples))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profiling failed.")
    } finally {
      setBusy(false)
    }
  }

  function saveDerivedRules() {
    if (!profile) {
      return
    }
    const rules = deriveRules(profile)
    saveRules(context.projectId, context.databaseId ?? "", normalizedPath, rules)
    setRulesVersion((v) => v + 1)
    toast.success(
      `Saved rules: ${rules.requiredPaths.length} required, ${Object.keys(rules.expectedTypes).length} typed.`,
    )
  }

  function removeRules() {
    clearRules(context.projectId, context.databaseId ?? "", normalizedPath)
    setRulesVersion((v) => v + 1)
    toast.success("Local validation rules cleared.")
  }

  const currentRules = normalizedPath
    ? (void rulesVersion, loadRules(context.projectId, context.databaseId ?? "", normalizedPath))
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-primary" />
            Schema profiler
          </DialogTitle>
          <DialogDescription>
            Sample a collection to see field frequency, observed types, conflicts, and nullability.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label className="text-xs text-muted-foreground">Collection path</Label>
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="users"
              className="font-mono text-sm"
            />
          </div>
          <div className="grid w-28 gap-1.5">
            <Label className="text-xs text-muted-foreground">Sample size</Label>
            <Input
              type="number"
              value={limit}
              onChange={(event) => setLimit(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))}
              className="text-sm"
            />
          </div>
          <Button onClick={() => void runProfile()} disabled={busy}>
            {busy ? "Sampling..." : "Profile"}
          </Button>
        </div>

        {profile ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{profile.sampled} sampled</Badge>
              <Badge variant="secondary">{profile.fields.length} fields</Badge>
              {rulesExist ? (
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="size-3" /> local rules active
                </Badge>
              ) : null}
            </div>
            <ScrollArea className="max-h-72 rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-background/95">
                  <tr className="border-b">
                    <th className="px-3 py-1.5 font-semibold">Field</th>
                    <th className="px-3 py-1.5 font-semibold">Present</th>
                    <th className="px-3 py-1.5 font-semibold">Types</th>
                    <th className="px-3 py-1.5 font-semibold">Null</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.fields.map((field) => {
                    const presentPct = profile.sampled > 0 ? Math.round((field.presentCount / profile.sampled) * 100) : 0
                    return (
                      <tr key={field.path} className="border-b align-top last:border-0">
                        <td className="px-3 py-1.5 font-mono">{field.path}</td>
                        <td className="px-3 py-1.5">{presentPct}%</td>
                        <td className="px-3 py-1.5">
                          <span className="flex flex-wrap items-center gap-1">
                            {Object.entries(field.types).map(([type, count]) => (
                              <span key={type} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                                {type}:{count}
                              </span>
                            ))}
                            {hasTypeConflict(field) ? (
                              <Badge variant="destructive" className="text-[10px]">conflict</Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">{field.nullCount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollArea>
            {currentRules && rulesExist ? (
              <p className="text-[11px] text-muted-foreground">
                Rules require: {currentRules.requiredPaths.join(", ") || "—"}. Typed:{" "}
                {Object.keys(currentRules.expectedTypes).length} field(s). New/edited documents in
                this collection are validated against these before writing.
              </p>
            ) : null}
          </>
        ) : null}

        <DialogFooter>
          {rulesExist ? (
            <Button variant="outline" onClick={removeRules}>
              <Trash2 data-icon="inline-start" />
              Clear rules
            </Button>
          ) : null}
          <Button variant="secondary" onClick={saveDerivedRules} disabled={!profile}>
            <ShieldCheck data-icon="inline-start" />
            Derive &amp; save rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
