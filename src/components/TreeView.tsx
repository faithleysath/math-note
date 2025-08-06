import { useAppStore } from '../stores/useAppStore';
import TreeNode from './TreeNode';

const TreeView = () => {
  const { rootNodes, isLoadingTree } = useAppStore();

  if (isLoadingTree) {
    return <div>Loading...</div>;
  }

  if (rootNodes.length === 0) {
    return <div className='h-full flex items-center justify-center text-muted-foreground'>无内容，请尝试添加一个分支。</div>;
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
