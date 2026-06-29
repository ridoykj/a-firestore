import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/shadcn/components/ui/empty"
import { Spinner } from "@/shadcn/components/ui/spinner"
import { CheckSquare, ChevronDown, ChevronRight, FileText, Folder, Square } from "lucide-react"
import type { ReactNode } from "react"

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
    expandedPaths: Set<string>
    selectedPaths: Set<string>
    onToggleExpand: (path: string, isLoaded: boolean) => void
    onToggleSelect: (path: string) => void
}

export function FirestoreSelectionTree({
    tree,
    expandedPaths,
    selectedPaths,
    onToggleExpand,
    onToggleSelect,
}: FirestoreSelectionTreeProps) {
    function renderTree(nodes: TreeNode[], depth = 0): ReactNode {
        return nodes.map((node) => {
            const isExpanded = expandedPaths.has(node.path)
            const isSelected = selectedPaths.has(node.path)

            return (
                <div key={node.path} className="flex flex-col">
                    <div
                        className="flex items-center rounded-md py-1 hover:bg-muted/50"
                        style={{ paddingLeft: `${depth * 1.25}rem` }}
                    >
                        <button
                            type="button"
                            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
                            onClick={() => onToggleExpand(node.path, node.isLoaded)}
                            aria-label={`Toggle ${node.name}`}
                        >
                            {node.isLoading ? (
                                <Spinner className="h-4 w-4" />
                            ) : isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>

                        <button
                            type="button"
                            className="mr-2 shrink-0 rounded-sm p-0.5 hover:bg-muted"
                            onClick={() => onToggleSelect(node.path)}
                            title={isSelected ? "Unselect" : "Select"}
                            aria-label={isSelected ? `Unselect ${node.name}` : `Select ${node.name}`}
                        >
                            {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>

                        <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-muted"
                            onClick={() => onToggleExpand(node.path, node.isLoaded)}
                        >
                            {node.type === "collection" ? (
                                <Folder className="h-4 w-4 shrink-0 text-blue-500" />
                            ) : (
                                <FileText className="h-4 w-4 shrink-0 text-orange-500" />
                            )}
                            <span className="truncate font-mono text-sm">{node.name}</span>
                        </button>
                    </div>

                    {isExpanded && node.children && renderTree(node.children, depth + 1)}
                </div>
            )
        })
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

    return <div className="flex flex-col p-2">{renderTree(tree)}</div>
}
