import { describe, expect, it } from 'vitest';
import { buildIndex } from './graph';
import { parseGraph, serializeGraph } from './serialize';
import { mkNode } from './test-helpers';
import type { Edge, InferenceStep, Node } from './schema';

const node = (
  id: string,
  type: string,
  parentId: string | null,
  order: number,
  extra: Partial<Node> = {},
): Node => mkNode(id, type, parentId, order, extra);

const nodes = [
  node('b', 'branch', null, 1024),
  node('c', 'chapter', 'b', 1024),
  node('s', 'section', 'c', 1024),
  node('t', 'theorem', 's', 1024, { title: '定理甲', solution: '设 x 为任意实数，则……' }),
  node('t2', 'theorem', 's', 2048, { title: '定理乙' }),
];

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value));

const aStep: InferenceStep = {
  id: 'step-1',
  premiseIds: ['t', 't2'],
  conclusionId: 't2',
  rule: '测试规则',
  assertedBy: 'manual',
  createdAt: 1,
  updatedAt: 1,
};

describe('导入导出', () => {
  it('推理步骤能完整导出再导入', () => {
    const steps: InferenceStep[] = [
      { ...aStep, id: 'step-1', premiseIds: ['t2'], conclusionId: 't' },
    ];
    const parsed = parseGraph(toJson(serializeGraph(nodes, [], steps)));
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].rule).toBe('测试规则');
    expect(parsed.steps[0].premiseIds).toEqual(['t2']);
  });

  it('没有 steps 字段时按空数组处理', () => {
    const withoutSteps = toJson(serializeGraph(nodes, []));
    delete (withoutSteps as { steps?: unknown }).steps;
    const parsed = parseGraph(withoutSteps);
    expect(parsed.steps).toEqual([]);
  });

  it('只接受 v7，v6 及更早的备份直接拒绝', () => {
    for (const version of [2, 3, 4, 5, 6]) {
      const older = { ...toJson(serializeGraph(nodes, [])), schemaVersion: version };
      expect(() => parseGraph(older)).toThrowError(/数据结构不对/);
    }
  });

  it('拒绝带已删除字段的 v7 文件（不静默丢弃 status）', () => {
    const withStatus = toJson(serializeGraph(nodes, []));
    withStatus.edges = [
      {
        id: 'e1',
        from: 't',
        to: 't2',
        predicate: 'implies',
        status: 'asserted',
        assertedBy: 'manual',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(() => parseGraph(withStatus)).toThrowError(/数据结构不对/);
  });

  it('拒绝未知字段', () => {
    const withExtra = toJson(serializeGraph(nodes, []));
    withExtra.mystery = 1;
    expect(() => parseGraph(withExtra)).toThrowError(/数据结构不对/);
  });

  it('不同知识库可以各自使用同一个 key', () => {
    // 一教材一图谱：key 只在当前图谱内唯一
    const build = () =>
      serializeGraph(
        [
          node('b', 'branch', null, 1024),
          node('ch', 'chapter', 'b', 1024),
          node('d', 'definition', 'ch', 1024, { key: 'pythagorean-theorem', title: '勾股定理' }),
        ],
        [],
      );
    const graphA = build();
    const graphB = build();
    expect(() => parseGraph(toJson(graphA))).not.toThrow();
    expect(() => parseGraph(toJson(graphB))).not.toThrow();
  });

  it('推理步骤引用不存在的节点会被拒绝', () => {
    const broken = serializeGraph(nodes, [], [{ ...aStep, premiseIds: ['ghost'] }]);
    expect(() => parseGraph(toJson(broken))).toThrowError(/前提 ghost 不存在|没通过校验/);
  });


  it('导出再导入，树和编号完全一致', () => {
    const before = buildIndex(nodes, []);
    const parsed = parseGraph(toJson(serializeGraph(nodes, [])));
    const after = buildIndex(parsed.nodes, parsed.edges);

    expect(after.numbering.get('t')).toBe(before.numbering.get('t'));
    expect(after.roots).toEqual(before.roots);
  });

  it('拒绝父节点不存在的节点', () => {
    const broken = serializeGraph([node('x', 'theorem', 'missing', 1024)], []);
    expect(() => parseGraph(toJson(broken))).toThrowError(/父节点不存在|没通过校验/);
  });

  it('拒绝指向空气的边', () => {
    const broken = serializeGraph(nodes, [
      {
        id: 'e1',
        from: 't',
        to: 'ghost',
        predicate: 'depends-on',
        assertedBy: 'manual',
        createdAt: 1,
        updatedAt: 1,
      } as Edge,
    ]);
    expect(() => parseGraph(toJson(broken))).toThrowError(/不存在的节点|没通过校验/);
  });

  it('拒绝结构不对的 JSON', () => {
    expect(() => parseGraph({ schemaVersion: 1, nodes: [] })).toThrowError(/数据结构不对/);
  });

  it('拒绝重复 id', () => {
    const broken = serializeGraph([node('a', 'branch', null, 1024), node('a', 'note', null, 2048)], []);
    expect(() => parseGraph(toJson(broken))).toThrowError(/重复|没通过校验/);
  });

  it('拒绝依赖成环的数据', () => {
    const broken = serializeGraph(nodes, [
      { id: 'e1', from: 't', to: 't2', predicate: 'depends-on', assertedBy: 'manual', createdAt: 1, updatedAt: 1 },
      { id: 'e2', from: 't2', to: 't', predicate: 'depends-on', assertedBy: 'manual', createdAt: 1, updatedAt: 1 },
    ]);
    let message = '';
    try {
      parseGraph(toJson(broken));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/前置学习关系成环/);
  });

  it('接受合法的逻辑成环（A⇒B 与 B⇒A）', () => {
    const ok = serializeGraph(nodes, [
      { id: 'e1', from: 't', to: 't2', predicate: 'implies', assertedBy: 'manual', createdAt: 1, updatedAt: 1 },
      { id: 'e2', from: 't2', to: 't', predicate: 'implies', assertedBy: 'manual', createdAt: 1, updatedAt: 1 },
    ]);
    expect(() => parseGraph(toJson(ok))).not.toThrow();
  });

  it('警告不会阻止导入', () => {
    // 对称边按非规范方向存储只会产生警告
    const withWarning = serializeGraph(nodes, [
      { id: 'e1', from: 't2', to: 't', predicate: 'iff', assertedBy: 'manual', createdAt: 1, updatedAt: 1 },
    ]);
    const parsed = parseGraph(toJson(withWarning));
    expect(parsed.nodes).toHaveLength(nodes.length);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
