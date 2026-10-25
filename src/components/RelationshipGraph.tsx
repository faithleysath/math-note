import { useEffect, useMemo, useRef } from 'react';
import mermaid from 'mermaid';
import type { Node } from '../lib/schema';
import type { RelatedNodeInfo } from '../hooks/useRelatedNodes';
import { PREDICATE_SPECS } from '../lib/predicates';

interface RelationshipGraphProps {
  selectedNode: Node;
  incoming: RelatedNodeInfo[];
  outgoing: RelatedNodeInfo[];
}

// Function to sanitize node titles for Mermaid IDs
const sanitizeId = (id: string) => {
  return `node_${id.replace(/[^a-zA-Z0-9_]/g, '')}`;
};

// Mermaid 会把 $ 和引号当成语法，标题里的公式先去掉
const sanitizeTitle = (title: string) => {
  return title.replace(/\$[^$]*\$/g, 'φ').replace(/["<>{}[\]()|]/g, '').slice(0, 28) || '未命名';
};

const RelationshipGraph = ({ selectedNode, incoming, outgoing }: RelationshipGraphProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const graphId = useMemo(() => `mermaid-graph-${crypto.randomUUID()}`, []);

  useEffect(() => {
    let isCancelled = false;
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

    const selectedNodeId = sanitizeId(selectedNode.id);
    let graphDefinition = 'graph LR\n';

    // Add selected node with special styling
    graphDefinition += `  ${selectedNodeId}["<b>${sanitizeTitle(selectedNode.title)}</b>"];\n`;
    graphDefinition += `  style ${selectedNodeId} fill:#007bff,stroke:#333,stroke-width:2px,color:#fff;\n`;

    const getLinkStyle = (label: string) => {
      switch (label) {
        case '充分条件':
        case '必要条件':
          return '==>';
        case '等价于':
          return '<-->';
        default:
          return '-->';
      }
    };

    const labelOf = (relation: RelatedNodeInfo) => {
      const spec = PREDICATE_SPECS[relation.edge.predicate];
      return relation.edge.from === selectedNode.id ? spec.fromLabel : spec.inverseLabel;
    };

    // Add incoming nodes and links
    incoming.forEach(({ edge, relatedNode }) => {
      const relatedNodeId = sanitizeId(relatedNode.id);
      const link = getLinkStyle(labelOf({ edge, relatedNode }));
      graphDefinition += `  ${relatedNodeId}["${sanitizeTitle(relatedNode.title)}"] ${link}|"${labelOf({ edge, relatedNode })}"| ${selectedNodeId};\n`;
    });

    // Add outgoing nodes and links
    outgoing.forEach(({ edge, relatedNode }) => {
      const relatedNodeId = sanitizeId(relatedNode.id);
      const link = getLinkStyle(labelOf({ edge, relatedNode }));
      graphDefinition += `  ${selectedNodeId} ${link}|"${labelOf({ edge, relatedNode })}"| ${relatedNodeId}["${sanitizeTitle(relatedNode.title)}"];\n`;
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
