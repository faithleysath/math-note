import type { PluggableList } from 'unified';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * 编辑预览与阅读视图共用同一套 Markdown/KaTeX 配置。
 * mhchem（\ce / \pu）由 main.tsx 的 side-effect import 注册。
 */
export function markdownPlugins(): { remarkPlugins: PluggableList; rehypePlugins: PluggableList } {
  return {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: false }]],
  };
}
