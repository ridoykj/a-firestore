import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shadcn/components/ui/card"
import { Button } from "@/shadcn/components/ui/button"
import { Input } from "@/shadcn/components/ui/input"
import { useGcpStore } from '@/store/gcp-store'
import { FilePlus2, Play } from 'lucide-react'

export const Route = createFileRoute('/')({
    head: () => ({
        links: [
            { rel: "canonical", href: "https://leasedrop.ai/" }
        ],
    }),
    component: RouteComponent,
})

function RouteComponent() {
    const { setCredentialsFile, credentialsFile } = useGcpStore()
    const navigate = useNavigate()

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null
        setCredentialsFile(file)
    }

    const handleProceed = () => {
        if (credentialsFile) {
            navigate({ to: '/app' })
        }
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background/50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FilePlus2 className="h-5 w-5 text-primary" />
                        Google Cloud Setup
                    </CardTitle>
                    <CardDescription>
                        Upload your Google Cloud service account JSON file to begin.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Input
                            id="credentials"
                            type="file"
                            accept=".json"
                            onChange={handleUpload}
                            className="cursor-pointer"
                        />
                    </div>
                    <Button 
                        onClick={handleProceed} 
                        disabled={!credentialsFile} 
                        className="w-full gap-2"
                    >
                        Proceed to Dashboard <Play className="h-4 w-4" />
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
