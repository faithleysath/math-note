import { describe, expect, it } from 'vitest';
import { buildIndex } from './graph';
import {
  findConflictHints,
  sameRelationKey,
  subtreeSize,
  validateCanReparent,
  validateNodePatch,
  validateGraphInvariants,
  validateNewEdge,
  validateNewNode,
  ValidationError,
} from './validate';
import { mkNode } from './test-helpers';
import type { Edge, Node } from './schema';

const node = (
  id: string,
  type: string,
  parentId: string | null,
  order: number,
  extra: Partial<Node> = {},
): Node => mkNode(id, type, parentId, order, extra);

function edge(id: string, from: string, to: string, predicate: Edge['predicate'], extra: Partial<Edge> = {}): Edge {
  return {
    id,
    from,
    to,
    predicate,
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
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
  node('pf1', 'proof', 't1', 1024, { title: '证明甲' }),
  node('cex1', 'counterexample', 't1', 2048, { title: '反例甲' }),
  node('con1', 'concept', 'b1', 2048, { title: '幂集概念', key: 'concept-power-set' }),
  node('ctx1', 'context', 'b1', 3072, { title: '实数域' }),
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

  it('分支下不能直接放命题', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewNode(index, { type: 'proposition', kind: 'theorem', title: 'x', parentId: 'b1' }),
    ).toThrowError(/「分支」下不能放「命题」/);
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
    ).toThrowError(/只能挂在题目/);
    expect(() =>
      validateNewNode(index, { type: 'attempt', title: '尝试', parentId: 'ex1' }),
    ).not.toThrow();
  });

  it('证明可以暂时放在目录下，也可以挂在命题下', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewNode(index, { type: 'proof', title: '证', parentId: 's11' }),
    ).not.toThrow();
    expect(() =>
      validateNewNode(index, { type: 'proof', title: '证', parentId: 't2' }),
    ).not.toThrow();
    // 题目下不能放证明
    expect(() =>
      validateNewNode(index, { type: 'proof', title: '证', parentId: 'ex1' }),
    ).toThrowError(/下不能放/);
  });

  it('不能把节点移动到自己的子孙下', () => {
    const index = buildIndex(base, []);
    expect(() => validateCanReparent(index, 'c1', 's11')).toThrowError(/自己的子孙/);
    expect(() => validateCanReparent(index, 'c1', 'b1')).not.toThrow();
  });

  it('子树大小算得对', () => {
    const index = buildIndex(base, []);
    expect(subtreeSize(index, 's11')).toBe(7);
    expect(subtreeSize(index, 'b1')).toBe(11);
  });
});

describe('边校验', () => {
  it('禁止自环', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't1', predicate: 'depends-on' }),
    ).toThrowError(/不能把节点连到它自己/);
  });

  it('proves 的起点必须是证明节点', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 'd1', to: 't1', predicate: 'proves' }),
    ).toThrowError(/不能用在/);
    expect(() =>
      validateNewEdge(index, { from: 'pf1', to: 't1', predicate: 'proves' }),
    ).not.toThrow();
  });

  it('refutes 的起点必须是反例节点', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 'ex1', to: 't1', predicate: 'refutes' }),
    ).toThrowError(/不能用在/);
    expect(() =>
      validateNewEdge(index, { from: 'cex1', to: 't1', predicate: 'refutes' }),
    ).not.toThrow();
  });

  it('拒绝完全相同的重复关系', () => {
    const edges = [edge('e1', 't1', 'd1', 'depends-on')];
    const index = buildIndex(base, edges);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 'd1', predicate: 'depends-on' }),
    ).toThrowError(/已经存在/);
  });

  it('端点相同但前提不同是两条不同断言，允许共存', () => {
    const edges = [edge('e1', 't1', 't2', 'implies', { condition: 'x>0' })];
    const index = buildIndex(base, edges);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't2', predicate: 'implies', condition: 'x<0' }),
    ).not.toThrow();
  });

  it('端点相同但语境不同也允许共存', () => {
    const edges = [edge('e1', 't1', 't2', 'implies', { contextId: 'ctx1' })];
    const index = buildIndex(base, edges);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't2', predicate: 'implies' }),
    ).not.toThrow();
  });

  it('等价关系正反只存一条', () => {
    const edges = [edge('e1', 't1', 't2', 'iff')];
    const index = buildIndex(base, edges);
    expect(() =>
      validateNewEdge(index, { from: 't2', to: 't1', predicate: 'iff' }),
    ).toThrowError(/已经存在/);
  });

  it('A⇒B 与 B⇒A 可以共存，只给警告', () => {
    const edges = [edge('e1', 't1', 't2', 'implies')];
    const index = buildIndex(base, edges);
    const result = validateNewEdge(index, { from: 't2', to: 't1', predicate: 'implies' });
    expect(result.warnings.map((w) => w.code)).toContain('mutual-implication');
  });

  it('A⇔B⇔C⇔A 合法，只提示冗余', () => {
    const triangles = [
      ...base,
      node('t3', 'theorem', 's11', 5120, { title: '定理丙' }),
    ];
    const edges = [
      edge('e1', 't1', 't2', 'iff'),
      edge('e2', 't2', 't3', 'iff'),
    ];
    const index = buildIndex(triangles, edges);
    const result = validateNewEdge(index, { from: 't3', to: 't1', predicate: 'iff' });
    expect(result.warnings.map((w) => w.code)).toContain('redundant-equivalence');
  });

  it('依赖成环被拒绝，且提示语说明是学习顺序问题', () => {
    const edges = [
      edge('e1', 't1', 't2', 'depends-on'),
      edge('e2', 't2', 'd1', 'depends-on'),
    ];
    const index = buildIndex(base, edges);
    let message = '';
    let suggestion = '';
    try {
      validateNewEdge(index, { from: 'd1', to: 't1', predicate: 'depends-on' });
    } catch (error) {
      message = error instanceof ValidationError ? error.message : String(error);
      suggestion = error instanceof ValidationError ? (error.issues[0]?.suggestion ?? '') : '';
    }
    expect(message).toMatch(/前置学习关系成环/);
    expect(message).toMatch(/幂集 → 定理甲 → 定理乙 → 幂集/);
    expect(suggestion).toMatch(/不代表数学矛盾/);
  });

  it('语境必须指向语境节点', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't2', predicate: 'implies', contextId: 'd1' }),
    ).toThrowError(/语境必须指向/);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't2', predicate: 'implies', contextId: 'ctx1' }),
    ).not.toThrow();
  });
});

