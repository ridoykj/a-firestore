import { FirestoreTabsLayout } from '@/features/firestore/components/FirestoreTabsLayout'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/firestore')({
  component: DocComponent,
})

function DocComponent() {
  return <FirestoreTabsLayout />
}
