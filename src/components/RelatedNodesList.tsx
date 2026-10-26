import { useGraphStore } from '../stores/useGraphStore';
import { edgeLabelFrom, useRelatedNodes } from '../hooks/useRelatedNodes';
import type { RelatedNodeInfo } from '../hooks/useRelatedNodes';
import { Link, X } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import type { Edge } from '../lib/schema';

const RelationGroup = ({ title, relations, viewerId }: { title: string; relations: RelatedNodeInfo[]; viewerId: string }) => {
  const select = useGraphStore(state => state.select);
  const deleteEdge = useGraphStore(state => state.deleteEdge);
  const index = useGraphStore(state => state.index);

  /** 关系自身的事实：前提与语境。缺省值不显示，避免噪音 */
  const metaOf = (edge: Edge) => {
    const parts: string[] = [];
    if (edge.condition) parts.push(`前提：${edge.condition}`);
    if (edge.contextId) {
      const context = index.nodes.get(edge.contextId);
      parts.push(`语境：${context?.title ?? edge.contextId}`);
    }
    return parts;
  };

  const handleDeleteEdge = async (edgeId: string) => {
    try {
      // We can add a confirmation dialog later if needed
      await deleteEdge(edgeId);
      toast.success('链接已删除。');
    } catch (error) {
      console.error('Failed to delete edge:', error);
      toast.error('删除链接失败。');
    }
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
                onClick={() => select(relatedNode.id)}
              >
                {relatedNode.title}
              </span>
              <p className="text-xs text-muted-foreground">{edgeLabelFrom(edge, viewerId)}</p>
              {metaOf(edge).length > 0 && (
                <p className="text-[11px] text-muted-foreground">{metaOf(edge).join(' · ')}</p>
              )}
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
  const selectedId = useGraphStore(state => state.selectedId);
  const { outgoing, incoming, loading } = useRelatedNodes(selectedId ?? undefined);

  if (loading) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  if (outgoing.length === 0 && incoming.length === 0) {
    return <p className="text-sm text-muted-foreground">无相关节点。</p>;
  }

  return (
    <div className="space-y-4">
      <RelationGroup title="本节点引用" relations={outgoing} viewerId={selectedId ?? ''} />
      <RelationGroup title="引用本节点" relations={incoming} viewerId={selectedId ?? ''} />
    </div>
  );
};

export default RelatedNodesList;
