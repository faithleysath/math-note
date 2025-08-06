import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo } from 'react';

interface ExampleNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const ExampleNodeRenderer = ({ node, fullNode }: ExampleNodeRendererProps) => {
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

export default ExampleNodeRenderer;
