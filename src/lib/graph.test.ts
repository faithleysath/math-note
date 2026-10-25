import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  coveredKnowledge,
  coveringProblems,
  nodesMatching,
  buildIndex,
  collectSubtree,
  computeInsertOrder,
  cycleNodes,
  dumpTree,
  equivalenceClasses,
  findImplicationPaths,
  inferLogicalRelations,
  ORDER_GAP,
  reachable,
  reachableStructural,
  searchNodes,
  topoSort,
} from './graph';
import { mkEdge as edge, mkNode as node } from './test-helpers';
import type { Node } from './schema';

/** 一个两章两节的最小结构，数字全部可预测 */
function textbook() {
  return [
    node('b1', 'branch', null, 1024),
    node('c1', 'chapter', 'b1', 1024),
    node('s11', 'section', 'c1', 1024),
    node('d1', 'definition', 's11', 1024),
    node('t1', 'theorem', 's11', 2048),
    node('t2', 'theorem', 's11', 3072),
    node('c2', 'chapter', 'b1', 2048),
    node('s21', 'section', 'c2', 1024),
    node('t3', 'theorem', 's21', 1024),
  ];
}

describe('教科书编号', () => {
  it('按路径算出章节与命题编号', () => {
    const index = buildIndex(textbook(), []);
    expect(index.numbering.get('c1')).toBe('第 1 章');
    expect(index.numbering.get('s11')).toBe('1.1');
    expect(index.numbering.get('d1')).toBe('定义 1.1.1');
    expect(index.numbering.get('t1')).toBe('定理 1.1.1');
    expect(index.numbering.get('t2')).toBe('定理 1.1.2');
    expect(index.numbering.get('c2')).toBe('第 2 章');
    expect(index.numbering.get('s21')).toBe('2.1');
    expect(index.numbering.get('t3')).toBe('定理 2.1.1');
    expect(index.numbering.has('b1')).toBe(false);
  });

  it('与输入数组顺序无关', () => {
    const forward = buildIndex(textbook(), []);
    const shuffled = [...textbook()].reverse();
    const backward = buildIndex(shuffled, []);
    for (const id of ['c1', 's11', 'd1', 't1', 't2', 'c2', 's21', 't3']) {
      expect(backward.numbering.get(id)).toBe(forward.numbering.get(id));
    }
  });

  it('每个分支的章节各自从第 1 章开始', () => {
    const nodes = [
      node('b1', 'branch', null, 1024),
      node('c1', 'chapter', 'b1', 1024),
      node('b2', 'branch', null, 2048),
      node('c2', 'chapter', 'b2', 1024),
    ];
    const index = buildIndex(nodes, []);
    expect(index.numbering.get('c1')).toBe('第 1 章');
    expect(index.numbering.get('c2')).toBe('第 1 章');
  });

  it('章节下直接放命题时省略节号', () => {
    const nodes = [
      node('b1', 'branch', null, 1024),
      node('c1', 'chapter', 'b1', 1024),
      node('t1', 'theorem', 'c1', 1024),
      node('t2', 'theorem', 'c1', 2048),
    ];
    const index = buildIndex(nodes, []);
    expect(index.numbering.get('t1')).toBe('定理 1.1');
    expect(index.numbering.get('t2')).toBe('定理 1.2');
  });

  it('调整 order 后编号跟着变', () => {
    const nodes = textbook();
    const t1 = nodes.find((n) => n.id === 't1') as Node;
    const t2 = nodes.find((n) => n.id === 't2') as Node;
    t1.order = t2.order + 1;
    const index = buildIndex(nodes, []);
    expect(index.numbering.get('t1')).toBe('定理 1.1.2');
    expect(index.numbering.get('t2')).toBe('定理 1.1.1');
  });
});

