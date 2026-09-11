import { Link } from "@tanstack/react-router"
import type * as React from "react"
import { LinkButton } from "@/shadcn/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shadcn/components/ui/card"

const AppErrorComponent = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <p className="text-6xl font-bold text-destructive">404</p>
          <CardTitle>Page Not Found</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Sorry, the page you are looking for does not exist. It might have been moved or deleted.
          </p>
          <LinkButton href="/"
            render={(props) => <Link to="/" {...(props as React.ComponentPropsWithRef<"a">)} />}>
            Go Back to Home
          </LinkButton>
        </CardContent>
      </Card>
    </div>
  )
}

export default AppErrorComponent
