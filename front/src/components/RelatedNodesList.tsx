import { useAppStore } from '../stores/useAppStore';
import { useRelatedNodes } from '../hooks/useRelatedNodes';
import type { RelatedNodeInfo } from '../hooks/useRelatedNodes';
import { Link, X } from 'lucide-react';
import { Button } from './ui/button';
import { deleteEdge } from '../lib/db';

const RelationGroup = ({ title, relations }: { title: string; relations: RelatedNodeInfo[] }) => {
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const triggerContentRefresh = useAppStore(state => state.triggerContentRefresh);

  const handleDeleteEdge = async (edgeId: string) => {
    // We can add a confirmation dialog later if needed
    await deleteEdge(edgeId);
    triggerContentRefresh(); // Refresh the list
  };

  if (relations.length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="font-semibold text-muted-foreground mb-2">{title}</h4>
      <ul className="space-y-2">
        {relations.map(({ edge, relatedNode }) => (
          <li key={edge.id} className="text-sm flex items-start group">
            <Link className="h-3 w-3 mr-2 mt-1 text-muted-foreground" />
            <div className="flex-1">
              <span
                className="text-primary hover:underline cursor-pointer"
                onClick={() => setSelectedNodeById(relatedNode.id)}
              >
                {relatedNode.title}
              </span>
              <p className="text-xs text-muted-foreground">{edge.label}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleDeleteEdge(edge.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const RelatedNodesList = () => {
  const selectedNode = useAppStore(state => state.selectedNode);
  const { outgoing, incoming, loading } = useRelatedNodes(selectedNode?.id);

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  if (outgoing.length === 0 && incoming.length === 0) {
    return <p className="text-sm text-muted-foreground">无相关节点。</p>;
  }

  return (
    <div className="space-y-4">
      <RelationGroup title="本节点引用" relations={outgoing} />
      <RelationGroup title="引用本节点" relations={incoming} />
    </div>
  );
};

export default RelatedNodesList;
