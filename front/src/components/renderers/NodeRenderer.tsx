import { memo } from 'react';
import type { ProcessedLightweightNode } from '../../lib/types';
import { useNodeData } from '../../hooks/useNodeData';
import MainChapterNodeRenderer from './MainChapterNodeRenderer';
import SubChapterNodeRenderer from './SubChapterNodeRenderer';
import DefinitionNodeRenderer from './DefinitionNodeRenderer';
import TheoremNodeRenderer from './TheoremNodeRenderer';
import ExampleNodeRenderer from './ExampleNodeRenderer';
import DefaultNodeRenderer from './DefaultNodeRenderer';

interface NodeRendererProps {
  node: ProcessedLightweightNode;
}

const NodeRenderer = memo(({ node }: NodeRendererProps) => {
  const { node: fullNode, loading } = useNodeData(node.id);

  if (loading || !fullNode) {
    // You might want to render a loading skeleton here
    return <div>Loading...</div>;
  }

  switch (node.type) {
    case '主章节':
      return <MainChapterNodeRenderer node={node} fullNode={fullNode} />;
    case '子章节':
      return <SubChapterNodeRenderer node={node} fullNode={fullNode} />;
    case '定义':
      return <DefinitionNodeRenderer node={node} fullNode={fullNode} />;
    case '定理':
      return <TheoremNodeRenderer node={node} fullNode={fullNode} />;
    case '例题':
      return <ExampleNodeRenderer node={node} fullNode={fullNode} />;
    default:
      return <DefaultNodeRenderer node={node} />;
  }
});

NodeRenderer.displayName = 'NodeRenderer';

export default NodeRenderer;
