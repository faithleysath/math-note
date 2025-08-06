import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ProcessedNode } from '../../lib/types';
import { useMemo } from 'react';

interface SubChapterNodeRendererProps {
  node: ProcessedNode;
}

const SubChapterNodeRenderer = ({ node }: SubChapterNodeRendererProps) => {
  const displayContent = useMemo(() => '*' + node.content + '*', [node.content]);

  return (
    <>
      <h2 className="text-2xl font-bold mt-1 mb-2 text-center">
        <span className="font-bold mr-3">{node.displayNumber}</span>
        &nbsp;&nbsp;
        {node.title}
      </h2>
      <div className="text-base text-center">
        <MDEditor.Markdown
          source={displayContent}
          style={{ backgroundColor: 'transparent' }}
          remarkPlugins={[remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
        />
      </div>
    </>
  );
};

export default SubChapterNodeRenderer;
