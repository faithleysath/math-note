import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { titleCarriesNumber } from '../../lib/display';
import { useMemo } from 'react';

interface SubChapterNodeRendererProps {
  node: ProcessedNode;
}

function chapterNumberLabel(node: ProcessedNode): string {
  if (!node.displayNumber) return '';
  // 编号常常已经写在标题里，避免「第 1 章 第一章 集合」
  if (titleCarriesNumber(node.title, node.displayNumber)) return '';
  return node.numberSource === 'source' ? `原书编号：${node.displayNumber}` : node.displayNumber;
}

const SubChapterNodeRenderer = ({ node }: SubChapterNodeRendererProps) => {
  const displayContent = useMemo(() => {
    // 空内容时不加斜体标记，否则会渲染出两个孤零零的 *
    if (!node.content.trim()) return '';
    return '*' + node.content + '*';
  }, [node.content]);

  return (
    <>
      <h2 className="text-2xl font-bold mt-1 mb-2 text-center">
        {chapterNumberLabel(node) && <span className="font-bold mr-3">{chapterNumberLabel(node)}</span>}
        &nbsp;&nbsp;
        {node.title}
      </h2>
      <div className="text-base text-center">
        <MDEditor.Markdown
          source={displayContent}
          style={{ backgroundColor: 'transparent' }}
          {...markdownPlugins()}
        />
      </div>
    </>
  );
};

export default SubChapterNodeRenderer;
