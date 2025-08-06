import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo } from 'react';

interface DefinitionNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const DefinitionNodeRenderer = ({ node, fullNode }: DefinitionNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return `&emsp;&emsp;**${node.displayNumber}**&emsp;${fullNode.content}`;
  }, [fullNode.content, node.displayNumber]);

  return (
    <div className="text-base">
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
    </div>
  );
};

export default DefinitionNodeRenderer;
