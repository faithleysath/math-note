import { memo } from 'react';
import type { ProcessedNode } from '../../lib/schema';
import { useGraphStore } from '../../stores/useGraphStore';
import NodeEditor from './NodeEditor';
import MainChapterNodeRenderer from './MainChapterNodeRenderer';
import SubChapterNodeRenderer from './SubChapterNodeRenderer';
import DefinitionNodeRenderer from './DefinitionNodeRenderer';
import TheoremNodeRenderer from './TheoremNodeRenderer';
import LemmaNodeRenderer from './LemmaNodeRenderer';
import CorollaryNodeRenderer from './CorollaryNodeRenderer';
import ExampleNodeRenderer from './ExampleNodeRenderer';
import NoteNodeRenderer from './NoteNodeRenderer';
import ExerciseNodeRenderer from './ExerciseNodeRenderer';
import SolutionRecordRenderer from './SolutionRecordRenderer';
import ProseNodeRenderer from './ProseNodeRenderer';
import DefaultNodeRenderer from './DefaultNodeRenderer';

interface NodeRendererProps {
  node: ProcessedNode;
}

const NodeRenderer = memo(({ node }: NodeRendererProps) => {
  const editingId = useGraphStore((state) => state.editingId);

  if (editingId === node.id) {
    return <NodeEditor node={node} />;
  }

  switch (node.type) {
    case 'chapter':
      return <MainChapterNodeRenderer node={node} />;
    case 'section':
      return <SubChapterNodeRenderer node={node} />;
    case 'definition':
      return <DefinitionNodeRenderer node={node} />;
    case 'theorem':
      return <TheoremNodeRenderer node={node} />;
    case 'lemma':
      return <LemmaNodeRenderer node={node} />;
    case 'corollary':
      return <CorollaryNodeRenderer node={node} />;
    case 'example':
      return <ExampleNodeRenderer node={node} />;
    case 'note':
      return <NoteNodeRenderer node={node} />;
    case 'exercise':
      return <ExerciseNodeRenderer node={node} />;
    case 'attempt':
    case 'proof':
      return <SolutionRecordRenderer node={node} />;
    case 'counterexample':
      return <ExerciseNodeRenderer node={node} />;
    case 'concept':
    case 'context':
      return <ProseNodeRenderer node={node} />;
    default:
      return <DefaultNodeRenderer node={node} />;
  }
});

NodeRenderer.displayName = 'NodeRenderer';

export default NodeRenderer;
