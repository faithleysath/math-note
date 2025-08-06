import { memo } from 'react';
import type { ProcessedLightweightNode } from '../../lib/types';
import { useNodeData } from '../../hooks/useNodeData';
import { useAppStore } from '../../stores/useAppStore';
import NodeEditor from './NodeEditor'; // We will create this component next
import MainChapterNodeRenderer from './MainChapterNodeRenderer';
import SubChapterNodeRenderer from './SubChapterNodeRenderer';
import DefinitionNodeRenderer from './DefinitionNodeRenderer';
import TheoremNodeRenderer from './TheoremNodeRenderer';
import ExampleNodeRenderer from './ExampleNodeRenderer';
import NoteNodeRenderer from './NoteNodeRenderer';
import ExerciseNodeRenderer from './ExerciseNodeRenderer';
import DefaultNodeRenderer from './DefaultNodeRenderer';

interface NodeRendererProps {
  node: ProcessedLightweightNode;
}

const NodeRenderer = memo(({ node }: NodeRendererProps) => {
  const { node: fullNode, loading } = useNodeData(node.id);
  const editingNodeId = useAppStore(state => state.editingNodeId);

  if (loading || !fullNode) {
    // You might want to render a loading skeleton here
    return <div>Loading...</div>;
  }

  if (editingNodeId === node.id) {
    return <NodeEditor node={fullNode} />;
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
    case '笔记':
      return <NoteNodeRenderer node={node} fullNode={fullNode} />;
    case '练习':
      return <ExerciseNodeRenderer node={node} fullNode={fullNode} />;
    default:
      return <DefaultNodeRenderer node={node} />;
  }
});

NodeRenderer.displayName = 'NodeRenderer';

export default NodeRenderer;
