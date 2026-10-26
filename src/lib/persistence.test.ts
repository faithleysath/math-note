import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { validateGraphInvariants } from './validate';
import { mkNode } from './test-helpers';
import type { BookMeta, Edge, InferenceStep } from './schema';

const book: BookMeta = {
  subject: 'physics',
  stage: 'junior',
  title: '测试物理教材',
  edition: '测试版',
};

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
    await db.replaceAll({ book, nodes, edges, steps });
  });

  it('整库替换后再读回，内容一致', async () => {
    const reloaded = await db.loadAll();
    expect(reloaded.book).toEqual(book);
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

describe('v9 媒体资源表', () => {
  const asset: import('./db').AssetRecord = {
    id: 'img-1',
    path: 'assets/img-1.png',
    mimeType: 'image/png',
    byteLength: 3,
    sha256: 'a'.repeat(64),
    alt: '示意图',
    data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  };

  beforeEach(async () => {
    await db.clearAll();
  });

  it('replaceAll 会在同一事务里落 assets，loadAll 只返回元信息', async () => {
    await db.replaceAll({ book, nodes, edges, steps, assets: [asset] });
    const reloaded = await db.loadAll();
    expect(reloaded.assets).toEqual([
      {
        id: 'img-1',
        path: 'assets/img-1.png',
        mimeType: 'image/png',
        byteLength: 3,
        sha256: 'a'.repeat(64),
        alt: '示意图',
        originalName: undefined,
      },
    ]);
    expect('data' in reloaded.assets[0]).toBe(false);
  });

  it('getAssetBlob / putAssets / removeAssets 读写一致', async () => {
    await db.putAssets([asset]);
    const blob = await db.getAssetBlob('img-1');
    expect(blob?.size).toBe(3);
    expect(blob?.type).toBe('image/png');
    expect(await db.getAssetBlob('missing')).toBeNull();

    await db.removeAssets(['img-1']);
    expect(await db.getAssetBlob('img-1')).toBeNull();
    expect((await db.loadAll()).assets).toEqual([]);
  });

  it('clearAll 会清空 assets', async () => {
    await db.putAssets([asset]);
    await db.clearAll();
    expect((await db.loadAll()).assets).toEqual([]);
  });
});
