import { describe, expect, it } from 'vitest';
import { migrateSolutionToProof, migrateToV5, summarizeMigration } from './migrate';
import { buildIndex } from './graph';
import { validateGraphInvariants } from './validate';
import type { AnyNode, Edge, InferenceStep } from './schema';

const now = 1;

function legacyNode(id: string, type: string, extra: Record<string, unknown> = {}): AnyNode {
  return {
    id,
    type,
    title: id,
    content: '',
    parentId: null,
    order: 1024,
    createdAt: now,
    updatedAt: now,
    ...extra,
  } as AnyNode;
}

function legacyEdge(id: string, from: string, to: string, predicate: string, extra: Partial<Edge> = {}): Edge {
  return {
    id,
    from,
    to,
    predicate: predicate as Edge['predicate'],
    assertedBy: 'manual',
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

/** 一个典型的 v4 图：章节/子章节、定理、例题、解题记录、context、concept、defines */
function v4Graph(): { nodes: AnyNode[]; edges: Edge[]; steps: InferenceStep[] } {
  const nodes: AnyNode[] = [
    legacyNode('b', 'branch', { title: '数学分析' }),
    legacyNode('c1', 'chapter', { parentId: 'b', title: '实数与函数', order: 1024 }),
    legacyNode('s1', 'section', { parentId: 'c1', title: '集合与映射', order: 1024 }),
    legacyNode('d1', 'definition', { parentId: 's1', title: '幂集', order: 1024 }),
    legacyNode('t1', 'theorem', {
      parentId: 's1',
      title: '复合映射结合律',
      content: '陈述',
      solution: '证明正文',
      order: 2048,
    }),
    legacyNode('e1', 'example', { parentId: 's1', title: '有限集幂集', order: 3072 }),
    legacyNode('x1', 'exercise', { parentId: 's1', title: '可数集', order: 4096 }),
    legacyNode('a1', 'attempt', {
      parentId: 'x1',
      title: '第一次尝试',
      order: 1024,
      attempt: { correct: false, method: '直接列举', durationMin: 25 },
    }),
    legacyNode('ctx1', 'context', { parentId: 'b', title: '实数域', order: 2048 }),
    legacyNode('con1', 'concept', { parentId: 'b', title: '幂集概念', order: 3072 }),
    legacyNode('pf1', 'proof', { parentId: 't1', title: '独立证明', order: 1024 }),
    legacyNode('t2', 'theorem', { parentId: 's1', title: '第二条命题', order: 5120 }),
  ];

  const edges: Edge[] = [
    legacyEdge('g1', 'pf1', 't1', 'proves'),
    legacyEdge('g2', 't1', 'd1', 'depends-on', { contextId: 'ctx1' }),
    legacyEdge('g3', 'd1', 'con1', 'defines'),
    legacyEdge('g4', 't1', 'con1', 'cites'),
  ];

  const steps: InferenceStep[] = [
    {
      id: 'step-1',
      premiseIds: ['t1'],
      conclusionId: 't2',
      rule: '占位',
      contextId: 'ctx1',
      proofId: 'pf1',
      assertedBy: 'manual',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { nodes, edges, steps };
}

describe('v4 → v5 迁移', () => {
  const { graph, report } = migrateToV5(v4Graph(), 4);

  it('节点 ID 全部保留', () => {
    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const id of ['b', 'c1', 's1', 'd1', 't1', 'e1', 'x1', 'a1', 'ctx1', 'con1', 'pf1', 't2']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('类型按 9 种类收敛，细分进 kind', () => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('c1')).toMatchObject({ type: 'section', kind: 'chapter' });
    expect(byId.get('s1')).toMatchObject({ type: 'section', kind: 'section' });
    expect(byId.get('t1')).toMatchObject({ type: 'proposition', kind: 'theorem' });
    expect(byId.get('e1')).toMatchObject({ type: 'problem', kind: 'example' });
    expect(byId.get('x1')).toMatchObject({ type: 'problem', kind: 'exercise' });
    expect(byId.get('ctx1')).toMatchObject({ type: 'note', kind: 'context' });
    expect(byId.get('con1')).toMatchObject({ type: 'note', kind: 'topic' });
  });

  it('context 保留原 ID，引用它的边仍然有效', () => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('ctx1')?.kind).toBe('context');
    expect(graph.edges.find((edge) => edge.id === 'g2')?.contextId).toBe('ctx1');
    const issues = validateGraphInvariants(graph);
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('concept 不按标题合并，进入人工审核清单', () => {
    expect(report.needsManualReview.some((item) => item.code === 'concept-downgraded')).toBe(true);
    // 概念节点还在，只是变成了 note(topic)；没有凭空造出同名 definition
    expect(graph.nodes.filter((node) => node.type === 'note' && node.kind === 'topic')).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.type === 'definition')).toHaveLength(1);
  });

  it('defines 边降级为 cites 并保留线索', () => {
    const migrated = graph.edges.find((edge) => edge.id === 'g3');
    expect(migrated?.predicate).toBe('cites');
    expect(migrated?.note).toContain('defines');
    expect(report.needsManualReview.some((item) => item.code === 'defines-downgraded')).toBe(true);
  });

  it('解题记录与对错、方法、用时全部保留', () => {
    const attempt = graph.nodes.find((node) => node.id === 'a1');
    expect(attempt?.type).toBe('attempt');
    expect(attempt?.attempt).toEqual({ correct: false, method: '直接列举', durationMin: 25 });
  });

  it('solution 原样保留在命题上', () => {
    expect(graph.nodes.find((node) => node.id === 't1')?.solution).toBe('证明正文');
  });

  it('报告有前后计数，且没有丢边', () => {
    expect(report.countsBefore.nodes).toBe(12);
    expect(report.countsAfter.nodes).toBe(12);
    expect(report.droppedEdges).toBe(0);
    expect(report.unresolvedReferences).toBe(0);
    expect(summarizeMigration(report)).toContain('待人工确认');
  });

  it('迁移结果能通过全图校验', () => {
    const issues = validateGraphInvariants(graph);
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('非命题前提下注的推理步骤会移出图谱并记录', () => {
    const withDefinitionPremise = migrateToV5(
      {
        nodes: [
          ...v4Graph().nodes,
          legacyNode('p2', 'theorem', { parentId: 's1', title: '另一命题', order: 5120 }),
        ],
        edges: [],
        steps: [
          {
            id: 'step-bad',
            premiseIds: ['d1'],
            conclusionId: 'p2',
            rule: '定义当前提',
            assertedBy: 'manual',
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      4,
    );
    expect(withDefinitionPremise.graph.steps).toHaveLength(0);
    expect(withDefinitionPremise.report.droppedSteps).toBe(1);
    expect(
      withDefinitionPremise.report.needsManualReview.some((item) => item.code === 'step-needs-rebuild'),
    ).toBe(true);
  });
});

describe('v2 → v4 的 solution 迁移', () => {
  it('生成稳定 ID，重复迁移不会新增节点', () => {
    const nodes: AnyNode[] = [
      legacyNode('b', 'branch'),
      legacyNode('t', 'theorem', { parentId: 'b', solution: '证明' }),
    ];
    const first = migrateSolutionToProof({ nodes, edges: [] });
    expect(first.proofsCreated).toBe(1);

    const second = migrateSolutionToProof({ nodes: first.graph.nodes, edges: first.graph.edges });
    expect(second.proofsCreated).toBe(0);
    // 原始 2 个节点 + 1 个迁移出的证明，重复迁移不再增加
    expect(second.graph.nodes).toHaveLength(3);
  });

  it('迁移出的证明能进入 v5 并透过全图校验', () => {
    const nodes: AnyNode[] = [
      legacyNode('b', 'branch'),
      legacyNode('c', 'chapter', { parentId: 'b' }),
      legacyNode('s', 'section', { parentId: 'c' }),
      legacyNode('t', 'theorem', { parentId: 's', solution: '证明' }),
    ];
    const first = migrateSolutionToProof({ nodes, edges: [] });
    const { graph } = migrateToV5(
      { nodes: first.graph.nodes, edges: first.graph.edges, steps: [] },
      2,
    );
    expect(graph.nodes.some((node) => node.type === 'proof')).toBe(true);
    expect(validateGraphInvariants(graph).filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});

describe('迁移后的编号', () => {
  it('章节 kind 显示第 n 章，深层 section 显示 1.2.3', () => {
    const { graph } = migrateToV5(
      {
        nodes: [
          legacyNode('b', 'branch'),
          legacyNode('ch', 'chapter', { parentId: 'b' }),
          legacyNode('s1', 'section', { parentId: 'ch' }),
          legacyNode('s2', 'section', { parentId: 's1' }),
          legacyNode('t', 'theorem', { parentId: 's2' }),
        ],
        edges: [],
        steps: [],
      },
      4,
    );
    const index = buildIndex(graph.nodes, graph.edges, []);
    expect(index.numbering.get('ch')).toBe('第 1 章');
    expect(index.numbering.get('s1')).toBe('1.1');
    expect(index.numbering.get('s2')).toBe('1.1.1');
    expect(index.numbering.get('t')).toBe('定理 1.1.1.1');
  });
});
