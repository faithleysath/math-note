import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AssetMeta, BookMetaV9, GraphJSONV9 } from './schema';
import { mkNode } from './test-helpers';
import { assetCaption, registeredAssetCaptionCount } from './markdown';

/**
 * 「导入 v9 JSON → 载入图片文件夹 → 图片可渲染」这条链的集成测试。
 * 重点不是哈希算法本身，而是资源元信息不能丢、二进制只落在已有行上。
 */

const book: BookMetaV9 = {
  subject: 'physics',
  stage: 'junior',
  title: '测试物理教材',
};

// 内容固定的样例图片：哈希写死，避免用被测代码算期望值
const SHA_HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const SHA_WORLD = '486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7';

const assetHello: AssetMeta = {
  id: 'img-1',
  path: 'assets/img-001.png',
  mimeType: 'image/png',
  byteLength: 5,
  sha256: SHA_HELLO,
  alt: '示意图一',
  originalName: 'hello.png',
};

const assetWorld: AssetMeta = {
  id: 'img-2',
  path: 'assets/img-002.png',
  mimeType: 'image/png',
  byteLength: 5,
  sha256: SHA_WORLD,
  alt: '示意图二',
  originalName: 'world.png',
};

function makeGraph(assets: AssetMeta[]): GraphJSONV9 {
  return {
    schemaVersion: 9,
    exportedAt: 0,
    book,
    nodes: [
      mkNode('b', 'branch', null, 1024, { content: '![图](asset://img-1)' }),
      mkNode('c', 'chapter', 'b', 1024),
    ],
    edges: [],
    steps: [],
    anchors: [],
    assets,
  };
}

const pngFile = (content: string, name: string) => new File([content], name, { type: 'image/png' });

let db: typeof import('./db');
let useGraphStore: typeof import('../stores/useGraphStore').useGraphStore;

beforeAll(async () => {
  // 必须在 db 模块加载之前注入 IndexedDB
  await import('fake-indexeddb/auto' as string);
  db = await import('./db');
  ({ useGraphStore } = await import('../stores/useGraphStore'));
});

beforeEach(async () => {
  await useGraphStore.getState().clearAll();
});

describe('图注登记（给渲染层用）', () => {
  it('importGraph 把 AssetMeta.caption 登记起来，没图注的不登记', async () => {
    await useGraphStore
      .getState()
      .importGraph(makeGraph([{ ...assetHello, caption: '图 1-11 激光笔演示声波' }, assetWorld]));

    expect(assetCaption('img-1')).toBe('图 1-11 激光笔演示声波');
    expect(assetCaption('img-2')).toBeUndefined();
    expect(registeredAssetCaptionCount()).toBe(1);
  });

  it('载入图片不会丢掉已登记的图注', async () => {
    await useGraphStore
      .getState()
      .importGraph(makeGraph([{ ...assetHello, caption: '图 1-12' }, assetWorld]));

    await useGraphStore.getState().loadAssetFiles([pngFile('hello', 'hello.png')]);

    expect(assetCaption('img-1')).toBe('图 1-12');
  });

  it('元信息从库里读回时保留图注（重开页面、载入图片后导出都不丢）', async () => {
    await useGraphStore
      .getState()
      .importGraph(makeGraph([{ ...assetHello, caption: '图 1-11 激光笔演示声波' }, assetWorld]));

    const metas = await db.loadAssetMetas();
    expect(metas.find((meta) => meta.id === 'img-1')?.caption).toBe('图 1-11 激光笔演示声波');
    expect(metas.find((meta) => meta.id === 'img-2')?.caption).toBeUndefined();

    // loadAssetFiles 会从库里重读元信息，导出不能因此丢 caption
    await useGraphStore.getState().loadAssetFiles([pngFile('hello', 'hello.png')]);
    expect(useGraphStore.getState().exportGraph().assets[0].caption).toBe('图 1-11 激光笔演示声波');
  });

  it('清空教材后图注一起清掉', async () => {
    await useGraphStore
      .getState()
      .importGraph(makeGraph([{ ...assetHello, caption: '图 1-13' }]));
    expect(registeredAssetCaptionCount()).toBe(1);

    await useGraphStore.getState().clearAll();
    expect(registeredAssetCaptionCount()).toBe(0);
  });
});

