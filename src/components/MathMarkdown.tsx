import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';

interface MathMarkdownProps {
  source: string;
  className?: string;
}

/** 全项目唯一的 Markdown + LaTeX 渲染入口 */
export function MathMarkdown({ source, className }: MathMarkdownProps) {
  if (!source || !source.trim()) return null;
  return (
    <div className={cn('math-markdown text-[15px] leading-7', className)} data-color-mode="light">
      <MDEditor.Markdown
        source={source}
        style={{ backgroundColor: 'transparent', color: 'inherit' }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      />
    </div>
  );
}
