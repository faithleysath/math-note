import { memo } from 'react';
import type { ProcessedNode } from '../../lib/types';
import { useAppStore } from '../../stores/useAppStore';
import NodeEditor from './NodeEditor';
import MainChapterNodeRenderer from './MainChapterNodeRenderer';
import SubChapterNodeRenderer from './SubChapterNodeRenderer';
import DefinitionNodeRenderer from './DefinitionNodeRenderer';
import TheoremNodeRenderer from './TheoremNodeRenderer';
import ExampleNodeRenderer from './ExampleNodeRenderer';
import NoteNodeRenderer from './NoteNodeRenderer';
import ExerciseNodeRenderer from './ExerciseNodeRenderer';
import SolutionRecordRenderer from './SolutionRecordRenderer';
import DefaultNodeRenderer from './DefaultNodeRenderer';

interface NodeRendererProps {
  node: ProcessedNode;
}

const NodeRenderer = memo(({ node }: NodeRendererProps) => {
  const editingNodeId = useAppStore(state => state.editingNodeId);

  if (editingNodeId === node.id) {
    return <NodeEditor node={node} />;
  }

  switch (node.type) {
    case '主章节':
      return <MainChapterNodeRenderer node={node} />;
    case '子章节':
      return <SubChapterNodeRenderer node={node} />;
    case '定义':
      return <DefinitionNodeRenderer node={node} />;
    case '定理':
      return <TheoremNodeRenderer node={node} />;
    case '例题':
      return <ExampleNodeRenderer node={node} />;
    case '笔记':
      return <NoteNodeRenderer node={node} />;
    case '练习':
      return <ExerciseNodeRenderer node={node} />;
    case '解题记录':
      return <SolutionRecordRenderer node={node} />;
    default:
      return <DefaultNodeRenderer node={node} />;
  }
});

NodeRenderer.displayName = 'NodeRenderer';

export default NodeRenderer;
