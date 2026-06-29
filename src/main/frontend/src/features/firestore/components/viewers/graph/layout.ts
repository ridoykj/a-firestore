import type { Edge, Node } from '@xyflow/react';
import { Position } from '@xyflow/react';
import dagre from 'dagre';

const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction, align: 'UL', nodesep: 40, ranksep: 80 });

  nodes.forEach((node) => {
    // Estimating node sizes since we don't know the exact DOM size yet.
    // In a real app, we might use useNodesInitialized and useReactFlow().getNodes() to relayout,
    // but a reasonable estimate works for mostly static hierarchies.
    let width = 400;
    let height = 50;

    if (node.type === 'dataNode') {
      const items = (node.data as Record<string, unknown>).items as unknown[];
      height = items ? Math.max(50, items.length * 24 + 16) : 50;
      width = 400;
    } else if (node.type === 'logicalNode') {
      width = 400;
      height = 40;
    }

    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};