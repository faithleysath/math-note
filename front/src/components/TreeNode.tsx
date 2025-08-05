import React, { useState, useEffect } from 'react';
import type { Node } from '../lib/types';
import { getNodesByParent } from '../lib/db';
import { useAppContext } from '../hooks/useAppContext';

interface TreeNodeProps {
  node: Node;
  numberPrefix?: string;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, numberPrefix = '' }) => {
  const { setSelectedNodeById, expandedBranchId, setExpandedBranchId } = useAppContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const isBranch = node.type === '分支';

  // Sync local expanded state with global context for branches
  useEffect(() => {
    if (isBranch) {
      setIsExpanded(expandedBranchId === node.id);
    }
  }, [expandedBranchId, isBranch, node.id]);

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

  return (
    <li className="ml-4">
      <div className="flex items-center cursor-pointer" onClick={handleRowClick}>
        {hasChildren && (
          <span className="mr-1 text-lg w-4 text-center">
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        <span className={`${!hasChildren ? 'ml-[22px]' : ''}`}>{`${numberPrefix}${node.title}`}</span>
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
