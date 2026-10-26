import { describe, expect, it } from 'vitest';
import { buildIndex, numberDisplayFor } from './graph';
import { mkNode } from './test-helpers';

const nodes = [
  mkNode('b', 'branch', null, 1024),
  mkNode('c', 'chapter', 'b', 1024),
  mkNode('s', 'section', 'c', 1024),
  mkNode('d', 'definition', 's', 1024),
  mkNode('t', 'proposition', 's', 2048, { kind: 'theorem' }),
  mkNode('law', 'proposition', 's', 3072, { kind: 'law' }),
  mkNode('exp', 'note', 's', 4096, { kind: 'experiment' }),
  mkNode('p', 'problem', 's', 5120, { kind: 'example' }),
];

const index = buildIndex(nodes, []);

describe('显示编号', () => {
  it('数学沿用自动生成的编号', () => {
    expect(numberDisplayFor(index, index.nodes.get('t')!, 'generated')).toEqual({
      text: '定理 1.1.1',
      source: 'generated',
    });
  });

  it('原书编号优先，并标为 source', () => {
    const withSource = buildIndex(
      nodes.map((node) =>
        node.id === 'law'
          ? { ...node, citation: { originalNumber: '17.2' } }
          : node,
      ),
      [],
    );
    expect(numberDisplayFor(withSource, withSource.nodes.get('law')!, 'source-first')).toEqual({
      text: '17.2',
      source: 'source',
    });
  });

  it('非数学学科不伪造定律/实验编号，但保留章节、定义、题目编号', () => {
    expect(numberDisplayFor(index, index.nodes.get('law')!, 'source-first').source).toBe('none');
    expect(numberDisplayFor(index, index.nodes.get('exp')!, 'source-first').source).toBe('none');
    expect(numberDisplayFor(index, index.nodes.get('c')!, 'source-first').text).toBe('第 1 章');
    expect(numberDisplayFor(index, index.nodes.get('d')!, 'source-first').text).toBe('定义 1.1.1');
    expect(numberDisplayFor(index, index.nodes.get('p')!, 'source-first').text).toBe('例题 1.1.1');
  });

  it('章节有原书编号时用原书编号', () => {
    const withSource = buildIndex(
      nodes.map((node) =>
        node.id === 'c' ? { ...node, citation: { originalNumber: '第一章' } } : node,
      ),
      [],
    );
    expect(numberDisplayFor(withSource, withSource.nodes.get('c')!, 'generated')).toEqual({
      text: '第一章',
      source: 'source',
    });
  });
});
