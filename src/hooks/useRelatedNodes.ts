import { useGraphStore } from '../stores/useGraphStore';
import type { Edge, Node } from '../lib/schema';
import { PREDICATE_SPECS } from '../lib/predicates';

export interface RelatedNodeInfo {
  edge: Edge;
  relatedNode: Pick<Node, 'id' | 'title' | 'type'>;
}

/** 一条关系在「当前节点」视角下的名字 */
export function edgeLabelFrom(edge: Edge, viewerId: string): string {
  const spec = PREDICATE_SPECS[edge.predicate];
  return viewerId === edge.from ? spec.fromLabel : spec.inverseLabel;
}

/**
 * 当前节点的入边和出边。
 * 数据都在内存图里，所以不需要异步，也不需要版本号。
 */
export function useRelatedNodes(nodeId: string | undefined) {
  const index = useGraphStore(state => state.index);

  const outgoing: RelatedNodeInfo[] = [];
  const incoming: RelatedNodeInfo[] = [];

  if (nodeId) {
    for (const edge of index.edgesFrom.get(nodeId) ?? []) {
      const related = index.nodes.get(edge.to);
      if (related) {
        outgoing.push({ edge, relatedNode: { id: related.id, title: related.title, type: related.type } });
      }
    }
    for (const edge of index.edgesTo.get(nodeId) ?? []) {
      const related = index.nodes.get(edge.from);
      if (related) {
        incoming.push({ edge, relatedNode: { id: related.id, title: related.title, type: related.type } });
      }
    }
  }

  return { outgoing, incoming, loading: false };
}
