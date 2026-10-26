import { useGraphStore } from '../stores/useGraphStore';
import TreeNode from './TreeNode';

const TreeView = () => {
  const index = useGraphStore((state) => state.index);
  const status = useGraphStore((state) => state.status);
  const book = useGraphStore((state) => state.book);

  if (status === 'loading') {
    return <div>Loading...</div>;
  }

  if (!book) {
    return (
      <div className='h-full flex items-center justify-center px-2 text-center text-muted-foreground'>
        还没有教材，请先新建或导入
      </div>
    );
  }

  if (index.roots.length === 0) {
    return <div className='h-full flex items-center justify-center text-muted-foreground'>无内容，请尝试添加一个分支</div>;
  }

  return (
    <ul className='-ml-2'>
      {index.roots.map((id) => {
        const node = index.nodes.get(id);
        return node ? <TreeNode key={node.id} node={node} /> : null;
      })}
    </ul>
  );
};

export default TreeView;
