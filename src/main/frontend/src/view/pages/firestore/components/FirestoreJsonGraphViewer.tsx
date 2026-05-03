import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  Panel,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import {
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Sun,
  ChevronDown,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { jsonToGraph } from './graph/jsonToGraph';
import { getLayoutedElements } from './graph/layout';
import { DataNode } from './graph/DataNode';
import { LogicalNode } from './graph/LogicalNode';
import { Input } from '@/shadcn/components/ui/input';
import { Button } from '@/shadcn/components/ui/button';

const nodeTypes = {
  dataNode: DataNode,
  logicalNode: LogicalNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: '#4b5563',
  },
  style: {
    strokeWidth: 2,
    stroke: '#4b5563',
  },
};

function FlowComponent({ draft }: { draft: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const { setTheme, theme } = useTheme();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  useEffect(() => {
    try {
      const parsed = JSON.parse(draft);
      const { nodes: initialNodes, edges: initialEdges } = jsonToGraph(parsed);
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        initialNodes,
        initialEdges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      
      // Delay fit view to allow rendering
      setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 50);
    } catch (e) {
      // invalid json, keep previous or clear
    }
  }, [draft, setNodes, setEdges, fitView]);

  // Handle Search Filtering logic (Basic highlighting)
  useEffect(() => {
    if (!searchTerm) {
      setNodes((nds) => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
      return;
    }
    
    const lowerSearch = searchTerm.toLowerCase();
    setNodes((nds) =>
      nds.map((n) => {
        let matches = false;
        if (n.type === 'dataNode') {
          const items = (n.data as Record<string, any>).items as any[];
          matches = items.some(
            (i) =>
              i.key.toLowerCase().includes(lowerSearch) ||
              String(i.value).toLowerCase().includes(lowerSearch)
          );
        } else if (n.type === 'logicalNode') {
          matches = String((n.data as Record<string, any>).label).toLowerCase().includes(lowerSearch);
        }

        return {
          ...n,
          style: {
            ...(n.style || {}),
            opacity: matches ? 1 : 0.2,
          },
        };
      })
    );
  }, [searchTerm, setNodes]);

  const onDownload = () => {
    const el = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (el) {
      toPng(el, {
        backgroundColor: '#1e1e1e',
      }).then((dataUrl) => {
        const a = document.createElement('a');
        a.setAttribute('download', 'json-graph.png');
        a.setAttribute('href', dataUrl);
        a.click();
      });
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] rounded-md overflow-hidden relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        defaultEdgeOptions={defaultEdgeOptions}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }} // standard to hide logo in custom tools if permitted, but let's just keep proOptions to clean up
      >
        <Background color="#333" gap={16} />
        
        <Panel position="top-right" className="flex items-center gap-2 p-4">
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Node"
            className="w-48 bg-[#252526] border-[#3e3e42] text-white placeholder:text-gray-500 h-8 text-xs rounded-md focus-visible:ring-1 focus-visible:ring-gray-500"
          />
          
          <div className="flex items-center gap-1 bg-[#252526] border border-[#3e3e42] rounded-md p-1 shadow-sm text-gray-400">
            <Button variant="ghost" size="icon-xs" className="hover:text-white hover:bg-white/10 h-6 w-6" onClick={onDownload}>
              <Download className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="hover:text-white hover:bg-white/10 h-6 w-6" onClick={() => zoomIn()}>
              <ZoomIn className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="hover:text-white hover:bg-white/10 h-6 w-6" onClick={() => zoomOut()}>
              <ZoomOut className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="hover:text-white hover:bg-white/10 h-6 w-6" onClick={() => fitView({ padding: 0.2 })}>
              <Maximize className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="hover:text-white hover:bg-white/10 h-6 w-6" onClick={toggleTheme}>
              <Sun className="size-3.5" />
            </Button>
            
            <div className="w-px h-4 bg-[#3e3e42] mx-1" />
            
            <Button variant="ghost" size="sm" className="hover:text-white hover:bg-white/10 h-6 text-xs px-2 flex items-center gap-1">
              Shortcuts <ChevronDown className="size-3" />
            </Button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function FirestoreJsonGraphViewer({ draft }: { draft: string }) {
  return (
    <ReactFlowProvider>
      <FlowComponent draft={draft} />
    </ReactFlowProvider>
  );
}