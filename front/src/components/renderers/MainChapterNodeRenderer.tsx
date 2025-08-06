import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ProcessedNode } from '../../lib/types';
import { useMemo } from 'react';

interface MainChapterNodeRendererProps {
  node: ProcessedNode;
}

const MainChapterNodeRenderer = ({ node }: MainChapterNodeRendererProps) => {
  const displayContent = useMemo(() => '&nbsp;' + node.content, [node.content]);

  return (
    <>
      <h2 className="text-3xl font-bold mt-4 mb-4 border-b pb-1">
        <span className="font-bold mr-3">{node.displayNumber}</span>
        &nbsp;&nbsp;
        {node.title}
      </h2>
      <div className="text-base">
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

export default MainChapterNodeRenderer;