describe('导入保留资源元信息', () => {
  it('importGraph 后 assets 表有元信息，且全部缺二进制', async () => {
    await useGraphStore.getState().importGraph(makeGraph([assetHello, assetWorld]));

    expect(await db.loadAssetMetas()).toHaveLength(2);
    expect((await db.assetsWithoutBinary()).sort()).toEqual(['img-1', 'img-2']);

    const state = useGraphStore.getState();
    expect(state.assetCount).toBe(2);
    expect([...state.missingAssetIds].sort()).toEqual(['img-1', 'img-2']);
  });

  it('导出时带回资源元信息，导出再导入不会丢图', async () => {
    await useGraphStore.getState().importGraph(makeGraph([assetHello, assetWorld]));

    const exported = useGraphStore.getState().exportGraph();
    expect(exported.schemaVersion).toBe(9);
    expect(exported.assets).toEqual([assetHello, assetWorld]);
  });
});

describe('二进制落库', () => {
  beforeEach(async () => {
    await db.replaceAll({
      book,
      nodes: makeGraph([]).nodes,
      edges: [],
      assets: [assetHello, assetWorld],
    });
  });

  it('putAssetBinaries 之后能取到 blob，缺图列表随之变短', async () => {
    await db.putAssetBinaries([
      { id: 'img-1', data: new Blob(['hello'], { type: 'image/png' }) },
    ]);

    const blob = await db.getAssetBlob('img-1');
    expect(blob?.size).toBe(5);
    expect(blob?.type).toBe('image/png');
    expect(await blob?.text()).toBe('hello');
    expect(await db.assetsWithoutBinary()).toEqual(['img-2']);
  });

  it('对不存在的资源 id 调 putAssetBinaries 直接报错，不新建行', async () => {
    await expect(
      db.putAssetBinaries([{ id: 'ghost', data: new Blob(['x'], { type: 'image/png' }) }]),
    ).rejects.toThrow(/不在当前教材/);
    expect(await db.getAssetBlob('ghost')).toBeNull();
    expect(await db.loadAssetMetas()).toHaveLength(2);
  });
});

describe('载入本地图片文件夹', () => {
  beforeEach(async () => {
    await useGraphStore.getState().importGraph(makeGraph([assetHello, assetWorld]));
  });

  it('哈希对得上的文件写库、登记 URL，缺图列表缩短', async () => {
    const result = await useGraphStore.getState().loadAssetFiles([pngFile('hello', 'hello.png')]);

    expect(result).toEqual({ matched: 1, badHash: [], unknown: [], tooLarge: [] });
    expect(await db.assetsWithoutBinary()).toEqual(['img-2']);
    expect(useGraphStore.getState().missingAssetIds).toEqual(['img-2']);
    expect(useGraphStore.getState().assetCount).toBe(2);
    expect(await db.getAssetBlob('img-1')).not.toBeNull();
  });

  it('改一个字节就算哈希不符，不落库', async () => {
    const result = await useGraphStore
      .getState()
      .loadAssetFiles([pngFile('hello!', 'hello.png')]);

    expect(result.matched).toBe(0);
    expect(result.badHash).toEqual(['hello.png']);
    expect(result.unknown).toEqual([]);
    expect(await db.getAssetBlob('img-1')).toBeNull();
    expect(await db.assetsWithoutBinary()).toContain('img-1');
  });

  it('不属于本书的文件进 unknown，超大文件进 tooLarge', async () => {
    const tooBig = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'hello.png', {
      type: 'image/png',
    });
    const result = await useGraphStore
      .getState()
      .loadAssetFiles([pngFile('hello', 'other.png'), tooBig]);

    expect(result.matched).toBe(0);
    expect(result.unknown).toEqual(['other.png']);
    expect(result.tooLarge).toEqual(['hello.png']);
    expect(await db.getAssetBlob('img-1')).toBeNull();
  });

  it('没有 originalName 时按 path 的 basename 匹配', async () => {
    await useGraphStore.getState().importGraph(
      makeGraph([assetHello, { ...assetWorld, originalName: undefined }]),
    );

    const result = await useGraphStore.getState().loadAssetFiles([pngFile('world', 'img-002.png')]);

    expect(result.matched).toBe(1);
    expect(result.badHash).toEqual([]);
    expect(useGraphStore.getState().missingAssetIds).toEqual(['img-1']);
  });

  it('同一张图被选两遍只写一次', async () => {
    const result = await useGraphStore
      .getState()
      .loadAssetFiles([pngFile('hello', 'hello.png'), pngFile('hello', 'hello.png')]);

    expect(result.matched).toBe(2);
    expect(await db.assetsWithoutBinary()).toEqual(['img-2']);
  });
});
