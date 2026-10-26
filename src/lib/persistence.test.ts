import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { validateGraphInvariants } from './validate';
import { mkNode } from './test-helpers';
import type { Edge, InferenceStep } from './schema';

const nodes = [
  mkNode('b', 'branch', null, 1024),
  mkNode('c', 'chapter', 'b', 1024),
  mkNode('s', 'section', 'c', 1024),
  mkNode('t1', 'theorem', 's', 1024),
  mkNode('t2', 'theorem', 's', 2048),
  mkNode('ctx', 'context', 'b', 2048),
  mkNode('pf', 'proof', 't1', 1024),
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

describe('持久化与事务', () => {
  beforeEach(async () => {
    await db.clearAll();
    await db.replaceAll({ nodes, edges, steps });
  });

  it('整库替换后再读回，内容一致', async () => {
    const reloaded = await db.loadAll();
    expect(reloaded.nodes).toHaveLength(nodes.length);
    expect(reloaded.edges).toHaveLength(edges.length);
    expect(reloaded.steps).toHaveLength(steps.length);
    expect(validateGraphInvariants(reloaded).filter((issue) => issue.severity === 'error')).toEqual([]);
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
        edge.contextId === 'ctx' ? { ...edge, contextId: undefined, updatedAt: 1 } : edge,
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

  it('删除节点时失效的推理步骤会一起删掉', async () => {
    await db.deleteNodesCascade(['t1'], ['e1', 'e2']);
    const after = await db.loadAll();
    expect(after.steps).toHaveLength(0);
    expect(after.edges).toHaveLength(0);
  });
});
