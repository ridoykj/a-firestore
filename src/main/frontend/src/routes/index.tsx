import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Badge } from "@/shadcn/components/ui/badge"
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shadcn/components/ui/card"
import { Input } from "@/shadcn/components/ui/input"
import { Separator } from "@/shadcn/components/ui/separator"
import { useGcpStore } from "@/store/gcp-store"
import { ArrowRight, Cloud, FileKey2, ShieldCheck } from "lucide-react"

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://leasedrop.ai/" }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const { setCredentialsFile, credentialsFile } = useGcpStore()
  const navigate = useNavigate()

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setCredentialsFile(file)
  }

  const handleProceed = () => {
    if (credentialsFile) {
      navigate({ to: "/app" })
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,oklch(0.95_0.03_257),transparent_45%),radial-gradient(circle_at_80%_0%,oklch(0.98_0.02_220),transparent_35%)]" />
      <Card className="w-full max-w-2xl border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            Secure setup
          </Badge>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Cloud className="text-primary" />
            Connect to Firestore
          </CardTitle>
          <CardDescription className="max-w-xl text-sm">
            Upload a Google Cloud service account JSON file to start browsing projects, running
            queries, and managing documents from one workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="rounded-lg border bg-muted/20 p-4">
            <label
              htmlFor="credentials"
              className="mb-2 inline-flex items-center gap-2 text-sm font-medium"
            >
              <FileKey2 className="text-primary" />
              Service Account Credentials
            </label>
            <Input
              id="credentials"
              type="file"
              accept=".json,application/json"
              onChange={handleUpload}
              className="h-10 cursor-pointer text-sm file:h-8 file:px-2"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Your file stays in this session and is used only for Firestore API requests.
            </p>
          </section>

          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
            <ShieldCheck className="text-primary" />
            Least-privilege IAM roles are recommended for production access.
          </div>

          <Separator />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {credentialsFile ? `Selected file: ${credentialsFile.name}` : "No credentials selected yet."}
            </p>
            <Button onClick={handleProceed} disabled={!credentialsFile} size="lg" className="h-10">
              Open Dashboard
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
