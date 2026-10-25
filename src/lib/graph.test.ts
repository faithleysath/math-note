import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  buildIndex,
  collectSubtree,
  computeInsertOrder,
  dumpTree,
  equivalenceClasses,
  ORDER_GAP,
  reachable,
  searchNodes,
  topoSort,
} from './graph';
import type { Edge, Node, NodeType } from './schema';

let seq = 0;

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

function edge(from: string, to: string, predicate: Edge['predicate'], id = `${from}-${to}`): Edge {
  seq += 1;
  return {
    id: `${id}-${seq}`,
    from,
    to,
    predicate,
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
  };
}

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
    expect(index.numbering.get('s11')).toBe('§ 1.1');
    expect(index.numbering.get('d1')).toBe('定义 1.1.1');
    expect(index.numbering.get('t1')).toBe('定理 1.1.1');
    expect(index.numbering.get('t2')).toBe('定理 1.1.2');
    expect(index.numbering.get('c2')).toBe('第 2 章');
    expect(index.numbering.get('s21')).toBe('§ 2.1');
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
    expect(dumpTree(index)).toContain('theorem [定理 1.1.1] t1');
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

describe('图推理', () => {
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

  it('拓扑排序给出学习顺序', () => {
    const index = buildIndex(nodes, edges);
    const { order, cyclic } = topoSort(index, 'depends-on', 'to-first');
    expect(cyclic).toEqual([]);
    expect(order.indexOf('def')).toBeLessThan(order.indexOf('thmA'));
    expect(order.indexOf('thmA')).toBeLessThan(order.indexOf('thmB'));
    expect(order.indexOf('thmB')).toBeLessThan(order.indexOf('thmC'));
  });

  it('成环时返回环上的节点', () => {
    const cyclicEdges = [...edges, edge('thmA', 'thmC', 'depends-on')];
    const index = buildIndex(nodes, cyclicEdges);
    const { cyclic } = topoSort(index, 'depends-on');
    expect(cyclic.length).toBeGreaterThan(0);
  });

  it('iff 聚成等价类', () => {
    const iffs = [
      edge('thmA', 'thmB', 'iff'),
      edge('thmB', 'thmC', 'iff'),
    ];
    const index = buildIndex(nodes, iffs);
    const classes = equivalenceClasses(index, 'iff');
    expect(classes).toHaveLength(1);
    expect([...classes[0]].sort()).toEqual(['thmA', 'thmB', 'thmC']);
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
});
