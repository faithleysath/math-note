import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import RelatedNodesList from '../RelatedNodesList';
import { Button } from '../ui/button';
import AddEdgeDialog from '../AddEdgeDialog';
import { Link, ChevronRight } from 'lucide-react';
import { getAncestors } from '../../lib/db';
import type { Node } from '../../lib/types';

const RightSidebar = () => {
  const selectedNode = useAppStore(state => state.selectedNode);
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const [isAddEdgeOpen, setIsAddEdgeOpen] = useState(false);
  const [ancestors, setAncestors] = useState<Node[]>([]);

  useEffect(() => {
    if (selectedNode) {
      getAncestors(selectedNode.id).then(setAncestors);
    } else {
      setAncestors([]);
    }
  }, [selectedNode]);

  if (!selectedNode) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <p className="text-muted-foreground">未选择节点。</p>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      {ancestors.length > 0 && (
        <div className="mb-4">
          <h3 className="text-md font-semibold mb-2">内容导航</h3>
          <div className="flex flex-wrap items-center text-sm text-muted-foreground">
            {ancestors.map((ancestor, index) => (
              <div key={ancestor.id} className="flex items-center">
                <span
                  className="hover:underline cursor-pointer"
                  onClick={() => setSelectedNodeById(ancestor.id)}
                >
                  {ancestor.title}
                </span>
                {index < ancestors.length - 1 && <ChevronRight className="h-4 w-4 mx-1" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-md font-semibold mb-4 border-b pb-2">详细信息</h2>
      <div className="space-y-2 text-sm mb-6">
        <div>
          <span className="font-semibold">标题:</span>
          <span className="ml-2 text-muted-foreground">{selectedNode.title}</span>
        </div>
        {selectedNode.aliases && selectedNode.aliases.length > 0 && (
          <div>
            <span className="font-semibold">别名:</span>
            <span className="ml-2 text-muted-foreground">{selectedNode.aliases.join(', ')}</span>
          </div>
        )}
        {selectedNode.source && (
          <div>
            <span className="font-semibold">来源:</span>
            <span className="ml-2 text-muted-foreground">{selectedNode.source}</span>
          </div>
        )}
        <div>
          <span className="font-semibold">类型:</span>
          <span className="ml-2 text-muted-foreground">{selectedNode.type}</span>
        </div>
        <div>
          <span className="font-semibold">ID:</span>
          <span className="ml-2 text-muted-foreground break-all">{selectedNode.id}</span>
        </div>
        {selectedNode.tags && selectedNode.tags.length > 0 && (
          <div className="flex items-start">
            <span className="font-semibold mr-2">标签:</span>
            <div className="flex flex-wrap gap-2">
              {selectedNode.tags.map(tag => (
                <span key={tag} className="bg-secondary text-secondary-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <span className="font-semibold">创建时间:</span>
          <span className="ml-2 text-muted-foreground">{new Date(selectedNode.createdAt).toLocaleString()}</span>
        </div>
        <div>
          <span className="font-semibold">更新时间:</span>
          <span className="ml-2 text-muted-foreground">{new Date(selectedNode.updatedAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 border-b pb-2">
        <h3 className="text-md font-semibold">关系链接</h3>
        <Button className='cursor-pointer' variant="ghost" size="sm" onClick={() => setIsAddEdgeOpen(true)}>
          <Link className="h-4 w-4 mr-2" />
          链接新节点
        </Button>
      </div>
      <div className="text-sm">
        <RelatedNodesList />
      </div>
      {isAddEdgeOpen && (
        <AddEdgeDialog
          sourceNode={selectedNode}
          isOpen={isAddEdgeOpen}
          onClose={() => setIsAddEdgeOpen(false)}
        />
      )}
    </div>
  );
};

export default RightSidebar;
