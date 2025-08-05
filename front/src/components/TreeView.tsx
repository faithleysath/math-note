import React, { useEffect, useState } from 'react';
import type { Node } from '../lib/types';
import { getNodesByParent } from '../lib/db';
import TreeNode from './TreeNode';

const TreeView = () => {
  const [rootNodes, setRootNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRootNodes() {
      try {
        const nodes = await getNodesByParent(null);
        setRootNodes(nodes);
      } catch (error) {
        console.error("Failed to fetch root nodes:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRootNodes();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (rootNodes.length === 0) {
    return <div>No branches found. Add a new branch to start.</div>;
  }

  return (
    <ul>
      {rootNodes.map(node => (
        <TreeNode key={node.id} node={node} />
      ))}
    </ul>
  );
};

export default TreeView;
