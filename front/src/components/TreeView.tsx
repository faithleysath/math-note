import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import TreeNode from './TreeNode';

const TreeView = () => {
  const { rootNodes, isLoadingTree, fetchRootNodes } = useAppStore();

  useEffect(() => {
    fetchRootNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoadingTree) {
    return <div>Loading...</div>;
  }

  if (rootNodes.length === 0) {
    return <div>No branches found. Add a new branch to start.</div>;
  }

  return (
    <ul className='-ml-2'>
      {rootNodes.map(node => (
        <TreeNode key={node.id} node={node} />
      ))}
    </ul>
  );
};

export default TreeView;
