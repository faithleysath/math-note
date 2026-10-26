import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MermaidError } from './MermaidBlock';
import { markdownComponents } from './markdownComponents';

/**
 * 这里只测降级路径：真渲染 svg 需要浏览器 DOM（mermaid.render 用 document），
 * 真机验证在浏览器里做。降级必须是「源码还在 + 一行错误提示 + 能重试」。
 */
describe('MermaidBlock 降级', () => {
  const code = 'mindmap\n  root((声现象))\n    声音的产生';

  it('渲染失败时保留原始 mermaid 源码', () => {
    const html = renderToStaticMarkup(<MermaidError code={code} message="Parse error" />);
    expect(html).toContain('language-mermaid');
    expect(html).toContain('mindmap');
    expect(html).toContain('声音的产生');
    expect(html).toContain('data-mermaid-error');
  });

  it('给出错误提示与重试按钮，不抛异常', () => {
    const html = renderToStaticMarkup(
      <MermaidError code={code} message="Parse error on line 2" onRetry={() => {}} />,
    );
    expect(html).toContain('Mermaid 渲染失败：Parse error on line 2');
    expect(html).toContain('重试');
  });

  it('没有重试回调时不渲染按钮', () => {
    const html = renderToStaticMarkup(<MermaidError code={code} message="boom" />);
    expect(html).not.toContain('<button');
  });
});

describe('markdownComponents 的 pre 拦截', () => {
  /** MDEditor 预览里 <pre> 会被追加一个复制按钮，所以 children 不止一个 */
  function renderPre(codeClass: string, source: string) {
    const Pre = markdownComponents().pre!;
    return renderToStaticMarkup(
      createElement(
        Pre,
        null,
        createElement('code', { key: 'code', className: codeClass }, source),
        createElement('div', { key: 'copy', className: 'copied' }, 'copy'),
      ),
    );
  }

  it('language-mermaid 的 code 节点被识别，换成 MermaidBlock（服务端渲染时停在“渲染中”）', () => {
    const html = renderPre('language-mermaid', 'mindmap\n  root((声现象))');
    expect(html).toContain('mermaid-block-pending');
    expect(html).not.toContain('<pre');
  });

  it('普通代码块仍走默认 <pre>，复制按钮等原有内容不丢', () => {
    const html = renderPre('language-ts', 'const a = 1;');
    expect(html).toContain('<pre');
    expect(html).toContain('language-ts');
    expect(html).toContain('const a = 1;');
    expect(html).toContain('copied');
  });
});
