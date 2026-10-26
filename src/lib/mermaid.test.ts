import { describe, expect, it } from 'vitest';
import { codeText, isMermaidLanguage, mermaidSourceOf } from './mermaid';

describe('mermaid 代码块识别', () => {
  it('language-mermaid 的 code 节点被识别', () => {
    const source = 'mindmap\n  root((声现象))\n    声音的产生';
    expect(mermaidSourceOf('language-mermaid', source)).toBe(source);
  });

  it('className 里还带别的 token 也能认出来', () => {
    expect(isMermaidLanguage('hljs language-mermaid')).toBe(true);
    expect(mermaidSourceOf('language-mermaid hljs', 'graph TD')).toBe('graph TD');
  });

  it('其他语言 / 没有 className 的不算 mermaid', () => {
    expect(isMermaidLanguage('language-ts')).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
    expect(mermaidSourceOf('language-ts', 'const a = 1;')).toBeNull();
    expect(mermaidSourceOf(undefined, '纯文本')).toBeNull();
  });

  it('空内容的 mermaid 代码块返回空串而不是 null（交给降级路径）', () => {
    expect(mermaidSourceOf('language-mermaid', '')).toBe('');
    expect(mermaidSourceOf('language-mermaid', '\n   \n')).toBe('\n   \n');
  });

  it('高亮插件把 children 拆成元素数组时仍能拼回源码', () => {
    const children = ['graph ', 'TD', ['\n  A-->B']];
    expect(codeText(children)).toBe('graph TD\n  A-->B');
    expect(mermaidSourceOf('language-mermaid', children)).toBe('graph TD\n  A-->B');
  });
});
