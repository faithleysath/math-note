import { useState, useEffect } from 'react';
import type { Node } from '../lib/types';
import { getNodesByParent, deleteNode } from '../lib/db';
import { useAppStore } from '../stores/useAppStore';
import { Button } from './ui/button';
import { Trash2 } from 'lucide-react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';

interface TreeNodeProps {
  node: Node;
  numberPrefix?: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, numberPrefix = '' }) => {
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const expandedBranchId = useAppStore(state => state.expandedBranchId);
  const setExpandedBranchId = useAppStore(state => state.setExpandedBranchId);
  const expandedNodeIds = useAppStore(state => state.expandedNodeIds);
  const structureVersion = useAppStore(state => state.structureVersion);
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const isBranch = node.type === '分支';

  // Sync local expanded state with global context
  useEffect(() => {
    if (isBranch) {
      // Accordion effect for top-level branches
      setIsExpanded(expandedBranchId === node.id);
    } else {
      // Auto-expand if this node is an ancestor of the selected node
      setIsExpanded(expandedNodeIds.has(node.id));
    }
  }, [expandedBranchId, isBranch, node.id, expandedNodeIds]);

  useEffect(() => {
    const fetchChildren = () => {
      setLoading(true);
      getNodesByParent(node.id)
        .then(childNodes => {
          const sortedChildren = [...childNodes].sort((a, b) => {
            const indexA = node.children.indexOf(a.id);
            const indexB = node.children.indexOf(b.id);
            return indexA - indexB;
          });
          setChildren(sortedChildren);
        })
        .catch(error => console.error(`Failed to fetch children for node ${node.id}:`, error))
        .finally(() => setLoading(false));
    };

    // Fetch children if expanded and they haven't been fetched yet, or if a structural update happened
    if (isExpanded && hasChildren) {
      fetchChildren();
    }
  }, [isExpanded, hasChildren, node.id, node.children, structureVersion]);

  const handleRowClick = () => {
    setSelectedNodeById(node.id);
    if (hasChildren) {
      if (isBranch) {
        // For branches, toggle via global context for accordion effect
        setExpandedBranchId(isExpanded ? null : node.id);
      } else {
        // For other nodes, toggle locally
        setIsExpanded(!isExpanded);
      }
    }
  };

  const typePrefix =
    node.type === '定义' ? 'Def: ' :
    node.type === '定理' ? 'Th: ' :
    node.type === '引理' ? 'Lem: ' :
    node.type === '推论' ? 'Cor: ' :
    node.type === '例题' ? 'Eg: ' : 
    node.type === '练习' ? 'Ex: ' :
    node.type === '解题记录' ? 'Sol: ' :
    node.type === '笔记' ? 'Note: ' :
    '';

  const fetchRootNodes = useAppStore(state => state.fetchRootNodes);
  const setSelectedNodeByIdStore = useAppStore(state => state.setSelectedNodeById);

  const handleDeleteConfirm = async () => {
    await deleteNode(node.id);
    await fetchRootNodes();
    setSelectedNodeByIdStore(null);
    setIsDeleteDialogOpen(false);
  };

  const colorClass =
    node.type === '定义' ? 'text-blue-600 dark:text-blue-400' :
    node.type === '定理' ? 'text-green-600 dark:text-green-400' :
    node.type === '引理' ? 'text-teal-600 dark:text-teal-400' :
    node.type === '推论' ? 'text-cyan-600 dark:text-cyan-400' :
    node.type === '例题' ? 'text-orange-600 dark:text-orange-400' :
    node.type === '练习' ? 'text-purple-600 dark:text-purple-400' :
    node.type === '解题记录' ? 'text-red-600 dark:text-red-400' :
    node.type === '笔记' ? 'text-yellow-600 dark:text-yellow-400' :
    '';

  return (
    <li className="ml-2 group">
      <div className="flex items-center justify-between cursor-pointer rounded-md p-1 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={handleRowClick}>
        <div className="flex items-center">
          {hasChildren && (
            <span className="mr-1 text-lg w-4 text-center">
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          <span className={`${!hasChildren ? 'ml-[22px]' : ''} ${colorClass}`}>{`${numberPrefix}${typePrefix}${node.title}`}</span>
        </div>
        {isBranch && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
      {isExpanded && hasChildren && (
        <ul>
          {loading ? <li>加载中...</li> : children.map((child, index) => {
            const childNumberPrefix = ['主章节', '子章节'].includes(child.type) 
              ? `${numberPrefix}${index + 1}.` 
              : '';
            return <TreeNode key={child.id} node={child} numberPrefix={childNumberPrefix ? `${childNumberPrefix} ` : ''} />
          })}
        </ul>
      )}
      {isDeleteDialogOpen && (
        <ConfirmDeleteDialog
          node={node}
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </li>
  );
};

export default TreeNode;
