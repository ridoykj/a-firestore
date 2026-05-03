import { cn } from '@/shadcn/lib/utils';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';
import type { DataNodeData } from './jsonToGraph';

export const DataNode = memo(({ data }: { data: DataNodeData }) => {
  return (
    <div className="bg-[#1a1c23] border border-[#3a3f4e] rounded-md shadow-md max-w-[400px] overflow-hidden font-mono text-xs">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      
      <div className="flex flex-col p-2 max-h-75 overflow-y-auto no-scrollbar">
        {data.items.map((item, idx) => {
          const isComplex = item.type === 'object' || item.type === 'array';
          
          return (
            <div key={idx} className="flex leading-6 gap-2 hover:bg-white/5 px-1 rounded-sm min-w-0">
              <span className="text-[#61afef] font-medium shrink-0 truncate max-w-56" title={item.key}>
                {item.key}
                <span className="text-muted-foreground font-normal ml-0.5">:</span>
              </span>
              
              <span 
                className={cn(
                  "truncate min-w-0 flex-1",
                  item.type === 'string' && "text-[#98c379]",
                  item.type === 'number' && "text-[#d19a66]",
                  (item.type === 'boolean' || item.type === 'null') && "text-[#56b6c2]",
                  isComplex && "text-muted-foreground font-medium"
                )}
                title={item.type === 'string' ? `"${item.value}"` : item.value}
              >
                {item.type === 'string' ? `"${item.value}"` : item.value}
              </span>
            </div>
          );
        })}
      </div>

      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
});