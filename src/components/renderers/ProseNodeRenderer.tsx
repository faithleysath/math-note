import MDEditor from '@uiw/react-md-editor';
import type { ProcessedNode } from '../../lib/schema';
import { NODE_TYPE_META } from '../../lib/schema';
import { markdownPlugins } from '../../lib/markdown';
import { titleCarriesNumber } from '../../lib/display';
import { useMemo } from 'react';

interface ProseNodeRendererProps {
  node: ProcessedNode;
}

/**
 * 概念 / 语境这类「没有教科书编号的正文节点」。
 * 沿用正文的排版，只在开头加一个类型标签，不引入新的卡片样式。
 */
const ProseNodeRenderer = ({ node }: ProseNodeRendererProps) => {
  const displayContent = useMemo(() => {
    const label = node.kind
      ? NODE_TYPE_META[node.type].kindLabel(node.kind)
      : NODE_TYPE_META[node.type].label;
    const number =
      node.displayNumber && !titleCarriesNumber(node.title, node.displayNumber)
        ? `**原书编号：${node.displayNumber}**\n\n`
        : '';
    return `${number}**${label}：${node.title}**\n\n${node.content}`;
  }, [node.content, node.title, node.type, node.kind, node.displayNumber]);

  return (
    <div className="text-base">
      <MDEditor.Markdown
        source={displayContent}
        style={{ backgroundColor: 'transparent' }}
        {...markdownPlugins()}
      />
    </div>
  );
};

export default ProseNodeRenderer;
