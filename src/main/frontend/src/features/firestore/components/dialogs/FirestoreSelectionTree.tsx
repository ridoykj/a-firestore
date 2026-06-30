import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { Spinner } from "@/shadcn/components/ui/spinner"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/shadcn/components/ui/breadcrumb"
import { CheckSquare, ChevronRight, FileText, Folder, Home, Square } from "lucide-react"
import React from "react"

export interface TreeNode {
    path: string
    name: string
    type: "collection" | "document"
    children?: TreeNode[]
    isLoaded: boolean
    isLoading: boolean
}

interface FirestoreSelectionTreeProps {
    tree: TreeNode[]
    currentPath: string
    selectedPaths: Set<string>
    isTreeLoading?: boolean
    onNavigate: (path: string, isLoaded: boolean) => void
    onToggleSelect: (path: string) => void
}

function findNodeByPath(nodes: TreeNode[], targetPath: string): TreeNode | undefined {
    for (const node of nodes) {
        if (node.path === targetPath) {
            return node
        }
        if (node.children) {
            const found = findNodeByPath(node.children, targetPath)
            if (found) return found
        }
    }
    return undefined
}

export function FirestoreSelectionTree({
    tree,
    currentPath,
    selectedPaths,
    isTreeLoading,
    onNavigate,
    onToggleSelect,
}: FirestoreSelectionTreeProps) {
    const activeNode = currentPath ? findNodeByPath(tree, currentPath) : undefined
    const displayNodes = activeNode?.children ?? (currentPath === "" ? tree : [])

    function renderBreadcrumb() {
        const segments = currentPath.split("/").filter(Boolean)

        return (
            <Breadcrumb className="mb-4 sticky top-0 bg-background z-10 py-2 px-1">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        {segments.length === 0 ? (
                            <BreadcrumbPage className="flex items-center gap-1">
                                <Home className="h-4 w-4" /> Root
                            </BreadcrumbPage>
                        ) : (
                            <BreadcrumbLink
                                asChild
                                className="cursor-pointer flex items-center gap-1"
                                onClick={() => onNavigate("", true)}
                            >
                                <span><Home className="h-4 w-4" /> Root</span>
                            </BreadcrumbLink>
                        )}
                    </BreadcrumbItem>
                    
                    {segments.length > 0 && <BreadcrumbSeparator />}
                    
                    {segments.map((segment, index) => {
                        const path = segments.slice(0, index + 1).join("/")
                        const isLast = index === segments.length - 1

                        return (
                            <React.Fragment key={path}>
                                <BreadcrumbItem>
                                    {isLast ? (
                                        <BreadcrumbPage>{segment}</BreadcrumbPage>
                                    ) : (
                                        <BreadcrumbLink
                                            asChild
                                            className="cursor-pointer"
                                            onClick={() => {
                                                const node = findNodeByPath(tree, path)
                                                onNavigate(path, node?.isLoaded ?? false)
                                            }}
                                        >
                                            <span>{segment}</span>
                                        </BreadcrumbLink>
                                    )}
                                </BreadcrumbItem>
                                {!isLast && <BreadcrumbSeparator />}
                            </React.Fragment>
                        )
                    })}
                </BreadcrumbList>
            </Breadcrumb>
        )
    }

    if (tree.length === 0) {
        return (
            <Empty className="flex h-full flex-col items-center justify-center border-none p-4">
                <EmptyHeader>
                    <EmptyTitle>No paths loaded yet</EmptyTitle>
                    <EmptyDescription>Load root collections or a Firebase path to start selecting.</EmptyDescription>
                </EmptyHeader>
            </Empty>
        )
    }

    return (
        <div className="flex flex-col flex-1 h-full p-2 relative">
            {renderBreadcrumb()}
            
            <div className="flex flex-col flex-1 gap-1 border-t pt-2">
                {isTreeLoading || activeNode?.isLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12 min-h-[150px]">
                        <Spinner className="h-12 w-12 text-primary" />
                    </div>
                ) : (
                    <>
                {displayNodes.map((node) => {
                    const isSelected = selectedPaths.has(node.path)

                    return (
                        <div
                            key={node.path}
                            className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 group cursor-pointer"
                            onClick={() => onNavigate(node.path, node.isLoaded)}
                        >
                            <div className="flex items-center min-w-0 flex-1">
                                <button
                                    type="button"
                                    className="mr-2 shrink-0 rounded-sm p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onToggleSelect(node.path)
                                    }}
                                    title={isSelected ? "Unselect" : "Select"}
                                    aria-label={isSelected ? `Unselect ${node.name}` : `Select ${node.name}`}
                                >
                                    {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />}
                                </button>

                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {node.type === "collection" ? (
                                        <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                                    ) : (
                                        <FileText className="h-4 w-4 shrink-0 text-orange-500" />
                                    )}
                                    <span className="truncate font-mono text-sm">{node.name}</span>
                                </div>
                            </div>

                            <div className="shrink-0 ml-2">
                                {node.isLoading ? (
                                    <Spinner className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                            </div>
                        </div>
                    )
                })}
                {displayNodes.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        No children found.
                    </div>
                )}
                    </>
                )}
            </div>
        </div>
    )
}
