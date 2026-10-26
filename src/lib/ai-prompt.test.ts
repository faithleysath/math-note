import { describe, expect, it } from 'vitest';
import { buildPrompt } from './ai-prompt';
import { NODE_TYPES, PREDICATES, type Node } from './schema';

const parent: Node = {
  id: 'parent-1',
  type: 'section',
  kind: 'section',
  title: '集合',
  content: '',
  parentId: null,
  order: 1024,
  createdAt: 0,
  updatedAt: 0,
};

const prompt = buildPrompt({ parent, nodes: [], lastChildId: null });

function lineOf(predicate: string): string {
  const lines = prompt.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`- ${predicate}：`));
  if (start === -1) throw new Error(`prompt 里没有 ${predicate}`);
  const block: string[] = [];
  for (let i = start; i < lines.length && (i === start || lines[i].startsWith('  ')); i += 1) {
    block.push(lines[i]);
  }
  return block.join('\n');
}

describe('AI 提示词与 Schema 一致', () => {
  it('示例里的节点类型都是合法的 9 种', () => {
    const types = [...prompt.matchAll(/"type":\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(NODE_TYPES).toContain(type);
    }
  });

  it('示例里的谓词都是合法的 9 种', () => {
    const predicates = [...prompt.matchAll(/"predicate":\s*"([^"]+)"/g)].map((match) => match[1]);
    expect(predicates.length).toBeGreaterThan(0);
    for (const predicate of predicates) {
      expect(PREDICATES).toContain(predicate);
    }
  });

  it('不会教模型输出 theorem 这种旧类型名', () => {
    expect(prompt).not.toContain('"type": "theorem"');
    expect(prompt).toContain('type=proposition');
    expect(prompt).toContain('kind=theorem');
  });

  it('证明使用 uses，而不是 depends-on', () => {
    expect(prompt).toMatch(/证明里实际用到的定义\/定理用 uses/);
    expect(prompt).toMatch(/不要用 depends-on/);
  });

  it('反例只反驳 proposition', () => {
    expect(prompt).toMatch(/refutes 的终点只能是 proposition/);
  });

  it('只有 depends-on 说禁止成环，implies / iff 允许成环', () => {
    expect(lineOf('depends-on')).toContain('禁止成环');
    expect(lineOf('implies')).toContain('允许成环');
    expect(lineOf('iff')).toContain('允许成环');
    expect(lineOf('cites')).toContain('不可传递');
  });

  it('generalizes 写出同类推广的组合约束', () => {
    const block = lineOf('generalizes');
    expect(block).toContain('definition → definition');
    expect(block).toContain('proposition → proposition');
  });

  it('要求只输出列出的字段', () => {
    expect(prompt).toContain('只输出上面示例里出现的字段');
  });
});
