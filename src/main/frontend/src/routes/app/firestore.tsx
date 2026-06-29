import { FirestoreTabsLayout } from '@/features/firestore/components/layout/FirestoreTabsLayout'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/firestore')({
  component: DocComponent,
})

function DocComponent() {
  return <FirestoreTabsLayout />
}
