import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shadcn/components/ui/card"
import { Separator } from "@/shadcn/components/ui/separator"
import { ArrowRight } from "lucide-react"

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://leasedrop.ai/" }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,oklch(0.95_0.03_257),transparent_45%),radial-gradient(circle_at_80%_0%,oklch(0.98_0.02_220),transparent_35%)]" />
      <Card className="w-full max-w-2xl border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            Welcome
          </Badge>
          <CardTitle className="text-xl">Welcome to Firestore Explorer</CardTitle>
          <CardDescription className="max-w-xl text-sm">
            Manage Firestore documents, browse projects, and run queries from one centralized workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">
              Start by uploading your Google Cloud service account JSON file in the dashboard. Your
              credentials stay in the session and are only used for Firestore API requests.
            </p>
          </section>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Need a quick start?</p>
              <p>Click below to open the dashboard and continue setup.</p>
            </div>
            <Button onClick={() => navigate({ to: "/app" })} size="lg" className="h-10">
              Open Dashboard
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
