import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Root } from 'hast';
import { migrateV8ToV9 } from './migrations/v8-to-v9';
import {
  registerAssetUrl,
  registeredAssetUrlCount,
  releaseAssetUrls,
  rehypeAssetScheme,
} from './markdown';
import {
  graphJSONSchemaV9,
  type AssetMeta,
  type BookMetaV9,
  type GraphJSON,
  type SourceAnchor,
} from './schema';
import { parseGraph, serializeGraph } from './serialize';
import { mkEdge, mkNode } from './test-helpers';

const examplesDir = new URL('../../examples/', import.meta.url);
const readExample = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, examplesDir), 'utf8'));

const book: BookMetaV9 = {
  subject: 'physics',
  stage: 'junior',
  title: '测试物理教材',
  edition: '测试版',
  bookId: 'book-1',
  publisher: '某出版社',
  publicationYear: 2024,
  isbn: '978-7-000-00000-0',
  volume: '下册',
  sourceRevision: 'rev-1',
};

const nodes = [
  mkNode('b', 'branch', null, 1024, { title: '根' }),
  mkNode('c', 'chapter', 'b', 1024),
  mkNode('t', 'theorem', 'c', 1024, { content: '如图 ![](asset://img-1)' }),
];

/** 不引用任何 asset:// 的图，用于测 extras 缺省行为 */
const plainNodes = [mkNode('b', 'branch', null, 1024), mkNode('n', 'note', 'b', 1024, { content: '纯文本' })];

const asset: AssetMeta = {
  id: 'img-1',
  path: 'assets/img-1.png',
  mimeType: 'image/png',
  byteLength: 2048,
  sha256: 'f'.repeat(64),
  alt: '斜面示意图',
  // 裁图流水线从 PNG 头回填的内在尺寸：往返不能丢
  width: 1280,
  height: 720,
  originalName: '斜面.png',
};

const anchor: SourceAnchor = {
  id: 'anchor-1',
  nodeId: 't',
  sourceId: 'source-1',
  pageLabel: 'P12',
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  contentRange: { start: 0, end: 20, contentHash: 'abc' },
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('v8 → v9 迁移', () => {
  it('样例备份迁移后节点、关系、步骤逐字段不变', () => {
    const raw = readExample('v8-physics.json');
    const parsed = parseGraph(raw);

    expect(parsed.schemaVersion).toBe(9);
    expect(parsed.anchors).toEqual([]);
    expect(parsed.assets).toEqual([]);
    expect(parsed.warnings.map((issue) => issue.code)).toEqual(['migrated-from-v8']);

    // 无损：每个 id / content / 关系 / 步骤与原始 JSON 完全一致（不重新编号、不排序）
    expect(parsed.nodes).toEqual(raw.nodes);
    expect(parsed.edges).toEqual(raw.edges);
    expect(parsed.steps).toEqual((raw.steps as unknown[] | undefined) ?? []);
    expect(
      parsed.nodes.map((node) => [node.id, node.content, node.createdAt, node.updatedAt]),
    ).toEqual(
      (raw.nodes as { id: string; content: string; createdAt: number; updatedAt: number }[]).map(
        (node) => [node.id, node.content, node.createdAt, node.updatedAt],
      ),
    );
  });

  it('migrateV8ToV9 是纯函数：只补三个字段，不修改入参', () => {
    const raw = readExample('v8-physics.json');
    const before = clone(raw);
    const migrated = migrateV8ToV9(raw as unknown as GraphJSON);

    expect(migrated.schemaVersion).toBe(9);
    expect(migrated.anchors).toEqual([]);
    expect(migrated.assets).toEqual([]);
    expect(migrated.exportedAt).toBe(raw.exportedAt);
    expect(migrated.book).toEqual(raw.book);
    expect(migrated.nodes).toEqual(raw.nodes);
    expect(migrated.edges).toEqual(raw.edges);
    expect(raw).toEqual(before);
  });

  it('v9 导出再导入，除 exportedAt 外完全一致', () => {
    const edges = [mkEdge('t', 'c', 'cites')];
    const exported = serializeGraph(book, nodes, edges, [], { anchors: [anchor], assets: [asset] });

    expect(exported.schemaVersion).toBe(9);
    const parsed = parseGraph(clone(exported));

    expect(parsed.schemaVersion).toBe(9);
    expect(parsed.book).toEqual(book);
    expect(parsed.nodes).toEqual(exported.nodes);
    expect(parsed.edges).toEqual(exported.edges);
    expect(parsed.steps).toEqual([]);
    expect(parsed.anchors).toEqual([anchor]);
    expect(parsed.assets).toEqual([asset]);
    expect(parsed.warnings).toEqual([]);
  });

  it('extras 缺省时 anchors / assets 补空数组', () => {
    const exported = serializeGraph(book, plainNodes, []);
    expect(exported.anchors).toEqual([]);
    expect(exported.assets).toEqual([]);
    expect(() => parseGraph(clone(exported))).not.toThrow();
  });

  it('缺少 anchors / assets 字段的 v9 文件按空数组处理', () => {
    const partial = clone(serializeGraph(book, plainNodes, []));
    delete (partial as { anchors?: unknown }).anchors;
    delete (partial as { assets?: unknown }).assets;
    const parsed = parseGraph(partial);
    expect(parsed.anchors).toEqual([]);
    expect(parsed.assets).toEqual([]);
  });

  it('未知顶层字段在 v9 严格模式下被拒', () => {
    const withExtra = clone(serializeGraph(book, plainNodes, [])) as unknown as Record<string, unknown>;
    withExtra.foo = 1;
    expect(() => parseGraph(withExtra)).toThrowError(/数据结构不对/);
  });

  it('v7 及更早的备份仍然拒绝，且说明 v8 会自动迁移', () => {
    const v7 = clone(serializeGraph(book, nodes, [])) as unknown as Record<string, unknown>;
    v7.schemaVersion = 7;
    expect(() => parseGraph(v7)).toThrowError(/这是 v7 备份/);
    expect(() => parseGraph(v7)).toThrowError(/v8 备份会自动迁移到 v9/);
  });
});

describe('v9 资产与锚点校验', () => {
  it('引用缺失的 asset 会被拒绝', () => {
    const broken = serializeGraph(
      book,
      [mkNode('b', 'branch', null, 1024), mkNode('n', 'note', 'b', 1024, { content: '![](asset://img-404)' })],
      [],
    );
    expect(() => parseGraph(clone(broken))).toThrowError(/img-404/);
    expect(() => parseGraph(clone(broken))).toThrowError(/没通过校验/);
  });

  it('没被引用的 asset 只给警告，不阻止导入', () => {
    const exported = serializeGraph(book, nodes, [], [], { assets: [asset, { ...asset, id: 'img-2' }] });
    const parsed = parseGraph(clone(exported));
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.warnings.map((issue) => issue.code)).toContain('unused-asset');
  });

  it('非法 MIME 类型在导入时被拒', () => {
    const exported = serializeGraph(book, nodes, [], [], {
      assets: [{ ...asset, mimeType: 'image/svg+xml' }],
    });
    expect(() => parseGraph(clone(exported))).toThrowError(/image\/svg\+xml|没通过校验/);
  });

  it('width / height 必须是正整数，老数据没有也照常解析', () => {
    const base = clone(serializeGraph(book, nodes, [], [], { assets: [asset] }));
    expect(
      graphJSONSchemaV9.safeParse({
        ...base,
        assets: [{ ...asset, width: 0 }],
      }).success,
    ).toBe(false);
    expect(
      graphJSONSchemaV9.safeParse({
        ...base,
        assets: [{ ...asset, height: 1.5 }],
      }).success,
    ).toBe(false);
    const withoutSize = { ...asset } as Record<string, unknown>;
    delete withoutSize.width;
    delete withoutSize.height;
    expect(
      graphJSONSchemaV9.safeParse({
        ...base,
        assets: [withoutSize],
      }).success,
    ).toBe(true);
  });

  it('锚点指向不存在的节点会被拒绝', () => {
    const exported = serializeGraph(book, nodes, [], [], { anchors: [{ ...anchor, nodeId: 'ghost' }] });
    expect(() => parseGraph(clone(exported))).toThrowError(/ghost/);
  });

  it('region 越界、contentRange 倒序在 schema 层就被拒', () => {
    const base = clone(serializeGraph(book, nodes, []));
    expect(
      graphJSONSchemaV9.safeParse({
        ...base,
        anchors: [{ ...anchor, region: { x: 1.5, y: 0, width: 0.1, height: 0.1 } }],
      }).success,
    ).toBe(false);
    expect(
      graphJSONSchemaV9.safeParse({
        ...base,
        anchors: [{ ...anchor, contentRange: { start: 10, end: 3, contentHash: 'x' } }],
      }).success,
    ).toBe(false);
    expect(
      graphJSONSchemaV9.safeParse({
        ...base,
        anchors: [{ ...anchor, region: { x: 0, y: 0, width: 0, height: 0.1 } }],
      }).success,
    ).toBe(false);
  });
});

