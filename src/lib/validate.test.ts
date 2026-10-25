import { describe, expect, it } from 'vitest';
import { buildIndex } from './graph';
import { findContradictions, subtreeSize, validateCanReparent, validateNewEdge, validateNewNode, ValidationError } from './validate';
import type { Edge, Node, NodeType } from './schema';

function node(
  id: string,
  type: NodeType,
  parentId: string | null,
  order: number,
  extra: Partial<Node> = {},
): Node {
  return {
    id,
    type,
    title: id,
    content: '',
    parentId,
    order,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

function edge(id: string, from: string, to: string, predicate: Edge['predicate']): Edge {
  return {
    id,
    from,
    to,
    predicate,
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
  };
}

const base = [
  node('b1', 'branch', null, 1024),
  node('c1', 'chapter', 'b1', 1024),
  node('s11', 'section', 'c1', 1024),
  node('d1', 'definition', 's11', 1024, { title: '幂集', key: 'power-set' }),
  node('t1', 'theorem', 's11', 2048, { title: '定理甲' }),
  node('t2', 'theorem', 's11', 3072, { title: '定理乙' }),
  node('ex1', 'exercise', 's11', 4096, { title: '练习甲' }),
];

describe('节点校验', () => {
  it('拒绝空标题', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewNode(index, { type: 'note', title: '  ', parentId: 's11' }),
    ).toThrowError(/标题不能为空/);
  });

  it('只有分支能做根节点', () => {
    const index = buildIndex(base, []);
    expect(() => validateNewNode(index, { type: 'note', title: 'x', parentId: null })).toThrowError(
      /只有「分支」/,
    );
  });

  it('分支下不能直接放定理', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewNode(index, { type: 'theorem', title: 'x', parentId: 'b1' }),
    ).toThrowError(/「分支」下不能放「定理」/);
  });

  it('术语键必须唯一且格式合法', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewNode(index, { type: 'definition', title: 'x', parentId: 's11', key: 'power-set' }),
    ).toThrowError(/已被/);
    expect(() =>
      validateNewNode(index, { type: 'definition', title: 'x', parentId: 's11', key: 'Bad Key' }),
    ).toThrowError(/小写字母/);
  });

  it('解题记录只能挂在例题或练习下', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewNode(index, { type: 'attempt', title: '尝试', parentId: 's11' }),
    ).toThrowError(/只能挂在例题或练习/);
    expect(() =>
      validateNewNode(index, { type: 'attempt', title: '尝试', parentId: 'ex1' }),
    ).not.toThrow();
  });

  it('不能把节点移动到自己的子孙下', () => {
    const index = buildIndex(base, []);
    expect(() => validateCanReparent(index, 'c1', 's11')).toThrowError(/自己的子孙/);
    expect(() => validateCanReparent(index, 'c1', 'b1')).not.toThrow();
  });

  it('子树大小算得对', () => {
    const index = buildIndex(base, []);
    expect(subtreeSize(index, 's11')).toBe(5);
    expect(subtreeSize(index, 'b1')).toBe(7);
  });
});

describe('边校验', () => {
  it('禁止自环', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't1', predicate: 'depends-on' }),
    ).toThrowError(/不能把节点连到它自己/);
  });

  it('检查类型白名单', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 'd1', to: 't1', predicate: 'proves' }),
    ).toThrowError(/不能用在/);
  });

  it('拒绝重复关系', () => {
    const edges = [edge('e1', 't1', 'd1', 'depends-on')];
    const index = buildIndex(base, edges);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 'd1', predicate: 'depends-on' }),
    ).toThrowError(/已经存在/);
  });

  it('等价关系拒绝反向重复', () => {
    const edges = [edge('e1', 't1', 't2', 'iff')];
    const index = buildIndex(base, edges);
    expect(() =>
      validateNewEdge(index, { from: 't2', to: 't1', predicate: 'iff' }),
    ).toThrowError(/只存一条/);
  });

  it('拒绝会成环的依赖', () => {
    const edges = [
      edge('e1', 't1', 't2', 'depends-on'),
      edge('e2', 't2', 'd1', 'depends-on'),
    ];
    const index = buildIndex(base, edges);
    let message = '';
    try {
      validateNewEdge(index, { from: 'd1', to: 't1', predicate: 'depends-on' });
    } catch (error) {
      message = error instanceof ValidationError ? error.message : String(error);
    }
    expect(message).toMatch(/循环依赖/);
    expect(message).toMatch(/幂集 → 定理甲 → 定理乙 → 幂集/);
  });

  it('能发现「同一对命题既蕴含又是反例」的矛盾', () => {
    const edges = [edge('e1', 't1', 't2', 'implies'), edge('e2', 'ex1', 't2', 'refutes')];
    const index = buildIndex(base, edges);
    expect(findContradictions(index)).toHaveLength(0);

    const conflicting = buildIndex(base, [
      edge('e1', 't1', 't2', 'implies'),
      edge('e3', 't1', 't2', 'refutes'),
    ]);
    expect(findContradictions(conflicting).length).toBeGreaterThan(0);
  });
});
