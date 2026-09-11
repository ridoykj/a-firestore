import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/shadcn/components/ui/breadcrumb"
import { Button } from "@/shadcn/components/ui/button"
import { Checkbox } from "@/shadcn/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { ScrollArea } from "@/shadcn/components/ui/scroll-area"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { ChevronRight, FileText, Folder, Home, LayoutGrid, List } from "lucide-react"
import React, { useCallback, useEffect, useRef, useState } from "react"

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
        [activeNode, currentPath, onLoadMore]
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
            <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5 sticky top-0 z-10">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            {segments.length === 0 ? (
                                <BreadcrumbPage className="flex items-center gap-1">
                                    <Home className="h-4 w-4" /> Root
                                </BreadcrumbPage>
                            ) : (
                                <BreadcrumbLink
                                    className="cursor-pointer flex items-center gap-1"
                                    onPress={() => onNavigate("", true)}
                                >
                                    <Home className="h-4 w-4" /> Root
                                </BreadcrumbLink>
                            )}
                        </BreadcrumbItem>

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
                                                className="cursor-pointer"
                                                onPress={() => {
                                                    const node = findNodeByPath(tree, path)
                                                    onNavigate(path, node?.isLoaded ?? false)
                                                }}
                                            >
                                                {segment}
                                            </BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                </React.Fragment>
                            )
                        })}
                    </BreadcrumbList>
                </Breadcrumb>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                    <span title="List View">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onPress={() => setViewMode("list")}
                            className={viewMode === "list" ? "bg-background shadow-sm text-foreground hover:bg-background" : "text-muted-foreground"}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </span>
                    <span title="Grid View">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onPress={() => setViewMode("grid")}
                            className={viewMode === "grid" ? "bg-background shadow-sm text-foreground hover:bg-background" : "text-muted-foreground"}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                    </span>
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
        <div className="flex flex-col flex-1 h-full relative min-h-0">
            {renderBreadcrumb()}

            <ScrollArea className="flex-1 min-h-0 p-2">
                {isTreeLoading || activeNode?.isLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12 min-h-37.5">
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
                                    <span
                                        onClick={(e) => e.stopPropagation()}
                                        title={isSelected ? "Unselect" : "Select"}
                                        className="absolute top-2 left-2"
                                    >
                                        <Checkbox
                                            isSelected={isSelected}
                                            onChange={() => onToggleSelect(node.path)}
                                            className={`shrink-0 ${isSelected ? "" : "opacity-50 group-hover:opacity-100"}`}
                                            aria-label={isSelected ? `Unselect ${node.name}` : `Select ${node.name}`}
                                        />
                                    </span>

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
                                        <span
                                            onClick={(e) => e.stopPropagation()}
                                            title={isSelected ? "Unselect" : "Select"}
                                        >
                                            <Checkbox
                                                isSelected={isSelected}
                                                onChange={() => onToggleSelect(node.path)}
                                                className="mr-2 shrink-0"
                                                aria-label={isSelected ? `Unselect ${node.name}` : `Select ${node.name}`}
                                            />
                                        </span>

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
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onPress={() => onLoadMore?.(currentPath)}
                                        className="text-muted-foreground hover:text-primary"
                                    >
                                        Scroll or click to load more
                                    </Button>
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