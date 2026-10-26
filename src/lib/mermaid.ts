import mermaid from 'mermaid';

/**
 * 全站 Mermaid 图共用一套外观：目录思维导图、关系图、正文里手写的图应该长得一致。
 * 只在第一次渲染前 initialize 一次，避免各处 initialize 互相覆盖配置。
 */
export const MERMAID_THEME = 'neutral';

let initialized = false;

export function ensureMermaid(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: MERMAID_THEME,
    // 渲染失败时 mermaid 默认会往 <body> 里塞一张错误图；正文里由 MermaidBlock 自己降级。
    suppressErrorRendering: true,
  });
  initialized = true;
}

/** react-markdown 给围栏代码块的 className 形如 `language-mermaid`（可能还带别的 token） */
export function isMermaidLanguage(className: unknown): boolean {
  if (typeof className !== 'string') return false;
  return className.split(/\s+/).includes('language-mermaid');
}

/**
 * 把代码块的 children 拼成纯文本。
 * react-markdown 正常给的是字符串（高亮插件会拆成元素数组），这里两种都兜住。
 */
export function codeText(children: unknown): string {
  if (children === null || children === undefined || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(codeText).join('');
  const props = (children as { props?: { children?: unknown } }).props;
  return props ? codeText(props.children) : '';
}

/**
 * 识别 ```mermaid 代码块并取出图源。
 * 不是 mermaid 返回 null；是 mermaid 但内容为空返回 ''（由调用方走降级）。
 */
export function mermaidSourceOf(className: unknown, children: unknown): string | null {
  if (!isMermaidLanguage(className)) return null;
  return codeText(children);
}
