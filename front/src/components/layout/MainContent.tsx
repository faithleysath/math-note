import { useEffect, useState, useRef, useMemo, memo } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import MDEditor from '@uiw/react-md-editor';
import { getOrderedDescendants } from '../../lib/db';
import type { Node } from '../../lib/types';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { useNodeData } from '../../hooks/useNodeData';

type LightweightNode = Omit<Node, 'content' | 'solution'>;
type ProcessedLightweightNode = LightweightNode & { displayNumber: string; isChapter: boolean };

// =================================================================================
// Node Renderer Component
// =================================================================================
interface NodeRendererProps {
  node: ProcessedLightweightNode;
  measureElement: (element: HTMLElement | null) => void;
  virtualItem: VirtualItem;
}

const NodeRenderer = memo(({ node, measureElement, virtualItem }: NodeRendererProps) => {
  const { node: fullNode, loading } = useNodeData(node.id);

  const displayContent = useMemo(() => {
    if (loading || !fullNode) return '';
    if (node.isChapter) return '&emsp;' + fullNode.content;
    // Prepend the bolded number to the content for rendering
    return `&emsp;&emsp;**${node.displayNumber}**&emsp;${fullNode.content}`;
  }, [fullNode, loading, node.isChapter, node.displayNumber]);

  const getTitleClassName = () => {
    switch (node.type) {
      case '主章节':
        return 'text-3xl font-bold mt-4 mb-4 border-b pb-1';
      case '子章节':
        return 'text-2xl font-bold mt-1 mb-2 text-center';
      default:
        return 'text-xl font-bold mb-2 flex items-center';
    }
  };

  return (
    <div
      ref={measureElement}
      data-index={virtualItem.index}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${virtualItem.start}px)`,
      }}
      className="px-4 py-1.5 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
    >
      <>
        {node.isChapter && (
          <h2 className={getTitleClassName()}>
            <span className="font-bold mr-3">{node.displayNumber}</span>
            &nbsp;&nbsp;
            {node.title}
          </h2>
        )}
        <div className="text-base">
          <MDEditor.Markdown
            source={displayContent}
            style={{ whiteSpace: 'pre-wrap', backgroundColor: 'transparent' }}
          />
        </div>
      </>
    </div>
  );
});
NodeRenderer.displayName = 'NodeRenderer';


// =================================================================================
// Main Content Component
// =================================================================================
const MainContent = () => {
  const selectedNode = useAppStore(state => state.selectedNode);
  const expandedBranchId = useAppStore(state => state.expandedBranchId);
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

    return lightweightNodes.map((node) => {
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
  }, [expandedBranchId]);

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
        rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' });
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
            <NodeRenderer
              key={node.id}
              node={node}
              measureElement={rowVirtualizer.measureElement}
              virtualItem={virtualItem}
            />
          );
        })}
      </div>
    </div>
  );
};

export default MainContent;
