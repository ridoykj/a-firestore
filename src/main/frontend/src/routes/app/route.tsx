import { createFileRoute } from '@tanstack/react-router'
import { AppLayout } from "@/shared/components/layout/AppLayout"

export const Route = createFileRoute('/app')({
  component: RouteComponent,
})

function RouteComponent() {
  return <AppLayout />
}
