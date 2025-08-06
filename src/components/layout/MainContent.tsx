import { useEffect, useState, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../../stores/useAppStore';
import { getOrderedDescendants, getNode, deleteNode, updateNode } from '../../lib/db';
import type { ProcessedNode } from '../../lib/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import NodeRenderer from '../renderers/NodeRenderer';
import { Button } from '../ui/button';
import { Edit2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import AddNodeDialog from '../AddNodeDialog';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import type { Node } from '../../lib/types';

// =================================================================================
// Main Content Component
// =================================================================================
const MainContent = () => {
  const selectedNode = useAppStore(state => state.selectedNode);
  const expandedBranchId = useAppStore(state => state.expandedBranchId);
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const setEditingNodeId = useAppStore(state => state.setEditingNodeId);
  const triggerStructureRefresh = useAppStore(state => state.triggerStructureRefresh);
  const structureVersion = useAppStore(state => state.structureVersion);
  const editingNodeId = useAppStore(state => state.editingNodeId);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parentNode, setParentNode] = useState<Node | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [insertAfterNodeId, setInsertAfterNodeId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const handleAddClick = async (nodeId: string) => {
    const fullParentNode = await getNode(nodeId);
    if (fullParentNode) {
      setParentNode(fullParentNode);
      setInsertAfterNodeId(null); // This is for adding a child
      setAddDialogOpen(true);
    } else {
      console.error("Could not find parent node to add child to.");
    }
  };

  const handleInsertSiblingClick = async (currentNode: Node) => {
    if (!currentNode.parentId) {
      console.error("Cannot add a sibling to a root node.");
      return;
    }
    const fullParentNode = await getNode(currentNode.parentId);
    if (fullParentNode) {
      setParentNode(fullParentNode);
      setInsertAfterNodeId(currentNode.id); // This is for adding a sibling
      setAddDialogOpen(true);
    } else {
      console.error("Could not find parent node to insert sibling.");
    }
  };

  const handleDeleteClick = async (nodeId: string) => {
    const fullNodeToDelete = await getNode(nodeId);
    if (fullNodeToDelete) {
      setNodeToDelete(fullNodeToDelete);
      setDeleteDialogOpen(true);
    } else {
      console.error("Could not find node to delete.");
    }
  };

  const confirmDelete = async () => {
    if (nodeToDelete) {
      try {
        // If the node being deleted is the currently selected one, unselect it.
        if (selectedNode && selectedNode.id === nodeToDelete.id) {
          setSelectedNodeById(null);
        }
        await deleteNode(nodeToDelete.id);
        toast.success(`节点 "${nodeToDelete.title}" 已被删除。`);
        triggerStructureRefresh();
      } catch (error) {
        console.error("Failed to delete node:", error);
        toast.error('删除节点失败。');
      } finally {
        setNodeToDelete(null);
        setDeleteDialogOpen(false);
      }
    }
  };

  const handleMove = async (nodeId: string, direction: 'up' | 'down') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.parentId) return;

    const parent = await getNode(node.parentId);
    if (!parent) return;

    const index = parent.children.indexOf(nodeId);
    if (index === -1) return;

    const newChildren = [...parent.children];
    if (direction === 'up' && index > 0) {
      [newChildren[index - 1], newChildren[index]] = [newChildren[index], newChildren[index - 1]];
    } else if (direction === 'down' && index < newChildren.length - 1) {
      [newChildren[index], newChildren[index + 1]] = [newChildren[index + 1], newChildren[index]];
    } else {
      return; // Cannot move further
    }

    try {
      await updateNode(parent.id, { children: newChildren });
      triggerStructureRefresh();
      toast.success('节点顺序已更新。');
    } catch (error) {
      console.error("Failed to move node:", error);
      toast.error('移动节点失败。');
    }
  };

  // Pre-process nodes to add display numbers
  const processedNodes = useMemo((): ProcessedNode[] => {
    if (!nodes.length) return [];

    const majorCounters: { [key: string]: number } = {};
    const minorCounters: { [key: string]: number } = {};
    const contentCounters: { [key: string]: { [key: string]: number } } = {};
    
    let currentMajorPrefix = '';
    let currentMinorPrefix = '';

    return nodes.map((node) => {
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
        case '引理':
        case '推论':
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
  }, [nodes]);

  // Hotkeys for navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (editingNodeId) return; // Don't navigate while editing

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const currentIndex = selectedNode ? processedNodes.findIndex(n => n.id === selectedNode.id) : -1;
        
        let nextIndex = -1;
        if (event.key === 'j') { // Move down
          nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, processedNodes.length - 1);
        } else { // Move up
          nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
        }

        if (nextIndex !== -1 && processedNodes[nextIndex]) {
          setSelectedNodeById(processedNodes[nextIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNode, processedNodes, editingNodeId, setSelectedNodeById]);

  // Fetch nodes when the expanded branch changes
  useEffect(() => {
    const fetchBranchContent = async () => {
      if (expandedBranchId) {
        const fetchedNodes = await getOrderedDescendants(expandedBranchId);
        // We remove the root node itself from the list to only show content
        setNodes(fetchedNodes.slice(1));
      } else {
        setNodes([]); // Clear content if no branch is expanded
      }
    };
    fetchBranchContent();
  }, [expandedBranchId, structureVersion]);

  const rowVirtualizer = useVirtualizer({
    count: processedNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  // Scroll to the selected node
  useEffect(() => {
    if (selectedNode) {
      const index = processedNodes.findIndex(node => node.id === selectedNode.id);
      if (index !== -1) {
        rowVirtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
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
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const node = processedNodes[virtualItem.index];
          const siblings = nodes.filter(n => n.parentId === node.parentId);
          const nodeIndexWithinSiblings = siblings.findIndex(n => n.id === node.id);

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
              className="group/item relative px-4 py-1.5 transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setSelectedNodeById(node.id)}
            >
              <NodeRenderer node={node} />
              <div
                className="group/insert absolute -bottom-2 left-0 w-full h-4 flex items-center justify-center cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleInsertSiblingClick(node);
                }}
              >
                <div className="w-full h-full flex items-center justify-center relative">
                  <div className="w-1/2 h-0.5 bg-primary rounded-full opacity-0 group-hover/insert:opacity-100 transition-opacity" />
                  <div className="absolute flex items-center justify-center w-6 h-6 bg-background border rounded-full opacity-0 group-hover/insert:opacity-100 transition-opacity">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </div>
              <div className="absolute top-2 right-2 flex items-center space-x-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); handleMove(node.id, 'up'); }}
                  disabled={nodeIndexWithinSiblings === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); handleMove(node.id, 'down'); }}
                  disabled={nodeIndexWithinSiblings === siblings.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddClick(node.id);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingNodeId(node.id);
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(node.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {addDialogOpen && parentNode && (
        <AddNodeDialog
          parent={parentNode}
          isOpen={addDialogOpen}
          onClose={() => setAddDialogOpen(false)}
          insertAfterNodeId={insertAfterNodeId}
        />
      )}
      {deleteDialogOpen && nodeToDelete && (
        <ConfirmDeleteDialog
          node={nodeToDelete}
          isOpen={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
};

export default MainContent;