describe('树遍历', () => {
  it('collectSubtree 返回 DFS 前序并包含自身', () => {
    const index = buildIndex(textbook(), []);
    expect(collectSubtree(index, 's11')).toEqual(['s11', 'd1', 't1', 't2']);
    expect(collectSubtree(index, 'c1')).toEqual(['c1', 's11', 'd1', 't1', 't2']);
    expect(collectSubtree(index, 'b1')).toHaveLength(9);
  });

  it('ancestorIds 从根到父', () => {
    const index = buildIndex(textbook(), []);
    expect(ancestorIds(index, 't1')).toEqual(['b1', 'c1', 's11']);
    expect(ancestorIds(index, 'b1')).toEqual([]);
  });

  it('dumpTree 可读', () => {
    const index = buildIndex(textbook(), []);
    expect(dumpTree(index)).toContain('proposition [定理 1.1.1] t1');
  });
});

describe('排序', () => {
  it('末尾追加', () => {
    const index = buildIndex(textbook(), []);
    const position = computeInsertOrder(index, 's11', null);
    expect(position.order).toBe(3072 + ORDER_GAP);
    expect(position.rebalance).toBe(false);
  });

  it('插入到两个节点之间取中点', () => {
    const index = buildIndex(textbook(), []);
    const position = computeInsertOrder(index, 's11', 'd1');
    expect(position.order).toBe(1536);
    expect(position.rebalance).toBe(false);
  });

  it('间隙用尽时要求重排', () => {
    const nodes = [
      node('b1', 'branch', null, 1024),
      node('n1', 'note', 'b1', 1024),
      node('n2', 'note', 'b1', 1025),
    ];
    const index = buildIndex(nodes, []);
    const position = computeInsertOrder(index, 'b1', 'n1');
    expect(position.rebalance).toBe(true);
  });
});

describe('结构遍历', () => {
  const nodes = [
    node('def', 'definition', null, 1024),
    node('thmA', 'theorem', null, 2048),
    node('thmB', 'theorem', null, 3072),
    node('thmC', 'theorem', null, 4096),
  ];
  const edges = [
    edge('thmA', 'def', 'depends-on'),
    edge('thmB', 'thmA', 'depends-on'),
    edge('thmC', 'thmB', 'depends-on'),
  ];

  it('依赖可以传递', () => {
    const index = buildIndex(nodes, edges);
    expect([...reachable(index, 'thmC', 'depends-on')].sort()).toEqual(['def', 'thmA', 'thmB']);
  });

  it('结构查询默认保留已推翻的边，作为历史记录', () => {
    const index = buildIndex(nodes, [
      edge('thmA', 'def', 'depends-on', { status: 'disproven' }),
    ]);
    expect(reachable(index, 'thmA', 'depends-on').has('def')).toBe(true);
    expect(
      reachableStructural(index, 'thmA', 'depends-on', { includeDisproven: false }).has('def'),
    ).toBe(false);
  });

  it('iff 在结构上双向可达（即使只存一条）', () => {
    const index = buildIndex(nodes, [edge('thmA', 'thmB', 'iff')]);
    expect(reachable(index, 'thmA', 'iff').has('thmB')).toBe(true);
    expect(reachable(index, 'thmB', 'iff').has('thmA')).toBe(true);
  });
});

