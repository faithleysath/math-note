import { useEffect, useMemo, useRef } from 'react';
import mermaid from 'mermaid';
import { v4 as uuidv4 } from 'uuid';
import type { Node } from '../lib/types';
import type { RelatedNodeInfo } from '../hooks/useRelatedNodes';

interface RelationshipGraphProps {
  selectedNode: Node;
  incoming: RelatedNodeInfo[];
  outgoing: RelatedNodeInfo[];
}

// Function to sanitize node titles for Mermaid IDs
const sanitizeId = (id: string) => {
  return `node_${id.replace(/[^a-zA-Z0-9_]/g, '')}`;
};

const RelationshipGraph = ({ selectedNode, incoming, outgoing }: RelationshipGraphProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const graphId = useMemo(() => `mermaid-graph-${uuidv4()}`, []);

  useEffect(() => {
    let isCancelled = false;
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

    const selectedNodeId = sanitizeId(selectedNode.id);
    let graphDefinition = 'graph LR\n';

    // Add selected node with special styling
    graphDefinition += `  ${selectedNodeId}["<b>${selectedNode.title}</b>"];\n`;
    graphDefinition += `  style ${selectedNodeId} fill:#007bff,stroke:#333,stroke-width:2px,color:#fff;\n`;

    // Add incoming nodes and links
    incoming.forEach(({ edge, relatedNode }) => {
      const relatedNodeId = sanitizeId(relatedNode.id);
      graphDefinition += `  ${relatedNodeId}["${relatedNode.title}"] -->|"${edge.label}"| ${selectedNodeId};\n`;
    });

    // Add outgoing nodes and links
    outgoing.forEach(({ edge, relatedNode }) => {
      const relatedNodeId = sanitizeId(relatedNode.id);
      graphDefinition += `  ${selectedNodeId} -->|"${edge.label}"| ${relatedNodeId}["${relatedNode.title}"];\n`;
    });

    const renderGraph = async () => {
      if (ref.current) {
        try {
          // Ensure the container is empty before rendering
          ref.current.innerHTML = '';
          const { svg } = await mermaid.render(graphId, graphDefinition);
          if (ref.current && !isCancelled) {
            ref.current.innerHTML = svg;
          }
        } catch (error) {
          if (!isCancelled) {
            console.error('Mermaid rendering failed:', error);
          }
        }
      }
    };

    renderGraph();

    return () => {
      isCancelled = true;
    };
  }, [selectedNode, incoming, outgoing, graphId]);

  return <div ref={ref} className="mermaid-container w-full flex justify-center" />;
};

export default RelationshipGraph;
