import React, { useState, useEffect } from 'react';
import type { Node } from '../lib/types';
import { getNodesByParent } from '../lib/db';
import { useAppContext } from '../context/AppContext';

interface TreeNodeProps {
  node: Node;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node }) => {
  const { setSelectedNodeById } = useAppContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);

  const hasChildren = node.children && node.children.length > 0;

  useEffect(() => {
    if (isExpanded && hasChildren) {
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
  }, [isExpanded, hasChildren, node.id]);

  const handleRowClick = () => {
    setSelectedNodeById(node.id);
    if (hasChildren) {
      setIsExpanded(!isExpanded);
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
        <span className={`${!hasChildren ? 'ml-[22px]' : ''}`}>{node.title}</span>
      </div>
      {isExpanded && hasChildren && (
        <ul>
          {loading ? <li>Loading...</li> : children.map(child => <TreeNode key={child.id} node={child} />)}
        </ul>
      )}
    </li>
  );
};

export default TreeNode;
