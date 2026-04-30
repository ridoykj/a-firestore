import { createFileRoute } from '@tanstack/react-router';
import FirestorePage from '../view/pages/firestore/FirestorePage';

export const Route = createFileRoute('/')({
    head: () => ({
        links: [
            { rel: "canonical", href: "https://leasedrop.ai/" }
        ],
    }),
    component: RouteComponent,
})

function RouteComponent() {
    return <FirestorePage/>
}