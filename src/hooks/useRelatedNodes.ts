import { useState, useEffect } from 'react';
import { db } from '../lib/db';
import type { Edge, Node } from '../lib/types';
import { useAppStore } from '../stores/useAppStore';

export interface RelatedNodeInfo {
  edge: Edge;
  relatedNode: Pick<Node, 'id' | 'title' | 'type'>;
}

export function useRelatedNodes(nodeId: string | undefined) {
  const [outgoing, setOutgoing] = useState<RelatedNodeInfo[]>([]);
  const [incoming, setIncoming] = useState<RelatedNodeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // We listen to both content and structure refresh triggers
  const contentVersion = useAppStore(state => state.contentVersion);
  const structureVersion = useAppStore(state => state.structureVersion);

  useEffect(() => {
    if (!nodeId) {
      setOutgoing([]);
      setIncoming([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchRelated = async () => {
      try {
        // Fetch outgoing edges (current node is the source)
        const outEdges = await db.edges.where('source').equals(nodeId).toArray();
        const outTargetIds = outEdges.map(e => e.target);
        const outTargetNodes = await db.nodes.where('id').anyOf(outTargetIds).toArray();
        const outTargetNodesMap = new Map(outTargetNodes.map(n => [n.id, n]));
        
        const outgoingInfo = outEdges.map(edge => ({
          edge,
          relatedNode: outTargetNodesMap.get(edge.target)!
        })).filter(info => info.relatedNode); // Filter out any potential dangling edges

        // Fetch incoming edges (current node is the target)
        const inEdges = await db.edges.where('target').equals(nodeId).toArray();
        const inSourceIds = inEdges.map(e => e.source);
        const inSourceNodes = await db.nodes.where('id').anyOf(inSourceIds).toArray();
        const inSourceNodesMap = new Map(inSourceNodes.map(n => [n.id, n]));

        const incomingInfo = inEdges.map(edge => ({
          edge,
          relatedNode: inSourceNodesMap.get(edge.source)!
        })).filter(info => info.relatedNode);

        if (isMounted) {
          setOutgoing(outgoingInfo);
          setIncoming(incomingInfo);
        }
      } catch (error) {
        console.error("Failed to fetch related nodes:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchRelated();

    return () => {
      isMounted = false;
    };
  }, [nodeId, contentVersion, structureVersion]);

  return { outgoing, incoming, loading };
}
