import { memo } from 'react';
import type { ProcessedNode } from '../../lib/schema';
import { useGraphStore } from '../../stores/useGraphStore';
import NodeEditor from './NodeEditor';
import MainChapterNodeRenderer from './MainChapterNodeRenderer';
import SubChapterNodeRenderer from './SubChapterNodeRenderer';
import DefinitionNodeRenderer from './DefinitionNodeRenderer';
import TheoremNodeRenderer from './TheoremNodeRenderer';
import NoteNodeRenderer from './NoteNodeRenderer';
import ExerciseNodeRenderer from './ExerciseNodeRenderer';
import SolutionRecordRenderer from './SolutionRecordRenderer';
import ProseNodeRenderer from './ProseNodeRenderer';
import DefaultNodeRenderer from './DefaultNodeRenderer';

interface NodeRendererProps {
  node: ProcessedNode;
}

/**
 * v5 只有 9 种节点类型，显示风格由 type + kind 决定：
 * section(kind=chapter) 用大章节样式，其余 section 用居中节样式；
 * proposition 复用原来的定理排版（编号里已经带上「定理 / 性质 / 公式」）；
 * problem 复用原来的例题/练习卡片。
 */
const NodeRenderer = memo(({ node }: NodeRendererProps) => {
  const editingId = useGraphStore((state) => state.editingId);

  if (editingId === node.id) {
    return <NodeEditor node={node} />;
  }

  switch (node.type) {
    case 'section':
      return node.kind === 'chapter' || node.displayNumber.startsWith('第') ? (
        <MainChapterNodeRenderer node={node} />
      ) : (
        <SubChapterNodeRenderer node={node} />
      );
    case 'definition':
      return <DefinitionNodeRenderer node={node} />;
    case 'proposition':
      return <TheoremNodeRenderer node={node} />;
    case 'proof':
    case 'attempt':
      return <SolutionRecordRenderer node={node} />;
    case 'problem':
      return <ExerciseNodeRenderer node={node} />;
    case 'counterexample':
      return <ExerciseNodeRenderer node={node} solutionLabel="显示/隐藏说明" />;
    case 'note':
      return node.kind === 'context' || node.kind === 'topic' ? (
        <ProseNodeRenderer node={node} />
      ) : (
        <NoteNodeRenderer node={node} />
      );
    default:
      return <DefaultNodeRenderer node={node} />;
  }
});

NodeRenderer.displayName = 'NodeRenderer';

export default NodeRenderer;
