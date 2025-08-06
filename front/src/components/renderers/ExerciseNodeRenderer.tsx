import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo } from 'react';

interface ExerciseNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const ExerciseNodeRenderer = ({ fullNode }: ExerciseNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return fullNode.content;
  }, [fullNode.content]);

  const solutionContent = useMemo(() => {
    return fullNode.solution;
  }, [fullNode.solution]);

  return (
    <div className="text-base p-4 border-l-4 border-blue-400 bg-blue-50 my-2">
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
      {solutionContent && (
        <>
          <hr className="my-4" />
          <MDEditor.Markdown
            source={solutionContent}
            style={{ backgroundColor: 'transparent' }}
            remarkPlugins={[remarkMath]}
            rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
          />
        </>
      )}
    </div>
  );
};

export default ExerciseNodeRenderer;
