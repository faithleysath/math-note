import React, { useEffect, useState } from 'react';
import type { Node, Edge } from '../lib/types';
import { getEdgesBySource, getEdgesByTarget, getNode } from '../lib/db';
import { useAppContext } from '../context/AppContext';

interface RelatedNodeInfo {
  edge: Edge;
  node: Node;
}

const RelatedNodesList = () => {
  const { selectedNode } = useAppContext();
  const [relatedNodes, setRelatedNodes] = useState<RelatedNodeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedNode) {
      setRelatedNodes([]);
      return;
    }

    const fetchRelatedNodes = async () => {
      setLoading(true);
      try {
        const sourceEdges = await getEdgesBySource(selectedNode.id);
        const targetEdges = await getEdgesByTarget(selectedNode.id);
        
        const allEdges = [...sourceEdges, ...targetEdges];
        const relatedNodePromises = allEdges.map(async (edge) => {
          const otherNodeId = edge.source === selectedNode.id ? edge.target : edge.source;
          const node = await getNode(otherNodeId);
          return node ? { edge, node } : null;
        });

        const results = (await Promise.all(relatedNodePromises)).filter((r): r is RelatedNodeInfo => r !== null);
        setRelatedNodes(results);

      } catch (error) {
        console.error("Failed to fetch related nodes:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedNodes();
  }, [selectedNode]);

  if (loading) {
    return <p>Loading related nodes...</p>;
  }

  if (relatedNodes.length === 0) {
    return <p>No related nodes found.</p>;
  }

  return (
    <ul>
      {relatedNodes.map(({ edge, node }) => (
        <li key={edge.id} className="mb-2">
          <span className="font-semibold">{edge.label}:</span>
          <span className="ml-2 text-blue-500 cursor-pointer hover:underline">{node.title}</span>
        </li>
      ))}
    </ul>
  );
};

export default RelatedNodesList;
