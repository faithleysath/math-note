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

  it('旧版本（没有 steps 字段）导入后 steps 为空', () => {
    const v3 = {
      ...toJson(serializeGraph(nodes, [])),
      schemaVersion: 3,
      nodes: nodes.map((item) => ({ ...item, type: item.type === 'section' ? 'chapter' : item.type })),
    };
    delete (v3 as { steps?: unknown }).steps;
    const parsed = parseGraph(v3);
    expect(parsed.steps).toEqual([]);
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
    expect(parsed.migration).toBeNull();
  });

  it('v2 数据导入时把 solution 迁移成证明节点', () => {
    // v2 的节点类型是旧名字，必须原样构造
    const legacy = toJson({
      schemaVersion: 2,
      exportedAt: 0,
      nodes: [
        { id: 'b', type: 'branch', title: 'b', content: '', parentId: null, order: 1024, createdAt: 0, updatedAt: 0 },
        { id: 'c', type: 'chapter', title: 'c', content: '', parentId: 'b', order: 1024, createdAt: 0, updatedAt: 0 },
        { id: 's', type: 'section', title: 's', content: '', parentId: 'c', order: 1024, createdAt: 0, updatedAt: 0 },
        {
          id: 't',
          type: 'theorem',
          title: '定理甲',
          content: '陈述',
          solution: '设 x 为任意实数，则……',
          parentId: 's',
          order: 1024,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      edges: [],
    });
    const parsed = parseGraph(legacy);

    expect(parsed.migration?.from).toBe(2);
    expect(parsed.migration?.proofsCreated).toBe(1);

    const proof = parsed.nodes.find((item) => item.type === 'proof');
    expect(proof).toBeTruthy();
    expect(proof?.parentId).toBe('t');
    expect(proof?.content).toBe('设 x 为任意实数，则……');

    // 原始 solution 保留，可以回滚
    expect(parsed.nodes.find((item) => item.id === 't')?.solution).toBe('设 x 为任意实数，则……');

    const provesEdge = parsed.edges.find((item) => item.predicate === 'proves');
    expect(provesEdge?.from).toBe(proof?.id);
    expect(provesEdge?.to).toBe('t');
    expect(provesEdge?.reviewState).toBe('unreviewed');
  });

  it('v2 迁移后再导出导入不会重复生成证明', () => {
    const legacy = toJson({
      schemaVersion: 2,
      exportedAt: 0,
      nodes: [
        { id: 'b', type: 'branch', title: 'b', content: '', parentId: null, order: 1024, createdAt: 0, updatedAt: 0 },
        { id: 'c', type: 'chapter', title: 'c', content: '', parentId: 'b', order: 1024, createdAt: 0, updatedAt: 0 },
        { id: 's', type: 'section', title: 's', content: '', parentId: 'c', order: 1024, createdAt: 0, updatedAt: 0 },
        { id: 't', type: 'theorem', title: '定理甲', content: '陈述', solution: '证明正文', parentId: 's', order: 1024, createdAt: 0, updatedAt: 0 },
      ],
      edges: [],
    });
    const first = parseGraph(legacy);
    const exported = serializeGraph(first.nodes, first.edges);
    const second = parseGraph(toJson(exported));

    expect(second.migration).toBeNull();
    expect(second.nodes.filter((item) => item.type === 'proof')).toHaveLength(1);
    expect(second.edges.filter((item) => item.predicate === 'proves')).toHaveLength(1);
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
