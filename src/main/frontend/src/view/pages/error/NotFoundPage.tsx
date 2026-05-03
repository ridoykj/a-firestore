import { Link } from "@tanstack/react-router"
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shadcn/components/ui/card"

const NotFoundPage = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <p className="text-6xl font-bold text-destructive">404</p>
          <CardTitle>Page Not Found</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Oops! The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Button asChild>
            <Link to="/">Return to Homepage</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

export default NotFoundPage
