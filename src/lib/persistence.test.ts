import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { diffToBatch, simulateOperations } from './draft';
import { buildIndex } from './graph';
import { mkNode } from './test-helpers';
import type { Edge, InferenceStep } from './schema';

const nodes = [
  mkNode('b', 'branch', null, 1024),
  mkNode('c', 'chapter', 'b', 1024),
  mkNode('s', 'section', 'c', 1024),
  mkNode('t1', 'theorem', 's', 1024),
  mkNode('t2', 'theorem', 's', 2048),
  mkNode('ctx', 'context', null, 2048),
  mkNode('pf', 'proof', 't1', 1024),
];

const edges: Edge[] = [
  {
    id: 'e1',
    from: 't1',
    to: 't2',
    predicate: 'implies',
    contextId: 'ctx',
    assumptionIds: ['ctx'],
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'e2',
    from: 'pf',
    to: 't1',
    predicate: 'proves',
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
  },
];

const steps: InferenceStep[] = [
  {
    id: 's1',
    premiseIds: ['t1'],
    conclusionId: 't2',
    rule: '测试规则',
    contextId: 'ctx',
    proofId: 'pf',
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
  },
];

let db: typeof import('./db');

beforeAll(async () => {
  // 必须在 db 模块加载之前注入 IndexedDB
  await import('fake-indexeddb/auto' as string);
  db = await import('./db');
});

describe('AI 批次提交到数据库', () => {
  beforeEach(async () => {
    await db.clearAll();
    await db.replaceAll({ nodes, edges, steps });
  });

  it('删除语境节点后，边与步骤上的引用被真正写回库里', async () => {
    const index = buildIndex(nodes, edges, steps);
    const simulation = simulateOperations(index, [{ op: 'delete-node', id: 'ctx' }], {
      now: 1,
      newId: () => 'new',
    });
    expect(simulation.errors).toEqual([]);
    expect(simulation.diff.updatedEdges).toHaveLength(1);
    expect(simulation.diff.updatedSteps).toHaveLength(1);

    await db.applyBatch(diffToBatch(simulation.diff));

    const reloaded = await db.loadAll();
    const edge = reloaded.edges.find((item) => item.id === 'e1');
    const step = reloaded.steps.find((item) => item.id === 's1');

    expect(edge?.contextId).toBeUndefined();
    expect(edge?.assumptionIds).toBeUndefined();
    expect(step?.contextId).toBeUndefined();
    // 证明还在，所以 proofId 保留
    expect(step?.proofId).toBe('pf');
    expect(reloaded.nodes.some((node) => node.id === 'ctx')).toBe(false);
  });

  it('提交后的图能通过全图校验', async () => {
    const { validateGraphInvariants } = await import('./validate');
    const index = buildIndex(nodes, edges, steps);
    const simulation = simulateOperations(index, [{ op: 'delete-node', id: 'ctx' }], {
      now: 1,
      newId: () => 'new',
    });
    await db.applyBatch(diffToBatch(simulation.diff));

    const reloaded = await db.loadAll();
    const issues = validateGraphInvariants(reloaded);
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('删除子树与引用清理在同一个事务里完成', async () => {
    const result = await db.loadAll();
    const idSet = new Set(['ctx']);
    const edgeIds = result.edges
      .filter((edge) => idSet.has(edge.from) || idSet.has(edge.to))
      .map((edge) => edge.id);

    const patchedEdges = result.edges
      .filter((edge) => !edgeIds.includes(edge.id))
      .map((edge) =>
        edge.contextId === 'ctx'
          ? { ...edge, contextId: undefined, assumptionIds: undefined, updatedAt: 1 }
          : edge,
      );

    const patchedSteps = result.steps.map((step) =>
      step.contextId === 'ctx' ? { ...step, contextId: undefined, updatedAt: 1 } : step,
    );

    await db.deleteNodesCascade(['ctx'], edgeIds, {
      putEdges: patchedEdges.filter((edge) => edge.id === 'e1'),
      putSteps: patchedSteps,
    });

    const after = await db.loadAll();
    expect(after.nodes.some((node) => node.id === 'ctx')).toBe(false);
    expect(after.edges.find((edge) => edge.id === 'e1')?.contextId).toBeUndefined();
    expect(after.steps.find((step) => step.id === 's1')?.contextId).toBeUndefined();
    // 无关的边（证明 → 命题）不受影响
    expect(after.edges.some((edge) => edge.id === 'e2')).toBe(true);
  });

  it('失败的批次不写入任何内容', async () => {
    const before = await db.loadAll();
    const index = buildIndex(nodes, edges, steps);
    const simulation = simulateOperations(
      index,
      [
        { op: 'create-node', ref: 'n1', parentId: 's', type: 'proposition', kind: 'theorem', title: '新命题', content: '' },
        // 证明不能直接 proves 命题以外的节点
        { op: 'create-edge', from: 'pf', to: 'b', predicate: 'proves' },
      ],
      { now: 1, newId: () => 'new' },
    );
    expect(simulation.errors.length).toBeGreaterThan(0);
    // 调用方拿到的 diff 是空的，即使误提交也不会改动数据
    await db.applyBatch(diffToBatch(simulation.diff));

    const after = await db.loadAll();
    expect(after.nodes.length).toBe(before.nodes.length);
    expect(after.edges.length).toBe(before.edges.length);
  });
});
