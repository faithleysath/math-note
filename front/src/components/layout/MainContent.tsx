import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import MDEditor from '@uiw/react-md-editor';
import { getAllDescendants } from '../../lib/db';
import type { Node } from '../../lib/types';
import { useVirtualizer } from '@tanstack/react-virtual';

type ProcessedNode = Node & { displayNumber: string; displayContent: string; isChapter: boolean };

const MainContent = () => {
  const { selectedNode, expandedBranchId } = useAppContext();
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  // Add display numbers and content to nodes
  const processedNodes = useMemo(() => {
    if (!allNodes.length) return [];

    const majorCounters: { [key: string]: number } = {};
    const minorCounters: { [key: string]: number } = {};
    const contentCounters: { [key: string]: { [key: string]: number } } = {};
    
    let currentMajorPrefix = '';
    let currentMinorPrefix = '';

    return allNodes.map((node): ProcessedNode => {
      let displayNumber = '';
      let displayContent = node.content;
      const isChapter = ['MajorChapter', 'MinorChapter'].includes(node.type);

      switch (node.type) {
        case 'MajorChapter':
          majorCounters[node.parentId!] = (majorCounters[node.parentId!] || 0) + 1;
          currentMajorPrefix = `${majorCounters[node.parentId!]}`;
          displayNumber = `第 ${currentMajorPrefix} 章`;
          break;
        case 'MinorChapter':
          minorCounters[node.parentId!] = (minorCounters[node.parentId!] || 0) + 1;
          currentMinorPrefix = `${currentMajorPrefix}.${minorCounters[node.parentId!]}`;
          displayNumber = `§ ${currentMinorPrefix}`;
          break;
        case 'Definition':
        case 'Theorem':
        case 'Example': {
          const typeTranslations: { [key: string]: string } = {
            Definition: '定义',
            Theorem: '定理',
            Example: '例题',
          };
          const translatedType = typeTranslations[node.type] || node.type;
          if (!contentCounters[node.type]) {
            contentCounters[node.type] = {};
          }
          contentCounters[node.type][node.parentId!] = (contentCounters[node.type][node.parentId!] || 0) + 1;
          displayNumber = `${translatedType} ${currentMinorPrefix}.${contentCounters[node.type][node.parentId!]}`;
          // Prepend the bolded number to the content for rendering
          displayContent = `**${displayNumber}**    ${node.content}`;
          break;
        }
        default:
          break;
      }
      return { ...node, displayNumber, displayContent, isChapter };
    });
  }, [allNodes]);

  // Fetch nodes for the virtual list when the expanded branch changes
  useEffect(() => {
    const fetchBranchContent = async () => {
      if (expandedBranchId) {
        const nodes = await getAllDescendants(expandedBranchId);
        // We remove the root node itself from the list to only show content
        setAllNodes(nodes.slice(1));
      } else {
        setAllNodes([]); // Clear content if no branch is expanded
      }
    };
    fetchBranchContent();
  }, [expandedBranchId]);

  const rowVirtualizer = useVirtualizer({
    count: processedNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Revert to a static estimate, measurement will correct it
    overscan: 5,
  });

  // Scroll to the selected node
  useEffect(() => {
    if (selectedNode) {
      const index = processedNodes.findIndex(node => node.id === selectedNode.id);
      if (index !== -1) {
        rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' });
      }
    }
  }, [selectedNode, processedNodes, rowVirtualizer]);

  if (!expandedBranchId || processedNodes.length === 0) {
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
          const node = processedNodes[virtualItem.index];
          
          const getTitleClassName = () => {
            switch (node.type) {
              case 'MajorChapter':
                return 'text-3xl font-bold mt-4 mb-2 border-b pb-1';
              case 'MinorChapter':
                return 'text-2xl font-bold mt-1 mb-1';
              default:
                return 'text-xl font-bold mb-2 flex items-center';
            }
          };

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
              className="px-4 py-1" // Removed py-2
            >
              {node.isChapter && (
                <h2 className={getTitleClassName()}>
                  <span className="font-bold mr-3">{node.displayNumber}</span>
                  {node.title}
                </h2>
              )}
              <div data-color-mode="light" className="text-base">
                <MDEditor.Markdown source={node.displayContent} style={{ whiteSpace: 'pre-wrap' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MainContent;