describe('数学推理', () => {
  const nodes = [
    node('a', 'theorem', null, 1024, { title: 'x²=1' }),
    node('b', 'theorem', null, 2048, { title: 'x=1' }),
    node('c', 'theorem', null, 3072, { title: 'x>0' }),
    node('ctx', 'context', null, 4096, { title: '实数域' }),
  ];

  it('带前提的路径不能变成无条件结论', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'implies', { condition: 'x>0' }),
      edge('b', 'c', 'implies'),
    ]);
    const derived = findImplicationPaths(index, 'a', 'c');
    expect(derived.length).toBeGreaterThan(0);
    expect(derived[0].unconditional).toBe(false);
    expect(derived[0].unresolvedConditions).toEqual(['x>0']);
  });

  it('语境明确、无前提、已审核才算无条件', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'implies', { contextId: 'ctx', reviewState: 'human-reviewed' }),
      edge('b', 'c', 'implies', { contextId: 'ctx', reviewState: 'human-reviewed' }),
    ]);
    const derived = findImplicationPaths(index, 'a', 'c');
    expect(derived[0].unconditional).toBe(true);
    expect(derived[0].contextId).toBe('ctx');
    expect(derived[0].verification).toBe('human-reviewed');
  });

  it('语境不同时不能合并', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'implies', { contextId: 'ctx' }),
      edge('b', 'c', 'implies', { contextId: 'other' }),
    ]);
    const derived = findImplicationPaths(index, 'a', 'c');
    expect(derived[0].contextId).toBeUndefined();
    expect(derived[0].unconditional).toBe(false);
  });

  it('已推翻的边不参与推理', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'implies', { status: 'disproven' }),
      edge('b', 'c', 'implies'),
    ]);
    expect(inferLogicalRelations(index, 'a').map((rel) => rel.to)).not.toContain('c');
  });

  it('猜想默认不参与，显式要求时才参与', () => {
    const index = buildIndex(nodes, [edge('a', 'b', 'implies', { status: 'conjecture' })]);
    expect(inferLogicalRelations(index, 'a')).toHaveLength(0);
    expect(inferLogicalRelations(index, 'a', { includeConjectures: true })).toHaveLength(1);
  });

  it('reviewed-only 过滤掉未审核的边', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'implies', { reviewState: 'human-reviewed' }),
      edge('b', 'c', 'implies', { reviewState: 'unreviewed' }),
    ]);
    expect(inferLogicalRelations(index, 'a', { mode: 'reviewed-only' }).map((r) => r.to)).toEqual(['b']);
    expect(inferLogicalRelations(index, 'a').map((r) => r.to)).toContain('c');
  });

  it('反例反驳的是命题，不会被当成「蕴含错误」', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'implies'),
      edge('cex', 'a', 'refutes'),
    ]);
    // refutes 的起点必须是 counterexample 类型；这里只验证推理链不受影响
    expect(inferLogicalRelations(index, 'a').map((rel) => rel.to)).toEqual(['b']);
  });
});

describe('等价类', () => {
  const nodes = [
    node('a', 'theorem', null, 1024),
    node('b', 'theorem', null, 2048),
    node('c', 'theorem', null, 3072),
    node('ctx1', 'context', null, 4096),
    node('ctx2', 'context', null, 5120),
  ];

  it('同语境下的三方等价合成一类', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'iff', { contextId: 'ctx1', reviewState: 'human-reviewed' }),
      edge('b', 'c', 'iff', { contextId: 'ctx1', reviewState: 'human-reviewed' }),
      edge('c', 'a', 'iff', { contextId: 'ctx1', reviewState: 'human-reviewed' }),
    ]);
    const classes = equivalenceClasses(index);
    expect(classes).toHaveLength(1);
    expect([...classes[0].members].sort()).toEqual(['a', 'b', 'c']);
  });

  it('不同语境的等价关系不并在一起', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'iff', { contextId: 'ctx1', reviewState: 'human-reviewed' }),
      edge('b', 'c', 'iff', { contextId: 'ctx2', reviewState: 'human-reviewed' }),
    ]);
    const classes = equivalenceClasses(index);
    expect(classes).toHaveLength(2);
    expect(classes.map((item) => item.contextId).sort()).toEqual(['ctx1', 'ctx2']);
  });

  it('已推翻的等价关系不进入已证等价类', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'iff', { status: 'disproven' }),
    ]);
    expect(equivalenceClasses(index)).toHaveLength(0);
  });

  it('没有明确语境的等价关系只算候选', () => {
    const index = buildIndex(nodes, [edge('a', 'b', 'iff')]);
    expect(equivalenceClasses(index)).toHaveLength(0);
    const withCandidates = equivalenceClasses(index, 'iff', { includeConditional: true });
    expect(withCandidates).toHaveLength(1);
    expect(withCandidates[0].conditional).toBe(true);
  });

  it('前提不同的等价关系不能被并成一个无条件等价类', () => {
    // A: x=1, B: x^2=1, C: x=-1；A⇔B 在 x>0 下，B⇔C 在 x<0 下
    const index = buildIndex(nodes, [
      edge('a', 'b', 'iff', { contextId: 'ctx1', condition: 'x>0', reviewState: 'human-reviewed' }),
      edge('b', 'c', 'iff', { contextId: 'ctx1', condition: 'x<0', reviewState: 'human-reviewed' }),
    ]);
    expect(equivalenceClasses(index)).toHaveLength(0);

    const candidates = equivalenceClasses(index, 'iff', { includeConditional: true });
    expect(candidates).toHaveLength(2);
    expect(candidates.every((item) => item.conditional)).toBe(true);
    expect(candidates.map((item) => item.conditions.join()).sort()).toEqual(['x<0', 'x>0']);
  });

  it('无前提、语境明确且已审核的等价关系才是已确认的', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'iff', { contextId: 'ctx1', reviewState: 'human-reviewed' }),
    ]);
    const classes = equivalenceClasses(index);
    expect(classes).toHaveLength(1);
    expect(classes[0]).toMatchObject({ contextId: 'ctx1', conditional: false });
  });

  it('未审核的等价关系只能算候选', () => {
    const index = buildIndex(nodes, [edge('a', 'b', 'iff', { contextId: 'ctx1' })]);
    expect(equivalenceClasses(index)).toHaveLength(0);

    const candidates = equivalenceClasses(index, 'iff', { includeConditional: true });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].conditional).toBe(true);
  });
});

