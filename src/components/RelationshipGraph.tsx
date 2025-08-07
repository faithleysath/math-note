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

    const getLinkStyle = (label: string) => {
      switch (label) {
        case '充分条件':
          return '==>';
        case '充要条件':
          return '<==>';
        default:
          return '-->';
      }
    };

    // Add incoming nodes and links
    incoming.forEach(({ edge, relatedNode }) => {
      const relatedNodeId = sanitizeId(relatedNode.id);
      if (edge.label === '必要条件') {
        // A is necessary for B (B => A), so draw arrow from selected to related
        const link = getLinkStyle('充分条件'); // B is sufficient for A
        graphDefinition += `  ${selectedNodeId} ${link}|"必要条件"| ${relatedNodeId}["${relatedNode.title}"];\n`;
      } else {
        const link = getLinkStyle(edge.label);
        graphDefinition += `  ${relatedNodeId}["${relatedNode.title}"] ${link}|"${edge.label}"| ${selectedNodeId};\n`;
      }
    });

    // Add outgoing nodes and links
    outgoing.forEach(({ edge, relatedNode }) => {
      const relatedNodeId = sanitizeId(relatedNode.id);
      if (edge.label === '必要条件') {
        // B is necessary for A (A => B), so draw arrow from related to selected
        const link = getLinkStyle('充分条件'); // A is sufficient for B
        graphDefinition += `  ${relatedNodeId}["${relatedNode.title}"] ${link}|"必要条件"| ${selectedNodeId};\n`;
      } else {
        const link = getLinkStyle(edge.label);
        graphDefinition += `  ${selectedNodeId} ${link}|"${edge.label}"| ${relatedNodeId}["${relatedNode.title}"];\n`;
      }
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
