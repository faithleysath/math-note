import { describe, expect, it } from 'vitest';
import { buildIndex } from './graph';
import { simulateOperations } from './draft';
import { mkNode } from './test-helpers';
import type { AiOperation, Edge, Node } from './schema';

const node = (
  id: string,
  type: string,
  parentId: string | null,
  order: number,
): Node => mkNode(id, type, parentId, order);

const base = [
  node('b1', 'branch', null, 1024),
  node('c1', 'chapter', 'b1', 1024),
  node('s1', 'section', 'c1', 1024),
  node('t1', 'theorem', 's1', 1024),
  node('t2', 'theorem', 's1', 2048),
];

let counter = 0;
const newId = () => `new-${(counter += 1)}`;

const ops: AiOperation[] = [
  { op: 'create-node', ref: 'n1', parentId: 's1', type: 'proposition', kind: 'theorem', title: '新定理一', content: '内容一' },
  { op: 'create-node', ref: 'n2', parentId: 'ref:n1', type: 'proof', title: '证明', content: '证明正文' },
  { op: 'create-edge', from: 'ref:n2', to: 'ref:n1', predicate: 'proves' },
];

describe('AI 批量操作模拟', () => {
  it('合法的批次会给出完整 diff', () => {
    counter = 0;
    const index = buildIndex(base, []);
    const result = simulateOperations(index, ops, { now: 1, newId });

    expect(result.errors).toEqual([]);
    expect(result.diff.createdNodes).toHaveLength(2);
    expect(result.diff.createdEdges).toHaveLength(1);
    expect(result.nodes.has('new-1')).toBe(true);
    expect(result.nodes.has('new-2')).toBe(true);
    expect(result.diff.createdEdges[0].predicate).toBe('proves');
  });

  it('AI 生成的关系默认断言成立、来源标记为 ai', () => {
    counter = 0;
    const index = buildIndex(base, []);
    const result = simulateOperations(index, ops, { now: 1, newId });
    const edge = result.diff.createdEdges[0];
    expect(edge.assertedBy).toBe('ai');
    expect(edge.status).toBe('asserted');
  });

  it('最后一个操作非法时整批丢弃，不留半成品', () => {
    counter = 0;
    const index = buildIndex(base, []);
    const bad: AiOperation[] = [
      ...ops,
      // 证明不能去 proves 一个 chapter
      { op: 'create-edge', from: 'new-2', to: 'c1', predicate: 'proves' },
    ];
    const result = simulateOperations(index, bad, { now: 1, newId });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/第 4 个操作/);
    expect(result.diff.createdNodes).toEqual([]);
    expect(result.diff.createdEdges).toEqual([]);
    // 草稿也回滚到原始状态
    expect(result.nodes.size).toBe(index.nodes.size);
    expect(result.edges).toHaveLength(index.edges.length);
  });

  it('引用了不存在的 ref 会失败', () => {
    const index = buildIndex(base, []);
    const result = simulateOperations(
      index,
      [{ op: 'create-node', parentId: 'ref:missing', type: 'note', title: 'x', content: '' }],
      { now: 1, newId },
    );
    expect(result.errors[0]).toMatch(/找不到临时引用/);
  });

  it('删除节点会连带删除它的边', () => {
    const edges: Edge[] = [
      { id: 'e1', from: 't1', to: 't2', predicate: 'depends-on', assertedBy: 'manual', createdAt: 0, updatedAt: 0 },
      { id: 'e2', from: 't2', to: 't1', predicate: 'iff', assertedBy: 'manual', createdAt: 0, updatedAt: 0 },
    ];
    const index = buildIndex(base, edges);
    const result = simulateOperations(
      index,
      [{ op: 'delete-node', id: 't1' }],
      { now: 1, newId },
    );
    expect(result.errors).toEqual([]);
    expect(result.diff.deletedNodeIds).toEqual(['t1']);
    expect(result.diff.deletedEdgeIds.sort()).toEqual(['e1', 'e2']);
  });

  it('可以创建推理步骤，前提由 ref 解析', () => {
    counter = 0;
    const index = buildIndex(base, []);
    const result = simulateOperations(
      index,
      [
        { op: 'create-node', ref: 'p1', parentId: 's1', type: 'proposition', kind: 'theorem', title: '前提一', content: '' },
        { op: 'create-node', ref: 'p2', parentId: 's1', type: 'proposition', kind: 'theorem', title: '前提二', content: '' },
        { op: 'create-edge', from: 't1', to: 'ref:p1', predicate: 'implies' },
        { op: 'create-edge', from: 't1', to: 'ref:p2', predicate: 'implies' },
        { op: 'create-step', premiseIds: ['ref:p1', 'ref:p2'], conclusionId: 't2', rule: '两前提规则' },
      ],
      { now: 1, newId },
    );
    expect(result.errors).toEqual([]);
    expect(result.diff.createdSteps).toHaveLength(1);
    expect(result.diff.createdSteps[0].premiseIds).toEqual(['new-1', 'new-2']);
  });

  it('非法的推理步骤会让整批失败', () => {
    counter = 0;
    const index = buildIndex(base, []);
    const result = simulateOperations(
      index,
      [
        { op: 'create-node', ref: 'p1', parentId: 's1', type: 'proposition', kind: 'theorem', title: '前提一', content: '' },
        // 前提为空
        { op: 'create-step', premiseIds: [], conclusionId: 't2', rule: '规则' },
      ],
      { now: 1, newId },
    );
    expect(result.errors[0]).toMatch(/至少需要一个前提/);
    expect(result.diff.createdNodes).toEqual([]);
    expect(result.diff.createdSteps).toEqual([]);
  });

  it('删除被推理步骤引用的节点会一并删掉该步骤', () => {
    const index = buildIndex(base, [], [
      {
        id: 's1',
        premiseIds: ['t1', 't2'],
        conclusionId: 't1',
        rule: '占位',
        assertedBy: 'manual',
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    const result = simulateOperations(index, [{ op: 'delete-node', id: 't2' }], { now: 1, newId });
    expect(result.errors).toEqual([]);
    expect(result.diff.deletedStepIds).toEqual(['s1']);
    expect(result.steps).toHaveLength(0);
  });

  it('删除语境节点会清掉边和步骤上的语境引用', () => {
    const nodes = [
      ...base,
      node('ctx', 'context', null, 2048),
      node('pf', 'proof', 't1', 1024),
    ];
    const edges: Edge[] = [
      {
        id: 'e1',
        from: 't1',
        to: 't2',
        predicate: 'implies',
        contextId: 'ctx',
        assertedBy: 'manual',
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const steps = [
      {
        id: 's1',
        premiseIds: ['t1'],
        conclusionId: 't2',
        rule: '规则',
        contextId: 'ctx',
        proofId: 'pf',
        assertedBy: 'manual' as const,
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const index = buildIndex(nodes, edges, steps);
    const result = simulateOperations(index, [{ op: 'delete-node', id: 'ctx' }], { now: 1, newId });

    expect(result.errors).toEqual([]);
    expect(result.edges[0].contextId).toBeUndefined();
    expect(result.steps[0].contextId).toBeUndefined();
    // 证明还在，所以 proofId 保留
    expect(result.steps[0].proofId).toBe('pf');

    const afterProof = simulateOperations(
      buildIndex(result.nodes.values(), result.edges, result.steps),
      [{ op: 'delete-node', id: 'pf' }],
      { now: 1, newId },
    );
    expect(afterProof.steps[0].proofId).toBeUndefined();
  });

  it('select 是纯 UI 操作，记录在 diff 里', () => {
    const index = buildIndex(base, []);
    const result = simulateOperations(index, [{ op: 'select', id: 't2' }], { now: 1, newId });
    expect(result.diff.selects).toEqual(['t2']);
    expect(result.diff.createdNodes).toEqual([]);
  });
});
