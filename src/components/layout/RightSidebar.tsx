import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import RelatedNodesList from '../RelatedNodesList';
import RelationshipGraph from '../RelationshipGraph';
import { useRelatedNodes } from '../../hooks/useRelatedNodes';
import { Button } from '../ui/button';
import AddEdgeDialog from '../AddEdgeDialog';
import { Link, ChevronRight, X } from 'lucide-react';
import { getAncestors } from '../../lib/data-provider';
import type { Node } from '../../lib/types';
import { useWindowSize } from '@/hooks/useWindowSize';

const RightSidebar = () => {
  const selectedNode = useAppStore(state => state.selectedNode);
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const setMobileView = useAppStore(state => state.setMobileView);
  const { width } = useWindowSize();
  const isMobile = width <= 768;
  const [isAddEdgeOpen, setIsAddEdgeOpen] = useState(false);
  const [ancestors, setAncestors] = useState<Node[]>([]);
  const { outgoing, incoming, loading } = useRelatedNodes(selectedNode?.id);

  useEffect(() => {
    if (selectedNode) {
      getAncestors(selectedNode.id).then(setAncestors);
    } else {
      setAncestors([]);
    }
  }, [selectedNode]);

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-md font-semibold">详细信息</h2>
        {isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileView('main')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!selectedNode ? (
        <div className="flex h-[calc(100%-4rem)] items-center justify-center">
          <p className="text-muted-foreground">未选择节点。</p>
        </div>
      ) : (
        <>
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
            {selectedNode.source && (
              <div>
                <span className="font-semibold">来源:</span>
                <span className="ml-2 text-muted-foreground">{selectedNode.source}</span>
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
            <Button variant="ghost" size="sm" onClick={() => setIsAddEdgeOpen(true)}>
              <Link className="h-4 w-4 mr-2" />
              链接新节点
            </Button>
          </div>
          {!loading && (incoming.length > 0 || outgoing.length > 0) && (
            <div className="mb-4">
              <RelationshipGraph selectedNode={selectedNode} incoming={incoming} outgoing={outgoing} />
            </div>
          )}
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
        </>
      )}
    </div>
  );
};

export default RightSidebar;
