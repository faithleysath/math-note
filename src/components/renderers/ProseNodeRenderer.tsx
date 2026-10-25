import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ProcessedNode } from '../../lib/schema';
import { NODE_TYPE_META } from '../../lib/schema';
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
    return `**${label}：${node.title}**\n\n${node.content}`;
  }, [node.content, node.title, node.type, node.kind]);

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

export default ProseNodeRenderer;
