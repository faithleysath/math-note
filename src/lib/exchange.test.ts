import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildExchangePackage,
  EXCHANGE_FORMAT,
  EXCHANGE_FORMAT_VERSION,
  EXCHANGE_MANIFEST,
  exchangeFileName,
  isExchangeFileName,
  readExchangePackage,
  toArrayBuffer,
} from './exchange';
import { sha256Hex } from './assets';
import { serializeGraph } from './serialize';
import { mkNode } from './test-helpers';
import type { AssetMeta, BookMetaV9 } from './schema';

const book: BookMetaV9 = {
  subject: 'physics',
  stage: 'junior',
  title: '交换包测试',
};

async function fixture() {
  const bytes = new TextEncoder().encode('fake-png-bytes');
  const asset: AssetMeta = {
    id: 'img-1',
    path: 'assets/img-1.png',
    mimeType: 'image/png',
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(toArrayBuffer(bytes)),
    alt: '测试图',
    caption: '图 1-1',
    width: 10,
    height: 20,
  };
  const node = mkNode('n1', 'note', null, 1024, {
    content: '看图：![测试图](asset://img-1)',
  });
  const graph = serializeGraph(book, [node], [], [], { assets: [asset] });
  return { bytes, asset, graph };
}

describe('教材交换包 .tbg', () => {
  it('打包再读回：图、资源元信息、图片二进制都在', async () => {
    const { bytes, asset, graph } = await fixture();
    const packed = await buildExchangePackage(graph, [{ meta: asset, bytes }], {
      createdAt: new Date('2026-10-28T00:00:00.000Z'),
      generator: 'test',
    });
    const read = await readExchangePackage(packed);

    expect(read.manifest.format).toBe(EXCHANGE_FORMAT);
    expect(read.manifest.formatVersion).toBe(EXCHANGE_FORMAT_VERSION);
    expect(read.manifest.schemaVersion).toBe(9);
    expect(read.manifest.counts).toEqual({ nodes: 1, edges: 0, assets: 1 });
    expect(read.manifest.book.title).toBe('交换包测试');
    expect(read.graph.nodes).toHaveLength(1);
    expect(read.assets).toHaveLength(1);
    expect(read.assets[0].meta.caption).toBe('图 1-1');
    expect(strFromU8(read.assets[0].bytes)).toBe('fake-png-bytes');
  });

  it('可以带 documents，导入端忽略但保留在包里', async () => {
    const { bytes, asset, graph } = await fixture();
    const packed = await buildExchangePackage(graph, [{ meta: asset, bytes }], {
      documents: [
        { path: 'documents/coverage.md', bytes: strToU8('# 覆盖率') },
        { path: 'documents/exceptions-b9a.md', bytes: strToU8('# 例外') },
      ],
    });
    const read = await readExchangePackage(packed);
    expect(read.manifest.documents).toEqual([
      'documents/coverage.md',
      'documents/exceptions-b9a.md',
    ]);
    const files = unzipSync(packed);
    expect(strFromU8(files['documents/coverage.md'])).toBe('# 覆盖率');
  });

  it('拒绝错误容器版本', async () => {
    const { bytes, asset, graph } = await fixture();
    const packed = await buildExchangePackage(graph, [{ meta: asset, bytes }]);
    const files = unzipSync(packed);
    const manifest = JSON.parse(strFromU8(files[EXCHANGE_MANIFEST]));
    manifest.formatVersion = 2;
    files[EXCHANGE_MANIFEST] = strToU8(JSON.stringify(manifest));
    await expect(readExchangePackage(zipSync(files))).rejects.toThrow(/容器版本 2/);
  });

  it('拒绝缺少图片、sha 不符、路径穿越', async () => {
    const { bytes, asset, graph } = await fixture();
    const packed = await buildExchangePackage(graph, [{ meta: asset, bytes }]);

    const missing = unzipSync(packed);
    delete missing[asset.path];
    await expect(readExchangePackage(zipSync(missing))).rejects.toThrow(/缺少资源文件/);

    const wrong = unzipSync(packed);
    wrong[asset.path] = strToU8('tampered');
    await expect(readExchangePackage(zipSync(wrong))).rejects.toThrow(/字节|sha256/);

    const traversal = {
      ...graph,
      assets: [{ ...asset, path: '../evil.png' }],
    };
    await expect(buildExchangePackage(traversal, [{ meta: traversal.assets[0], bytes }])).rejects.toThrow(
      /路径不合法/,
    );
  });

  it('文件名与识别', () => {
    expect(exchangeFileName('苏科版 物理/全四册', new Date('2026-10-28T00:00:00Z'))).toBe(
      'textbook-graph-苏科版-物理-全四册-2026-10-28.tbg',
    );
    expect(isExchangeFileName('a.TBG')).toBe(true);
    expect(isExchangeFileName('a.json')).toBe(false);
  });
});
