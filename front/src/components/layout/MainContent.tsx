import { useEffect, useState, useRef, useMemo } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { getOrderedDescendants } from '../../lib/db';
import type { LightweightNode, ProcessedLightweightNode } from '../../lib/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import NodeRenderer from '../renderers/NodeRenderer';
import { Button } from '../ui/button';
import { Edit2 } from 'lucide-react';

// =================================================================================
// Main Content Component
// =================================================================================
const MainContent = () => {
  const selectedNode = useAppStore(state => state.selectedNode);
  const expandedBranchId = useAppStore(state => state.expandedBranchId);
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const setEditingNodeId = useAppStore(state => state.setEditingNodeId);
  const dataVersion = useAppStore(state => state.dataVersion);
  const [lightweightNodes, setLightweightNodes] = useState<LightweightNode[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  // Pre-process lightweight nodes to add display numbers
  const processedLightweightNodes = useMemo((): ProcessedLightweightNode[] => {
    if (!lightweightNodes.length) return [];

    const majorCounters: { [key: string]: number } = {};
    const minorCounters: { [key: string]: number } = {};
    const contentCounters: { [key: string]: { [key: string]: number } } = {};
    
    let currentMajorPrefix = '';
    let currentMinorPrefix = '';

    return lightweightNodes.filter(node => !['解题记录'].includes(node.type)).map((node) => {
      let displayNumber = '';
      const isChapter = ['主章节', '子章节'].includes(node.type);

      switch (node.type) {
        case '主章节':
          majorCounters[node.parentId!] = (majorCounters[node.parentId!] || 0) + 1;
          currentMajorPrefix = `${majorCounters[node.parentId!]}`;
          displayNumber = `第 ${currentMajorPrefix} 章`;
          break;
        case '子章节':
          minorCounters[node.parentId!] = (minorCounters[node.parentId!] || 0) + 1;
          currentMinorPrefix = `${currentMajorPrefix}.${minorCounters[node.parentId!]}`;
          displayNumber = `§ ${currentMinorPrefix}`;
          break;
        case '定义':
        case '定理':
        case '例题': {
          if (!contentCounters[node.type]) {
            contentCounters[node.type] = {};
          }
          contentCounters[node.type][node.parentId!] = (contentCounters[node.type][node.parentId!] || 0) + 1;
          displayNumber = `${node.type} ${currentMinorPrefix}.${contentCounters[node.type][node.parentId!]}`;
          break;
        }
        default:
          break;
      }
      return { ...node, displayNumber, isChapter };
    });
  }, [lightweightNodes]);

  // Fetch lightweight nodes when the expanded branch changes
  useEffect(() => {
    const fetchBranchContent = async () => {
      if (expandedBranchId) {
        const nodes = await getOrderedDescendants(expandedBranchId);
        // We remove the root node itself from the list to only show content
        setLightweightNodes(nodes.slice(1));
      } else {
        setLightweightNodes([]); // Clear content if no branch is expanded
      }
    };
    fetchBranchContent();
  }, [expandedBranchId, dataVersion]);

  const rowVirtualizer = useVirtualizer({
    count: processedLightweightNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  // Scroll to the selected node
  useEffect(() => {
    if (selectedNode) {
      const index = processedLightweightNodes.findIndex(node => node.id === selectedNode.id);
      if (index !== -1) {
        rowVirtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      }
    }
  }, [selectedNode, processedLightweightNodes, rowVirtualizer]);

  if (!expandedBranchId || processedLightweightNodes.length === 0) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <p className="text-muted-foreground">展开一个分支以查看其内容。</p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualItem => {
          const node = processedLightweightNodes[virtualItem.index];
          return (
            <div
              key={node.id}
              ref={rowVirtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="group relative px-4 py-1.5 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setSelectedNodeById(node.id)}
            >
              <NodeRenderer node={node} />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent the div's onClick from firing
                  setEditingNodeId(node.id);
                }}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MainContent;