describe('拓扑排序与环诊断', () => {
  const nodes = [
    node('a', 'theorem', null, 1024),
    node('b', 'theorem', null, 2048),
    node('c', 'theorem', null, 3072),
    node('isolated', 'theorem', null, 4096),
  ];

  it('学习顺序把前置放在前面', () => {
    const index = buildIndex(nodes, [
      edge('c', 'b', 'depends-on'),
      edge('b', 'a', 'depends-on'),
    ]);
    const { order } = topoSort(index, 'depends-on', 'to-first');
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('孤立节点也能排进候选', () => {
    const index = buildIndex(nodes, [edge('b', 'a', 'depends-on')]);
    const { order } = topoSort(index, 'depends-on', 'to-first', {
      candidateIds: ['a', 'b', 'isolated'],
    });
    expect(order).toContain('isolated');
    expect(order).toHaveLength(3);
  });

  it('区分环上节点和被环阻塞的节点', () => {
    const index = buildIndex(nodes, [
      edge('a', 'b', 'depends-on'),
      edge('b', 'a', 'depends-on'),
      edge('c', 'a', 'depends-on'),
    ]);
    const { cyclic, blocked } = topoSort(index, 'depends-on', 'to-first');
    expect(cyclic.sort()).toEqual(['a', 'b']);
    expect(blocked).toEqual(['c']);
    expect([...cycleNodes(index, 'depends-on')].sort()).toEqual(['a', 'b']);
  });
});

describe('covers：知识点 ↔ 题目', () => {
  const nodes = [
    node('b', 'branch', null, 1024),
    node('c', 'section', 'b', 1024, { kind: 'chapter' }),
    node('s', 'section', 'c', 1024, { kind: 'section' }),
    node('def', 'definition', 's', 1024, { title: '二次函数', key: 'quadratic' }),
    node('prop', 'proposition', 's', 2048, { title: '对称轴', kind: 'formula' }),
    node('p1', 'problem', 's', 3072, { title: '求对称轴', kind: 'example' }),
    node('p2', 'problem', 's', 4096, { title: '求最值', kind: 'exercise' }),
  ];
  const edges = [
    edge('p1', 'def', 'covers'),
    edge('p1', 'prop', 'covers'),
    edge('p2', 'def', 'covers'),
  ];

  it('反查考查某个知识点的题目', () => {
    const index = buildIndex(nodes, edges);
    expect(coveringProblems(index, 'def').map((item) => item.id).sort()).toEqual(['p1', 'p2']);
    expect(coveringProblems(index, 'prop').map((item) => item.id)).toEqual(['p1']);
  });

  it('正查某个题目考查的知识点', () => {
    const index = buildIndex(nodes, edges);
    expect(coveredKnowledge(index, 'p1').map((item) => item.id).sort()).toEqual(['def', 'prop']);
  });

  it('只统计 covers，不把 cites / depends-on 混进来', () => {
    const index = buildIndex(nodes, [
      ...edges,
      edge('p2', 'prop', 'cites'),
      edge('prop', 'def', 'depends-on'),
    ]);
    expect(coveringProblems(index, 'prop').map((item) => item.id)).toEqual(['p1']);
    expect(coveredKnowledge(index, 'p2').map((item) => item.id)).toEqual(['def']);
  });
});

describe('搜索', () => {
  const nodes = [
    node('n1', 'definition', null, 1024, { title: '幂集', content: '集合的所有子集', key: 'power-set' }),
    node('n2', 'note', null, 2048, { title: '随笔', content: '这里提到幂集但标题不是' }),
    node('n3', 'note', null, 3072, { title: '无关', content: '无关内容', aliases: ['幂集别名'] }),
  ];

  it('标题命中排在正文命中之前', () => {
    const index = buildIndex(nodes, []);
    const hits = searchNodes(index, '幂集');
    expect(hits[0].node.id).toBe('n1');
    expect(hits.map((hit) => hit.node.id)).toContain('n2');
  });

  it('别名也能搜到', () => {
    const index = buildIndex(nodes, []);
    const hits = searchNodes(index, '幂集别名');
    expect(hits[0].node.id).toBe('n3');
  });

  it('空词返回空', () => {
    const index = buildIndex(nodes, []);
    expect(searchNodes(index, '   ')).toEqual([]);
  });

  it('按类型筛选', () => {
    const filtered = [
      ...nodes,
      node('n4', 'proposition', null, 4096, { title: '幂集的性质', content: '关于幂集' }),
      node('n5', 'problem', null, 5120, { title: '幂集练习', content: '求幂集' }),
    ];
    const index = buildIndex(filtered, []);
    const all = searchNodes(index, '幂集');
    expect(all.map((hit) => hit.node.type).sort()).toEqual(['definition', 'note', 'note', 'problem', 'proposition']);

    const onlyPropositions = searchNodes(index, '幂集', 50, { type: 'proposition' });
    expect(onlyPropositions.map((hit) => hit.node.id)).toEqual(['n4']);

    const onlyProblems = searchNodes(index, '幂集', 50, { type: 'problem' });
    expect(onlyProblems.map((hit) => hit.node.id)).toEqual(['n5']);
  });

  it('按细分筛选', () => {
    const filtered = [
      node('t1', 'proposition', null, 1024, { title: '定理甲', kind: 'theorem' }),
      node('t2', 'proposition', null, 2048, { title: '性质甲', kind: 'property' }),
    ];
    const index = buildIndex(filtered, []);
    expect(searchNodes(index, '甲', 50, { type: 'proposition', kind: 'theorem' }).map((h) => h.node.id)).toEqual(['t1']);
    expect(searchNodes(index, '甲', 50, { type: 'proposition', kind: 'property' }).map((h) => h.node.id)).toEqual(['t2']);
  });

  it('只给筛选器时按类型浏览', () => {
    const filtered = [
      node('t1', 'proposition', null, 1024, { title: '定理甲', kind: 'theorem' }),
      node('t2', 'proposition', null, 2048, { title: '定理乙', kind: 'theorem' }),
      node('n1', 'note', null, 3072, { title: '随便笔记' }),
    ];
    const index = buildIndex(filtered, []);
    expect(nodesMatching(index, { type: 'proposition' }).map((item) => item.id).sort()).toEqual(['t1', 't2']);
    expect(nodesMatching(index, undefined).length).toBe(3);
  });
});
