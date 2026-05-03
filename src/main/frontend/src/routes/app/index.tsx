import DashboardPage from '@/view/pages/home/DashboardPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <DashboardPage />
}
