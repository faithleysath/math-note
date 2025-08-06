import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo } from 'react';

interface TheoremNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const TheoremNodeRenderer = ({ node, fullNode }: TheoremNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return `&emsp;&emsp;**${node.displayNumber}**&emsp;${fullNode.content}`;
  }, [fullNode.content, node.displayNumber]);

  return (
    <div className="text-base">
      <MDEditor.Markdown
        source={displayContent}
        style={{ whiteSpace: 'pre-wrap', backgroundColor: 'transparent' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
    </div>
  );
};

export default TheoremNodeRenderer;
