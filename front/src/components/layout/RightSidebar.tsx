import { useAppStore } from '../../stores/useAppStore';
import RelatedNodesList from '../RelatedNodesList';

const RightSidebar = () => {
  const selectedNode = useAppStore(state => state.selectedNode);

  if (!selectedNode) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <p className="text-muted-foreground">未选择节点。</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <h2 className="text-lg font-semibold mb-4 border-b pb-2">详情</h2>
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-semibold">ID:</span>
          <span className="ml-2 text-muted-foreground break-all">{selectedNode.id}</span>
        </div>
        <div>
          <span className="font-semibold">类型:</span>
          <span className="ml-2 text-muted-foreground">{selectedNode.type}</span>
        </div>
        <div>
          <span className="font-semibold">创建时间:</span>
          <span className="ml-2 text-muted-foreground">{new Date(selectedNode.createdAt).toLocaleString()}</span>
        </div>
        <div>
          <span className="font-semibold">更新时间:</span>
          <span className="ml-2 text-muted-foreground">{new Date(selectedNode.updatedAt).toLocaleString()}</span>
        </div>
      </div>
      <h3 className="text-md font-semibold mt-6 mb-2 border-b pb-2">相关节点</h3>
      <div className="text-sm">
        <RelatedNodesList />
      </div>
    </div>
  );
};

export default RightSidebar;
