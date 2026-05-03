import FirestorePage from '@/view/pages/firestore/FirestorePage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/firestore')({
  component: DocComponent,
})

function DocComponent() {
  return <FirestorePage />
}
