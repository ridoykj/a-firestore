import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from "@/view/layout/AppShell"

export const Route = createFileRoute('/app')({
  component: RouteComponent,
})

function RouteComponent() {
  return <AppShell />
}