describe('关系去重键', () => {
  it('条件或语境不同就不是同一条', () => {
    const a = { predicate: 'implies' as const, from: 't1', to: 't2', condition: 'x>0', contextId: 'ctx1' };
    expect(sameRelationKey(a, { ...a })).toBe(true);
    expect(sameRelationKey(a, { ...a, condition: 'x>0 ' })).toBe(true);
    expect(sameRelationKey(a, { ...a, condition: 'x<0' })).toBe(false);
    expect(sameRelationKey(a, { ...a, contextId: undefined })).toBe(false);
  });

  it('对称谓词忽略方向', () => {
    const a = { predicate: 'iff' as const, from: 't1', to: 't2' };
    const b = { predicate: 'iff' as const, from: 't2', to: 't1' };
    expect(sameRelationKey(a, b)).toBe(true);
  });
});

describe('全图不变式', () => {
  it('合法图没有任何错误', () => {
    const issues = validateGraphInvariants({ nodes: base, edges: [] });
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('父链成环会被发现', () => {
    const nodes = [
      node('b1', 'branch', null, 1024),
      node('c1', 'chapter', 'c2', 1024),
      node('c2', 'chapter', 'c1', 2048),
    ];
    const issues = validateGraphInvariants({ nodes, edges: [] });
    expect(issues.some((issue) => issue.code === 'cyclic-parent')).toBe(true);
  });

  it('非法的父子类型会被发现', () => {
    const nodes = [node('b1', 'branch', null, 1024), node('t1', 'theorem', 'b1', 1024)];
    const issues = validateGraphInvariants({ nodes, edges: [] });
    expect(issues.some((issue) => issue.code === 'invalid-child-type')).toBe(true);
  });

  it('重复术语键会被发现', () => {
    const nodes = [
      node('b1', 'branch', null, 1024),
      node('c1', 'chapter', 'b1', 1024),
      node('s1', 'section', 'c1', 1024),
      node('d1', 'definition', 's1', 1024, { key: 'x' }),
      node('d2', 'definition', 's1', 2048, { key: 'x' }),
    ];
    const issues = validateGraphInvariants({ nodes, edges: [] });
    expect(issues.some((issue) => issue.code === 'duplicate-key')).toBe(true);
  });

  it('非法边类型会被发现', () => {
    const issues = validateGraphInvariants({
      nodes: base,
      edges: [edge('e1', 'd1', 't1', 'proves')],
    });
    expect(issues.some((issue) => issue.code === 'invalid-endpoint-type')).toBe(true);
  });

  it('依赖成环会被发现，逻辑成环不会', () => {
    const depends = validateGraphInvariants({
      nodes: base,
      edges: [
        edge('e1', 't1', 't2', 'depends-on'),
        edge('e2', 't2', 't1', 'depends-on'),
      ],
    });
    expect(depends.some((issue) => issue.code === 'prerequisite-cycle')).toBe(true);

    const logical = validateGraphInvariants({
      nodes: base,
      edges: [
        edge('e1', 't1', 't2', 'implies'),
        edge('e2', 't2', 't1', 'implies'),
        edge('e3', 't1', 't2', 'iff'),
      ],
    });
    expect(logical.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('generalizes 的端点组合在导入时同样受约束', () => {
    // definition → proposition 在手动建边时会被拒绝，导入也必须拒绝
    const issues = validateGraphInvariants({
      nodes: base,
      edges: [edge('e1', 'd1', 't1', 'generalizes')],
    });
    expect(issues.some((issue) => issue.code === 'invalid-endpoint-type')).toBe(true);

    // 直接新增也要拒绝，两边的约束必须一致
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 'd1', to: 't1', predicate: 'generalizes' }),
    ).toThrowError(/不能用在/);

    const legal = validateGraphInvariants({
      nodes: base,
      edges: [edge('e2', 't1', 't2', 'generalizes')],
    });
    expect(legal.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(() =>
      validateNewEdge(index, { from: 't1', to: 't2', predicate: 'generalizes' }),
    ).not.toThrow();
  });

  it('被当作语境引用的节点不能改 kind', () => {
    const edges = [edge('e1', 't1', 't2', 'implies', { contextId: 'ctx1' })];
    const index = buildIndex(base, edges);
    expect(() => validateNodePatch(index, 'ctx1', { kind: 'method' })).toThrowError(/当作语境引用/);
    // 没有引用时可以改
    const free = buildIndex(base, []);
    expect(() => validateNodePatch(free, 'ctx1', { kind: 'method' })).not.toThrow();
  });

  it('语境引用不存在会被发现', () => {
    const issues = validateGraphInvariants({
      nodes: base,
      edges: [edge('e1', 't1', 't2', 'implies', { contextId: 'missing' })],
    });
    expect(issues.some((issue) => issue.code === 'invalid-context')).toBe(true);
  });
});

describe('多证明与反例', () => {
  it('一个命题可以挂两个独立证明，删掉一个不影响另一个', () => {
    const nodes = [
      node('b1', 'branch', null, 1024),
      node('c1', 'chapter', 'b1', 1024),
      node('s1', 'section', 'c1', 1024),
      node('t1', 'theorem', 's1', 1024, { title: '定理甲' }),
      node('p1', 'proof', 't1', 1024, { title: '证明一' }),
      node('p2', 'proof', 't1', 2048, { title: '证明二' }),
    ];
    const edges = [
      edge('e1', 'p1', 't1', 'proves'),
      edge('e2', 'p2', 't1', 'proves'),
      edge('e3', 'p1', 't1', 'depends-on'),
    ];
    const issues = validateGraphInvariants({ nodes, edges });
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);

    const index = buildIndex(nodes, edges);
    expect(index.edgesTo.get('t1')?.filter((item) => item.predicate === 'proves')).toHaveLength(2);

    // 删掉证明一：定理和证明二都还在
    const remaining = nodes.filter((item) => item.id !== 'p1');
    const remainingEdges = edges.filter((item) => item.from !== 'p1' && item.to !== 'p1');
    const after = buildIndex(remaining, remainingEdges);
    expect(after.nodes.has('t1')).toBe(true);
    expect(after.nodes.has('p2')).toBe(true);
    expect(after.edgesTo.get('t1')?.filter((item) => item.predicate === 'proves')).toHaveLength(1);
  });

  it('反例只能反驳明确的命题', () => {
    const index = buildIndex(base, []);
    expect(() =>
      validateNewEdge(index, { from: 'cex1', to: 'con1', predicate: 'refutes' }),
    ).toThrowError(/不能用在/);
  });

  it('反例线索指向被反驳的命题，而不是「某条边错了」', () => {
    const index = buildIndex(base, [edge('e1', 'cex1', 't1', 'refutes')]);
    const hint = findConflictHints(index).find((item) => item.code === 'counterexample-target');
    expect(hint?.message).toMatch(/定理甲/);
  });
});

describe('冲突提示', () => {
  it('互补推广给出核查线索', () => {
    const index = buildIndex(base, [
      edge('e1', 't1', 't2', 'generalizes'),
      edge('e2', 't2', 't1', 'generalizes'),
    ]);
    expect(findConflictHints(index).some((hint) => hint.code === 'mutual-generalization')).toBe(true);
  });

  it('同端点有多条不同前提时不会漏报', () => {
    const index = buildIndex(base, [
      edge('e1', 't1', 't2', 'implies', { condition: 'x>0' }),
      edge('e2', 't1', 't2', 'implies', { condition: 'x<0' }),
      edge('e3', 't2', 't1', 'implies', { condition: 'x>=0' }),
    ]);
    const hints = findConflictHints(index).filter(
      (hint) => hint.code === 'mutual-implication-different-conditions',
    );
    // 反向边要和两条正向边分别比较，不能被索引覆盖掉
    expect(hints).toHaveLength(2);
    expect(hints.flatMap((hint) => hint.edgeIds).sort()).toEqual(['e1', 'e2', 'e3', 'e3']);
  });

  it('不同前提的双向蕴含不会被当成无条件等价', () => {
    const index = buildIndex(base, [
      edge('e1', 't1', 't2', 'implies', { condition: 'x>0' }),
      edge('e2', 't2', 't1', 'implies', { condition: 'x<0' }),
    ]);
    expect(
      findConflictHints(index).some((hint) => hint.code === 'mutual-implication-different-conditions'),
    ).toBe(true);
  });
});