describe('rehypeAssetScheme', () => {
  interface ImgProps {
    src?: unknown;
    alt?: unknown;
    className?: string[];
    dataMissingAsset?: unknown;
  }

  // unified 的插件签名带 this: Processor，测试里直接当普通函数调
  const plugin = rehypeAssetScheme as unknown as () => (tree: Root) => void;
  const run = (tree: Root) => plugin()(tree);

  const treeWith = (src: string): Root =>
    ({
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'img',
              properties: { src, alt: '示意图' },
              children: [],
            },
          ],
        },
      ],
    }) as unknown as Root;

  const imgOf = (tree: Root): ImgProps => {
    const paragraph = tree.children[0] as unknown as { children: { properties: ImgProps }[] };
    return paragraph.children[0].properties;
  };

  it('已登记的资源替换成真实 URL', () => {
    registerAssetUrl('img-1', 'blob:asset-img-1');
    const tree = treeWith('asset://img-1');
    run(tree);
    expect(imgOf(tree).src).toBe('blob:asset-img-1');
    expect(imgOf(tree).dataMissingAsset).toBeUndefined();
    releaseAssetUrls();
  });

  it('未登记的资源置空 src 并打标记，alt 保留', () => {
    const tree = treeWith('asset://img-404');
    run(tree);
    expect(imgOf(tree).src).toBe('');
    expect(imgOf(tree).dataMissingAsset).toBe('img-404');
    expect(imgOf(tree).className).toContain('asset-missing');
    expect(imgOf(tree).alt).toBe('示意图');
  });

  it('releaseAssetUrls 会清空登记表', () => {
    registerAssetUrl('img-1', 'blob:asset-img-1');
    expect(registeredAssetUrlCount()).toBe(1);
    releaseAssetUrls();
    expect(registeredAssetUrlCount()).toBe(0);
  });

  it('不是 asset:// 的图片原样保留', () => {
    const tree = treeWith('https://example.com/a.png');
    run(tree);
    expect(imgOf(tree).src).toBe('https://example.com/a.png');
  });
});
