import { Link } from "@tanstack/react-router"
import { Button } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shadcn/components/ui/card"

const GlobalErrorComponent = ({ props }: { props: Error }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <p className="text-6xl font-bold text-destructive">500</p>
          <CardTitle>Server Error</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            The request could not be completed due to a server-side error.
          </p>
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {props.message}
          </p>
          <Button asChild>
            <Link to="/">Go Back to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default GlobalErrorComponent
