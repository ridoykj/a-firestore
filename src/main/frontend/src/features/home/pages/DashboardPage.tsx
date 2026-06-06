import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/shadcn/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { useGcpStore } from "@/features/gcp/store/gcp-store"
import { ArrowRight, CheckCircle2, Database, Flame, FolderTree, KeyRound, Search, Sparkles, XCircle } from "lucide-react"

export default function DashboardPage() {
  const { credentialsFile, openTabs, activeTabId } = useGcpStore()

  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, openTabs],
  )
  const hasCredentials = Boolean(credentialsFile)
  const hasOpenTabs = openTabs.length > 0
  const firestoreStatus = hasCredentials ? "Connected" : "Credentials required"

  return (
    <main className="grid gap-6">
      <section className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(circle_at_0%_0%,oklch(0.96_0.02_257),transparent_42%),radial-gradient(circle_at_100%_0%,oklch(0.98_0.01_220),transparent_35%)]" />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2">
              <Badge variant="secondary" className="h-7 px-3 text-sm">
                Data Console
              </Badge>
              <Badge variant={hasCredentials ? "secondary" : "outline"} className="h-7 px-3 text-sm">
                {firestoreStatus}
              </Badge>
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Workspace Overview</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Jump into Firestore, review workspace status, and continue where you left off.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/">
                <KeyRound data-icon="inline-start" />
                Credentials
              </Link>
            </Button>
            <Button asChild size="sm" className="h-9">
              <Link to="/app/firestore">
                <Flame data-icon="inline-start" />
                Open Firestore
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-1">
            <CardDescription className="text-xs uppercase tracking-wide">Credentials</CardDescription>
            <CardTitle className="text-xl">{hasCredentials ? "Connected" : "Missing"}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between pt-0">
            <p className="truncate text-sm text-muted-foreground">
              {credentialsFile ? credentialsFile.name : "Upload service account JSON"}
            </p>
            {hasCredentials ? (
              <CheckCircle2 className="text-primary" />
            ) : (
              <XCircle className="text-muted-foreground" />
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-1">
            <CardDescription className="text-xs uppercase tracking-wide">Open Tabs</CardDescription>
            <CardTitle className="text-xl">{openTabs.length}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between pt-0">
            <p className="text-sm text-muted-foreground">Active Firestore contexts</p>
            <FolderTree className="text-primary" />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-1">
            <CardDescription className="text-xs uppercase tracking-wide">Active Context</CardDescription>
            <CardTitle className="truncate text-base sm:text-lg">
              {activeTab ? activeTab.projectId : "None"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="truncate text-sm text-muted-foreground">
              {activeTab ? activeTab.databaseId || "(default)" : "Open a Firestore tab to begin"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-1">
            <CardDescription className="text-xs uppercase tracking-wide">Readiness</CardDescription>
            <CardTitle className="text-xl">{hasCredentials && hasOpenTabs ? "Ready" : "Setup"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              {hasCredentials && hasOpenTabs
                ? "You can query and edit documents."
                : "Complete credentials and workspace setup."}
            </p>
          </CardContent>
        </Card>
      </section>

      {!hasCredentials ? (
        <Card className="border-dashed bg-muted/20 shadow-sm">
          <CardContent className="p-4 sm:p-6">
            <Empty className="border-none p-0">
              <EmptyHeader>
                <EmptyTitle>Connect credentials to continue</EmptyTitle>
                <EmptyDescription>
                  Upload a Google Cloud service account file first, then open a Firestore workspace.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/">
                  <KeyRound data-icon="inline-start" />
                  Upload Credentials
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/app/firestore">
                  <Flame data-icon="inline-start" />
                  Go to Firestore
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Available Workspaces</h3>
            <p className="text-sm text-muted-foreground">
              Choose a workspace to browse data, run queries, and manage resources.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link to="/app/firestore" className="group">
            <Card className="h-full border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Flame />
                  </span>
                  <ArrowRight className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <CardTitle className="text-lg">Firestore</CardTitle>
                <CardDescription className="text-sm">
                  Manage documents and collections in your NoSQL database with query, preview, and
                  import/export tooling.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Includes nested traversal, JSON editing, and transfer utilities.
              </CardContent>
              <CardFooter className="pt-0">
                <Badge variant={hasCredentials ? "secondary" : "outline"}>
                  {hasCredentials ? "Ready to use" : "Requires credentials"}
                </Badge>
              </CardFooter>
            </Card>
          </Link>

          <Card className="relative h-full border-dashed border-border/80 bg-muted/20 shadow-sm">
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground ring-1 ring-border">
                  <Search />
                </span>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
              <CardTitle className="text-lg">BigQuery</CardTitle>
              <CardDescription className="text-sm">
                Explore large-scale analytics workflows with SQL-based data investigation and export.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              Query history, saved views, and schema tooling are planned.
            </CardContent>
            <CardFooter className="pt-0">
              <Badge variant="outline">
                <Sparkles data-icon="inline-start" />
                Planned
              </Badge>
            </CardFooter>
          </Card>

          <Card className="h-full border-dashed border-border/80 bg-muted/20 shadow-sm">
            <CardHeader className="gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground ring-1 ring-border">
                <Database />
              </span>
              <CardTitle className="text-lg">More Integrations</CardTitle>
              <CardDescription className="text-sm">
                Additional Google Cloud data products will be added to this console.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              The UI foundation is designed to scale across future services.
            </CardContent>
            <CardFooter className="pt-0">
              <Badge variant="outline">Roadmap</Badge>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  )
}
