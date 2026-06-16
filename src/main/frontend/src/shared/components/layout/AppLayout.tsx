import { cn } from "@/shadcn/lib/utils"
import { Outlet, useRouterState } from "@tanstack/react-router"
import { useMemo } from "react"

type BreadcrumbSegment = {
  label: string
  to?: "/app"
}

function routeMeta(pathname: string): {
  title: string
  subtitle: string
  breadcrumbs: BreadcrumbSegment[]
  fullBleedContent: boolean
} {
  if (pathname.startsWith("/app/firestore")) {
    return {
      title: "Firestore Workspace",
      subtitle: "Browse collections, run queries, and manage documents.",
      breadcrumbs: [
        { label: "Dashboard", to: "/app" },
        { label: "Firestore" },
      ],
      fullBleedContent: true,
    }
  }

  return {
    title: "Dashboard",
    subtitle: "Choose a workspace and continue your data operations.",
    breadcrumbs: [{ label: "Dashboard" }],
    fullBleedContent: false,
  }
}

export function AppLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const meta = useMemo(() => routeMeta(pathname), [pathname])

  return (
    <div className="h-svh overflow-hidden">
      <div className="flex min-h-0 h-full min-w-0 flex-col overflow-hidden bg-muted/20">       
        <div
          className={cn(
            "min-h-0 min-w-0 flex flex-1 flex-col",
            meta.fullBleedContent ? "overflow-hidden" : "overflow-auto",
          )}
        >
          {meta.fullBleedContent ? (
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
