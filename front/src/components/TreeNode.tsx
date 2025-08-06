import { useState, useEffect } from 'react';
import type { Node } from '../lib/types';
import { getNodesByParent } from '../lib/db';
import { useAppStore } from '../stores/useAppStore';

interface TreeNodeProps {
  node: Node;
  numberPrefix?: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, numberPrefix = '' }) => {
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const expandedBranchId = useAppStore(state => state.expandedBranchId);
  const setExpandedBranchId = useAppStore(state => state.setExpandedBranchId);
  const expandedNodeIds = useAppStore(state => state.expandedNodeIds);
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);

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
    // Fetch children if expanded and they haven't been fetched yet
    if (isExpanded && hasChildren && children.length === 0) {
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
    }
  }, [isExpanded, hasChildren, node.id, children.length, node.children]);

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
    node.type === '例题' ? 'Eg: ' : 
    node.type === '练习' ? 'Ex: ' :
    node.type === '解题记录' ? 'Sol: ' :
    node.type === '笔记' ? 'Note: ' :
    '';

  const colorClass =
    node.type === '定义' ? 'text-blue-600 dark:text-blue-400' :
    node.type === '定理' ? 'text-green-600 dark:text-green-400' :
    node.type === '例题' ? 'text-orange-600 dark:text-orange-400' :
    node.type === '练习' ? 'text-purple-600 dark:text-purple-400' :
    node.type === '解题记录' ? 'text-red-600 dark:text-red-400' :
    node.type === '笔记' ? 'text-yellow-600 dark:text-yellow-400' :
    '';

  return (
    <li className="ml-2">
      <div className="flex items-center cursor-pointer rounded-md p-1 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={handleRowClick}>
        {hasChildren && (
          <span className="mr-1 text-lg w-4 text-center">
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        <span className={`${!hasChildren ? 'ml-[22px]' : ''} ${colorClass}`}>{`${numberPrefix}${typePrefix}${node.title}`}</span>
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
    </li>
  );
};

export default TreeNode;
