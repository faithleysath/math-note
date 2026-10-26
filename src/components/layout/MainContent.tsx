import { useEffect, useState, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { useGraphStore } from '../../stores/useGraphStore';
import { subjectProfile } from '../../lib/subjects';
import { collectSubtree, numberDisplayFor } from '../../lib/graph';
import type { ProcessedNode } from '../../lib/schema';
import { useVirtualizer } from '@tanstack/react-virtual';
import NodeRenderer from '../renderers/NodeRenderer';
import { Button } from '../ui/button';
import { Edit2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import AddNodeDialog from '../AddNodeDialog';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import type { Node } from '../../lib/schema';

// =================================================================================
// Main Content Component
// =================================================================================
const MainContent = () => {
  const index = useGraphStore(state => state.index);
  const book = useGraphStore(state => state.book);
  const expandedBranchId = useGraphStore(state => state.expandedBranchId);
  const selectedId = useGraphStore(state => state.selectedId);
  const editingId = useGraphStore(state => state.editingId);
  const readOnly = useGraphStore(state => state.readOnly);
  const select = useGraphStore(state => state.select);
  const setEditing = useGraphStore(state => state.setEditing);
  const moveSibling = useGraphStore(state => state.moveSibling);
  const deleteSubtree = useGraphStore(state => state.deleteSubtree);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [parentNode, setParentNode] = useState<Node | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [insertAfterNodeId, setInsertAfterNodeId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const handleAddClick = (nodeId: string) => {
    const fullParentNode = index.nodes.get(nodeId);
    if (fullParentNode) {
      setParentNode(fullParentNode);
      setInsertAfterNodeId(null); // This is for adding a child
      setAddDialogOpen(true);
    } else {
      console.error("Could not find parent node to add child to.");
    }
  };

  const handleAddNewNodeToBranch = () => {
    if (!expandedBranchId) return;
    const branchNode = index.nodes.get(expandedBranchId);
    if (branchNode) {
      setParentNode(branchNode);
      setInsertAfterNodeId(null);
      setAddDialogOpen(true);
    } else {
      console.error("Could not find branch node to add child to.");
      toast.error("无法找到分支节点。");
    }
  };

  const handleInsertSiblingClick = (currentNode: Node) => {
    if (!currentNode.parentId) {
      console.error("Cannot add a sibling to a root node.");
      return;
    }
    const fullParentNode = index.nodes.get(currentNode.parentId);
    if (fullParentNode) {
      setParentNode(fullParentNode);
      setInsertAfterNodeId(currentNode.id); // This is for adding a sibling
      setAddDialogOpen(true);
    } else {
      console.error("Could not find parent node to insert sibling.");
    }
  };

  const handleDeleteClick = (nodeId: string) => {
    const fullNodeToDelete = index.nodes.get(nodeId);
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
        await deleteSubtree(nodeToDelete.id);
        toast.success(`节点 "${nodeToDelete.title}" 已被删除。`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '删除节点失败。');
      } finally {
        setNodeToDelete(null);
        setDeleteDialogOpen(false);
      }
    }
  };

  const handleMove = async (nodeId: string, direction: 'up' | 'down') => {
    try {
      await moveSibling(nodeId, direction);
      toast.success('节点顺序已更新。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '移动节点失败。');
    }
  };

  // Nodes of the expanded branch, the branch itself excluded
  const nodes = useMemo(() => {
    if (!expandedBranchId) return [] as Node[];
    return collectSubtree(index, expandedBranchId)
      .slice(1)
      .map(id => index.nodes.get(id))
      .filter((node): node is Node => Boolean(node));
  }, [index, expandedBranchId]);

  // Attach the textbook numbers computed from the tree.
  // 原书编号优先；非数学学科不强行生成定律/实验编号。
  const processedNodes = useMemo((): ProcessedNode[] => {
    const numberingMode = subjectProfile(book?.subject).numberingMode;
    return nodes.map((node) => {
      const number = numberDisplayFor(index, node, numberingMode);
      return {
        ...node,
        displayNumber: number.text,
        numberSource: number.source,
        isChapter:
          node.type === 'section' &&
          (node.kind === 'chapter' || (node.kind === undefined && index.numbering.get(node.id)?.startsWith('第') === true)),
      };
    });
  }, [nodes, index, book]);

  // Hotkeys for navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (editingId) return; // Don't navigate while editing

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const currentIndex = selectedId ? processedNodes.findIndex(n => n.id === selectedId) : -1;

        const nextIndex =
          event.key === 'j'
            ? currentIndex === -1 ? 0 : Math.min(currentIndex + 1, processedNodes.length - 1)
            : currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);

        if (nextIndex !== -1 && processedNodes[nextIndex]) {
          select(processedNodes[nextIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId, processedNodes, editingId, select]);

  // TanStack Virtual 返回的函数无法被 React Compiler 安全 memo；跳过该组件是预期行为
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: processedNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  // Scroll to the selected node
  useEffect(() => {
    if (selectedId) {
      const position = processedNodes.findIndex(node => node.id === selectedId);
      if (position !== -1) {
        rowVirtualizer.scrollToIndex(position, { align: 'center', behavior: 'smooth' });
      }
    }
  }, [selectedId, processedNodes, rowVirtualizer]);

  return (
    <>
      <div ref={parentRef} className="h-full overflow-y-auto">
        {!expandedBranchId ? (
          <div className="h-full flex items-center justify-center p-4">
            <p className="text-muted-foreground">展开一个分支以查看其内容</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4">
            <p className="text-muted-foreground mb-4">此分支为空</p>
            {!readOnly && (
              <Button onClick={handleAddNewNodeToBranch}>
                <Plus className="h-4 w-4 mr-2" />
                添加第一个主章节
              </Button>
            )}
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const node = processedNodes[virtualItem.index];
              const siblings = nodes.filter(n => n.parentId === node.parentId);
              const nodeIndexWithinSiblings = siblings.findIndex(n => n.id === node.id);
              // 编辑中的节点不再显示悬浮工具栏和行间插入线，避免挡住编辑框
              const isEditing = editingId === node.id;

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
                  onClick={() => select(node.id)}
                >
                  <NodeRenderer node={node} />
                  {!readOnly && !isEditing && (
                    <>
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
                      <div className="absolute top-0.5 right-2 flex items-center space-x-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
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
                            setEditing(node.id);
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
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
    </>
  );
};

export default MainContent;
