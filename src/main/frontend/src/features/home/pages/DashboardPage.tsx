import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shadcn/components/ui/card"
import { useGcpStore } from "@/features/gcp/store/gcp-store"
import {
  ArrowRight,
  Database,
  FolderTree,
  KeyRound,
  Search,
  Sparkles,
  TriangleAlert,
  UploadCloud,
  XCircle,
} from "lucide-react"
import { normalizeDatabaseId } from "@/features/firestore/api/firestore-utils"

export default function DashboardPage() {
  const { credentialsFile, openTabs, activeTabId } = useGcpStore()

  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, openTabs],
  )
  const hasCredentials = Boolean(credentialsFile)
  const hasOpenTabs = openTabs.length > 0
  const readinessSteps = [hasCredentials, hasOpenTabs].filter(Boolean).length
  const isReady = readinessSteps === 2

  return (
    <main className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground">
            <span>Data Console</span>
            <span className="text-border">/</span>
            <span className="text-foreground/70">Workspace Overview</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Workspace Overview</h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Jump into Firestore, review workspace status, and continue where you left off.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to="/">
              <KeyRound data-icon="inline-start" />
              Credentials
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9">
            <Link to="/app/firestore">
              Open Firestore
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>

      {!hasCredentials ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <TriangleAlert className="h-4 w-4" />
          </div>
          <div className="min-w-64 flex-1 space-y-0.5">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Credentials required</p>
            <p className="text-sm text-amber-800/90 dark:text-amber-300/80">
              Upload a Google Cloud service account file to browse data, run queries, and manage resources.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            className="h-9 border-amber-700 bg-amber-700 text-amber-50 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-600/90"
          >
            <Link to="/">
              <UploadCloud data-icon="inline-start" />
              Upload credentials
            </Link>
          </Button>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardDescription className="text-xs uppercase tracking-wide">Credentials</CardDescription>
            <span
              className={
                hasCredentials
                  ? "flex h-6.5 w-6.5 flex-none items-center justify-center rounded-md bg-primary/10 text-primary"
                  : "flex h-6.5 w-6.5 flex-none items-center justify-center rounded-md bg-destructive/10 text-destructive"
              }
            >
              {hasCredentials ? <KeyRound className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            </span>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <p className="text-2xl font-semibold tracking-tight">{hasCredentials ? "Connected" : "Missing"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {credentialsFile ? credentialsFile.name : "Upload service account JSON"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardDescription className="text-xs uppercase tracking-wide">Open tabs</CardDescription>
            <span className="flex h-6.5 w-6.5 flex-none items-center justify-center rounded-md bg-muted text-muted-foreground">
              <FolderTree className="h-3.5 w-3.5" />
            </span>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <p className="text-2xl font-semibold tracking-tight">{openTabs.length}</p>
            <p className="text-sm text-muted-foreground">Active Firestore context{openTabs.length === 1 ? "" : "s"}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <CardDescription className="text-xs uppercase tracking-wide">Active context</CardDescription>
            <span className="flex h-6.5 w-6.5 flex-none items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Database className="h-3.5 w-3.5" />
            </span>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <p className="truncate text-lg font-semibold tracking-tight">
              {activeTab ? activeTab.projectId : "None"}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {activeTab ? normalizeDatabaseId(activeTab.databaseId) : "Open a Firestore tab to begin"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardDescription className="text-xs uppercase tracking-wide">Readiness</CardDescription>
            <span className="font-mono text-xs font-medium text-muted-foreground">{readinessSteps} / 2</span>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <p className="text-2xl font-semibold tracking-tight">{isReady ? "Ready" : "Setup"}</p>
            <div className="flex gap-1">
              {[hasCredentials, hasOpenTabs].map((done, index) => (
                <span
                  key={index}
                  className={`h-1 flex-1 rounded-full ${done ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {isReady ? "You can query and edit documents." : "Complete credentials and workspace setup."}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Available workspaces</h2>
          <p className="text-sm text-muted-foreground">
            Choose a workspace to browse data, run queries, and manage resources.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link to="/app/firestore" className="group">
            <Card className="h-full border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Database className="h-[18px] w-[18px]" />
                  </span>
                  <Badge variant="secondary" className="gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Available
                  </Badge>
                </div>
                <CardTitle className="text-lg">Firestore</CardTitle>
                <CardDescription className="text-sm">
                  Manage documents and collections in your NoSQL database with query, preview, and
                  import/export tooling, including nested traversal and JSON editing.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex items-center justify-between border-t pt-4">
                <span className="text-xs text-muted-foreground">
                  {hasCredentials ? "Ready to use" : "Requires credentials"}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
                  Open
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </CardFooter>
            </Card>
          </Link>

          <Card className="h-full border-dashed border-border/80 bg-muted/20 shadow-sm">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground ring-1 ring-border">
                  <Search className="h-[18px] w-[18px]" />
                </span>
                <Badge variant="outline">Coming soon</Badge>
              </div>
              <CardTitle className="text-lg text-foreground/80">BigQuery</CardTitle>
              <CardDescription className="text-sm">
                Explore large-scale analytics workflows with SQL-based data investigation and export.
                Query history, saved views, and schema tooling are planned.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">Planned</span>
              <Button variant="outline" size="sm" className="h-7.5 text-xs" disabled>
                Notify me
              </Button>
            </CardFooter>
          </Card>

          <Card className="h-full border-dashed border-border/80 bg-muted/20 shadow-sm">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground ring-1 ring-border">
                  <Sparkles className="h-[18px] w-[18px]" />
                </span>
                <Badge variant="outline">Roadmap</Badge>
              </div>
              <CardTitle className="text-lg text-foreground/80">More integrations</CardTitle>
              <CardDescription className="text-sm">
                Additional Google Cloud data products will be added to this console. The UI
                foundation is designed to scale across future services.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">In discovery</span>
              <span className="text-sm text-muted-foreground">&mdash;</span>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  )
}
