import { describe, expect, it } from 'vitest';
import { buildIndex } from './graph';
import { parseGraph, serializeGraph } from './serialize';
import type { Edge, Node, NodeType } from './schema';

function node(id: string, type: NodeType, parentId: string | null, order: number): Node {
  return {
    id,
    type,
    title: id,
    content: '',
    parentId,
    order,
    createdAt: 1,
    updatedAt: 1,
  };
}

const nodes = [
  node('b', 'branch', null, 1024),
  node('c', 'chapter', 'b', 1024),
  node('s', 'section', 'c', 1024),
  node('t', 'theorem', 's', 1024),
];

const edges: Edge[] = [
  {
    id: 'e1',
    from: 't',
    to: 't2',
    predicate: 'cites',
    assertedBy: 'manual',
    createdAt: 1,
    updatedAt: 1,
  },
];

describe('导入导出', () => {
  it('导出再导入，树和编号完全一致', () => {
    const before = buildIndex(nodes, []);
    const json = JSON.parse(JSON.stringify(serializeGraph(nodes, [])));
    const parsed = parseGraph(json);
    const after = buildIndex(parsed.nodes, parsed.edges);

    expect(after.numbering.get('t')).toBe(before.numbering.get('t'));
    expect(after.roots).toEqual(before.roots);
  });

  it('拒绝父节点不存在的节点', () => {
    const broken = serializeGraph([node('x', 'theorem', 'missing', 1024)], []);
    expect(() => parseGraph(JSON.parse(JSON.stringify(broken)))).toThrowError(/父节点不存在/);
  });

  it('拒绝指向空气的边', () => {
    const broken = serializeGraph(nodes, edges);
    expect(() => parseGraph(JSON.parse(JSON.stringify(broken)))).toThrowError(/不存在节点/);
  });

  it('拒绝结构不对的 JSON', () => {
    expect(() => parseGraph({ schemaVersion: 1, nodes: [] })).toThrowError(/数据结构不对/);
  });

  it('拒绝重复 id', () => {
    const broken = serializeGraph([node('a', 'branch', null, 1024), node('a', 'note', null, 2048)], []);
    expect(() => parseGraph(JSON.parse(JSON.stringify(broken)))).toThrowError(/id 重复/);
  });
});
