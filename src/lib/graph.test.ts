import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  buildIndex,
  collectSubtree,
  computeInsertOrder,
  coveredKnowledge,
  coveringProblems,
  nodesMatching,
  searchNodes,
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
});

describe('排序', () => {
  it('末尾追加', () => {
    const index = buildIndex(textbook(), []);
    const position = computeInsertOrder(index, 's11', null);
    expect(position.order).toBe(3072 + 1024);
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
