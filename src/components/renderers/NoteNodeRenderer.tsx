import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ProcessedNode } from '../../lib/types';
import { useMemo } from 'react';

interface NoteNodeRendererProps {
  node: ProcessedNode;
}

const NoteNodeRenderer = ({ node }: NoteNodeRendererProps) => {
  const displayContent = useMemo(() => {
    return node.content;
  }, [node.content]);

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
