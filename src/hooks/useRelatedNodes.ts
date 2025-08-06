import { useState, useEffect } from 'react';
import { getEdgesBySource, getEdgesByTarget, getNode } from '../lib/data-provider';
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
  
  const edgeVersion = useAppStore(state => state.edgeVersion);

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
      if (!nodeId) return;
      try {
        // Fetch outgoing edges (current node is the source)
        const outEdges = await getEdgesBySource(nodeId);
        const outTargetNodesData = await Promise.all(
          outEdges.map(e => getNode(e.target))
        );
        
        const outgoingInfo = outEdges.map((edge, index) => ({
          edge,
          relatedNode: outTargetNodesData[index]
        })).filter(info => info.relatedNode) as RelatedNodeInfo[];

        // Fetch incoming edges (current node is the target)
        const inEdges = await getEdgesByTarget(nodeId);
        const inSourceNodesData = await Promise.all(
          inEdges.map(e => getNode(e.source))
        );

        const incomingInfo = inEdges.map((edge, index) => ({
          edge,
          relatedNode: inSourceNodesData[index]
        })).filter(info => info.relatedNode) as RelatedNodeInfo[];

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
  }, [nodeId, edgeVersion]);

  return { outgoing, incoming, loading };
}
