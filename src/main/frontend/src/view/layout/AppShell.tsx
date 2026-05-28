import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import { Cloud, Flame, LayoutDashboard } from "lucide-react"
import { Fragment, useMemo } from "react"
import { Badge } from "@/shadcn/components/ui/badge"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/shadcn/components/ui/breadcrumb"
import { Button } from "@/shadcn/components/ui/button"
import { Separator } from "@/shadcn/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/shadcn/components/ui/sidebar"
import { cn } from "@/shadcn/lib/utils"
import { useGcpStore } from "@/store/gcp-store"

type AppNavItem = {
  label: string
  to: "/app" | "/app/firestore"
  icon: LucideIcon
  isActive: (pathname: string) => boolean
}

type BreadcrumbSegment = {
  label: string
  to?: "/app"
}

const APP_NAV_ITEMS: AppNavItem[] = [
  {
    label: "Dashboard",
    to: "/app",
    icon: LayoutDashboard,
    isActive: (pathname) => pathname === "/app" || pathname === "/app/",
  },
  {
    label: "Firestore",
    to: "/app/firestore",
    icon: Flame,
    isActive: (pathname) => pathname.startsWith("/app/firestore"),
  },
]

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

export function AppShell() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { credentialsFile } = useGcpStore()

  const meta = useMemo(() => routeMeta(pathname), [pathname])
  const navItems = useMemo(
    () =>
      APP_NAV_ITEMS.map((item) => ({
        ...item,
        active: item.isActive(pathname),
      })),
    [pathname],
  )

  return (
    <SidebarProvider defaultOpen className="h-svh overflow-hidden">
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="p-3">
          <Link
            to="/app"
            preload="intent"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Cloud className="h-4 w-4" />
            </span>
            <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">Data Console</span>
              <span className="truncate text-xs text-sidebar-foreground/70">Cloud data workspace</span>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                      <Link to={item.to} preload="intent">
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-2">
          <div className="rounded-md border border-sidebar-border/70 bg-sidebar-accent/40 px-2 py-2 text-xs text-sidebar-foreground/80 group-data-[collapsible=icon]:hidden">
            {credentialsFile ? `Credentials: ${credentialsFile.name}` : "No credentials selected"}
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="flex min-h-0 h-full min-w-0 flex-col overflow-hidden bg-muted/20">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85">
          <div className="flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4 lg:px-6">
            <SidebarTrigger className="h-9 w-9 shrink-0" />
            <Separator orientation="vertical" className="h-5 shrink-0" />

            <div className="min-w-0 flex-1">
              <Breadcrumb>
                <BreadcrumbList>
                  {meta.breadcrumbs.map((segment, index) => (
                    <Fragment key={`${segment.label}-${index}`}>
                      <BreadcrumbItem>
                        {segment.to ? (
                          <BreadcrumbLink asChild>
                            <Link to={segment.to} preload="intent">
                              {segment.label}
                            </Link>
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {index < meta.breadcrumbs.length - 1 ? <BreadcrumbSeparator /> : null}
                    </Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{meta.title}</h1>
              <p className="hidden truncate text-sm text-muted-foreground md:block">{meta.subtitle}</p>
            </div>

            <nav className="hidden items-center gap-1 lg:flex">
              {navItems.map((item) => (
                <Button key={`top-${item.to}`} asChild variant={item.active ? "secondary" : "ghost"} size="sm" className="h-9">
                  <Link to={item.to} preload="intent">
                    <item.icon data-icon="inline-start" />
                    {item.label}
                  </Link>
                </Button>
              ))}
            </nav>

            <Badge variant={credentialsFile ? "secondary" : "outline"} className="hidden max-w-48 truncate sm:inline-flex">
              {credentialsFile ? "Credentials Ready" : "No Credentials"}
            </Badge>
          </div>
        </header>

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
      </SidebarInset>
    </SidebarProvider>
  )
}
