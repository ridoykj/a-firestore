import type { Edge, Node } from '@xyflow/react';

export type JsonItemType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface DataNodeItem {
  key: string;
  value: string;
  type: JsonItemType;
  size?: number;
}

export interface DataNodeData extends Record<string, unknown> {
  items: DataNodeItem[];
  path: string;
}

export interface LogicalNodeData extends Record<string, unknown> {
  label: string;
  type: 'object' | 'array';
  size: number;
  path: string;
}

interface ParserContext {
  nodes: Node[];
  edges: Edge[];
  idCounter: number;
}

function detectType(value: unknown): JsonItemType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  return 'boolean';
}

function getSize(value: unknown, type: JsonItemType): number {
  if (type === 'array') return (value as unknown[]).length;
  if (type === 'object') return Object.keys(value as Record<string, unknown>).length;
  return 0;
}

export function jsonToGraph(json: unknown): { nodes: Node[]; edges: Edge[] } {
  const context: ParserContext = {
    nodes: [],
    edges: [],
    idCounter: 0,
  };

  if (json !== null && typeof json === 'object') {
    parseDataNode('root', json, '$', null, context);
  } else {
    // If root is primitive, just wrap it in a data node
    const type = detectType(json);
    context.nodes.push({
      id: 'root',
      type: 'dataNode',
      position: { x: 0, y: 0 },
      data: {
        path: '$',
        items: [{ key: 'value', value: String(json), type }],
      },
    });
  }

  return { nodes: context.nodes, edges: context.edges };
}

function parseDataNode(
  _label: string,
  data: unknown,
  path: string,
  parentId: string | null,
  context: ParserContext
): string {
  const nodeId = `data-${context.idCounter++}`;
  const items: DataNodeItem[] = [];

  const type = detectType(data);
  let entries: [string, unknown][] = [];

  if (type === 'object') {
    entries = Object.entries(data as Record<string, unknown>);
    
    // Sort object keys by type (string, number, bool/null, array, object), then alphabetically
    const typeOrder: Record<JsonItemType, number> = {
      string: 1,
      number: 2,
      boolean: 3,
      null: 3, // Group null with boolean
      array: 4,
      object: 5,
    };

    entries.sort((a, b) => {
      const typeA = detectType(a[1]);
      const typeB = detectType(b[1]);
      
      const orderA = typeOrder[typeA] ?? 99;
      const orderB = typeOrder[typeB] ?? 99;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      return a[0].localeCompare(b[0]);
    });
  } else if (type === 'array') {
    entries = (data as unknown[]).map((val, idx) => [String(idx), val]);
  } else {
    items.push({ key: 'value', value: String(data), type });
  }

  const complexEntries: [string, unknown, JsonItemType, number][] = [];

  for (const [key, val] of entries) {
    const valType = detectType(val);
    if (valType === 'object' || valType === 'array') {
      const size = getSize(val, valType);
      items.push({
        key,
        value: valType === 'array' ? `[${size}]` : `{${size}}`,
        type: valType,
        size,
      });
      complexEntries.push([key, val, valType, size]);
    } else {
      items.push({
        key,
        value: String(val),
        type: valType,
      });
    }
  }

  context.nodes.push({
    id: nodeId,
    type: 'dataNode',
    position: { x: 0, y: 0 },
    data: { path, items } as DataNodeData,
  });

  if (parentId) {
    context.edges.push({
      id: `e-${parentId}-${nodeId}`,
      source: parentId,
      target: nodeId,
      type: 'smoothstep', // We will use a custom bezier/smooth edge later
    });
  }

  // Generate logical nodes for complex entries
  for (const [key, val, valType, size] of complexEntries) {
    const logicalNodeId = `logical-${context.idCounter++}`;
    const childPath = `${path}.${key}`;
    
    context.nodes.push({
      id: logicalNodeId,
      type: 'logicalNode',
      position: { x: 0, y: 0 },
      data: { label: key, type: valType, size, path: childPath } as LogicalNodeData,
    });

    context.edges.push({
      id: `e-${nodeId}-${logicalNodeId}`,
      source: nodeId,
      target: logicalNodeId,
      type: 'smoothstep',
    });

    // If it's an array, each item becomes a DataNode connected to this LogicalNode
    // If it's an object, it becomes a single DataNode connected to this LogicalNode
    if (valType === 'array') {
      const arr = val as unknown[];
      arr.forEach((item, idx) => {
        parseDataNode(String(idx), item, `${childPath}[${idx}]`, logicalNodeId, context);
      });
    } else {
      parseDataNode(key, val, childPath, logicalNodeId, context);
    }
  }

  return nodeId;
}
