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
import { CheckSquare, ChevronRight, FileText, Folder, Home, LayoutGrid, List, Square } from "lucide-react"
import React, { useState, useRef, useEffect, useCallback } from "react"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"

export interface TreeNode {
    path: string
    name: string
    type: "collection" | "document"
    children?: TreeNode[]
    isLoaded: boolean
    isLoading: boolean
    hasMore?: boolean
    nextCursor?: string | null
    isLoadingMore?: boolean
}

interface FirestoreSelectionTreeProps {
    tree: TreeNode[]
    currentPath: string
    selectedPaths: Set<string>
    isTreeLoading?: boolean
    onNavigate: (path: string, isLoaded: boolean) => void
    onToggleSelect: (path: string) => void
    onLoadMore?: (path: string) => void
}

export function findNodeByPath(nodes: TreeNode[], targetPath: string): TreeNode | undefined {
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
    onLoadMore,
}: FirestoreSelectionTreeProps) {
    const [viewMode, setViewMode] = useState<"list" | "grid">("list")
    const activeNode = currentPath ? findNodeByPath(tree, currentPath) : undefined
    const displayNodes = activeNode?.children ?? (currentPath === "" ? tree : [])

    const observerTarget = useRef<HTMLDivElement>(null)

    const handleObserver = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [target] = entries
            if (target.isIntersecting && activeNode?.hasMore && !activeNode.isLoadingMore) {
                onLoadMore?.(currentPath)
            }
        },
        [activeNode?.hasMore, activeNode?.isLoadingMore, currentPath, onLoadMore]
    )

    useEffect(() => {
        const element = observerTarget.current
        const option = { threshold: 0.1 }

        const observer = new IntersectionObserver(handleObserver, option)
        if (element) observer.observe(element)

        return () => {
            if (element) observer.unobserve(element)
        }
    }, [handleObserver])

    function renderBreadcrumb() {
        const segments = currentPath.split("/").filter(Boolean)

        return (
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-background z-10 py-2 px-1">
                <Breadcrumb>
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
                <div className="flex items-center gap-1 shrink-0 ml-4">
                    <button
                        type="button"
                        onClick={() => setViewMode("list")}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                        title="List View"
                    >
                        <List className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode("grid")}
                        className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                        title="Grid View"
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </button>
                </div>
            </div>
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
        <div className="flex flex-col flex-1 h-full p-2 relative min-h-0">
            {renderBreadcrumb()}

            <ScrollArea className="flex-1 min-h-0 border-t pt-2">
                {isTreeLoading || activeNode?.isLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12 min-h-[150px]">
                        <Spinner className="h-12 w-12 text-primary" />
                    </div>
                ) : (
                    <div className={viewMode === "grid" ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2" : "flex flex-col gap-1"}>
                        {displayNodes.map((node) => {
                            const isSelected = selectedPaths.has(node.path)

                            return viewMode === "grid" ? (
                                <div
                                    key={node.path}
                                    className="flex flex-col items-center justify-center gap-2 rounded-lg border p-3 hover:bg-muted/50 group cursor-pointer relative"
                                    onClick={() => onNavigate(node.path, node.isLoaded)}
                                >
                                    <button
                                        type="button"
                                        className="absolute top-2 left-2 shrink-0 rounded-sm p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onToggleSelect(node.path)
                                        }}
                                        title={isSelected ? "Unselect" : "Select"}
                                    >
                                        {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground opacity-50 group-hover:opacity-100" />}
                                    </button>

                                    {node.type === "collection" ? (
                                        <Folder className="h-8 w-8 text-blue-500" />
                                    ) : (
                                        <FileText className="h-8 w-8 text-orange-500" />
                                    )}

                                    <span className="truncate w-full text-center font-mono text-xs" title={node.name}>
                                        {node.name}
                                    </span>
                                </div>
                            ) : (
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

                        {activeNode?.hasMore && (
                            <div ref={observerTarget} className="col-span-full flex justify-center py-4">
                                {activeNode.isLoadingMore ? (
                                    <Spinner className="h-6 w-6 text-primary" />
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onLoadMore?.(currentPath)}
                                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                                    >
                                        Scroll or click to load more
                                    </button>
                                )}
                            </div>
                        )}

                        {displayNodes.length === 0 && (
                            <div className="py-8 col-span-full text-center text-sm text-muted-foreground">
                                No children found.
                            </div>
                        )}
                    </div>
                )}
            </ScrollArea>
        </div>
    )
}