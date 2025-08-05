import React, { useEffect, useState, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import MDEditor from '@uiw/react-md-editor';
import { getNodesByParent, getAllDescendants } from '../../lib/db';
import type { Node } from '../../lib/types';
import { useVirtualizer } from '@tanstack/react-virtual';

const MainContent = () => {
  const { selectedNode } = useAppContext();
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  // Fetch all nodes for the virtual list
  useEffect(() => {
    const fetchAllNodes = async () => {
      // We'll fetch all descendants of the first root node for this demo
      const rootNodes = await getNodesByParent(null);
      if (rootNodes.length > 0) {
        const nodes = await getAllDescendants(rootNodes[0].id);
        // We remove the root node itself from the list to only show content
        setAllNodes(nodes.slice(1));
      }
    };
    fetchAllNodes();
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: allNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimate size of each item
    overscan: 5,
  });

  // Scroll to the selected node
  useEffect(() => {
    if (selectedNode) {
      const index = allNodes.findIndex(node => node.id === selectedNode.id);
      if (index !== -1) {
        rowVirtualizer.scrollToIndex(index, { align: 'start' });
      }
    }
  }, [selectedNode, allNodes, rowVirtualizer]);

  if (allNodes.length === 0) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <p className="text-muted-foreground">No content to display.</p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualItem => {
          const node = allNodes[virtualItem.index];
          return (
            <div
              key={node.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="p-4 border-b"
            >
              <h2 className="text-xl font-bold mb-2">{node.title}</h2>
              <div data-color-mode="light">
                <MDEditor.Markdown source={node.content} style={{ whiteSpace: 'pre-wrap' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MainContent;
