import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { titleCarriesNumber } from '../../lib/display';
import { useMemo } from 'react';

interface MainChapterNodeRendererProps {
  node: ProcessedNode;
}

function chapterNumberLabel(node: ProcessedNode): string {
  if (!node.displayNumber) return '';
  // 编号常常已经写在标题里，避免「第 1 章 第一章 集合」
  if (titleCarriesNumber(node.title, node.displayNumber)) return '';
  return node.numberSource === 'source' ? `原书编号：${node.displayNumber}` : node.displayNumber;
}

const MainChapterNodeRenderer = ({ node }: MainChapterNodeRendererProps) => {
  const displayContent = useMemo(() => '&nbsp;' + node.content, [node.content]);

  return (
    <>
      <h2 className="text-3xl font-bold mt-4 mb-4 border-b pb-1">
        {chapterNumberLabel(node) && <span className="font-bold mr-3">{chapterNumberLabel(node)}</span>}
        &nbsp;&nbsp;
        {node.title}
      </h2>
      <div className="text-base">
        <MDEditor.Markdown
          source={displayContent}
          style={{ backgroundColor: 'transparent' }}
          {...markdownPlugins()}
        />
      </div>
    </>
  );
};

export default MainChapterNodeRenderer;
