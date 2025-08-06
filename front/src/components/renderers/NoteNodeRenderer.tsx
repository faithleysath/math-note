import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node, ProcessedLightweightNode } from '../../lib/types';
import { useMemo } from 'react';

interface NoteNodeRendererProps {
  node: ProcessedLightweightNode;
  fullNode: Node;
}

const NoteNodeRenderer = ({ fullNode }: NoteNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return fullNode.content;
  }, [fullNode.content]);

  return (
    <div className="text-base p-4 border-l-4 border-yellow-400 bg-yellow-50 my-2">
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
    </div>
  );
};

export default NoteNodeRenderer;
