import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { LogicalNodeData } from './jsonToGraph';
import { Link2 } from 'lucide-react'; // close enough to a chain link

export const LogicalNode = memo(({ data }: { data: LogicalNodeData }) => {
  return (
    <div className="bg-[#1a1c23] border border-[#3a3f4e] rounded-md shadow-md flex items-center justify-between p-1.5 px-3 gap-2 max-w-[400px] font-mono text-xs">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <span className="text-[#e5c07b] font-medium truncate" title={data.label}>{data.label}</span>
        <span className="text-white/60 shrink-0">
          {data.type === 'array' ? `[${data.size}]` : `{${data.size}}`}
        </span>
      </div>

      <div className="bg-[#2a2d37] hover:bg-[#3b3f4c] cursor-pointer rounded p-1 transition-colors border border-white/5 shrink-0">
        <Link2 className="size-3 text-white/80" />
      </div>

      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
});