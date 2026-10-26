import { Children, createElement, isValidElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import MermaidBlock from './MermaidBlock';
import { mermaidSourceOf } from '../lib/mermaid';

type CodeProps = { className?: unknown; children?: ReactNode };

/**
 * ```mermaid 围栏代码块在 react-markdown 里是 <pre><code className="language-mermaid">。
 * 这里只拦截这一种：换成 <MermaidBlock>，其他代码块原样走默认 <pre>（别丢 MDEditor 的高亮/样式）。
 * 用 pre 而不是 code 拦截，是为了不把块级内容塞进 <pre><code> 里。
 *
 * 注意：MDEditor 的预览会在 <pre> 里追加一个复制按钮（rehype-rewrite），
 * 所以不能假设 <pre> 只有一个子节点，得把 code 找出来。
 */
const Pre: Components['pre'] = (props) => {
  const codeChild = Children.toArray(props.children).find(
    (child) => isValidElement(child) && child.type === 'code',
  );

  if (codeChild && isValidElement(codeChild)) {
    const codeProps = codeChild.props as CodeProps;
    const source = mermaidSourceOf(codeProps.className, codeProps.children);
    if (source !== null) return createElement(MermaidBlock, { code: source });
  }

  // 去掉 react-markdown 的 node（不能落到 DOM 上）；children 单独传，避免 createElement 的第三参歧义
  const domProps = { ...props } as Record<string, unknown>;
  delete domProps.node;
  delete domProps.children;
  return createElement('pre', domProps, props.children);
};

const components: Components = { pre: Pre };

/**
 * 正文 markdown 的组件覆盖（与 markdownPlugins() 配套使用）。
 * 目前只有 mermaid；以后要覆盖别的元素也加到这里，渲染组件不用各写一遍。
 */
export function markdownComponents(): Components {
  return components;
}
