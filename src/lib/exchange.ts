import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { AssetMeta, GraphJSONV9 } from './schema';
import { assetMetaIssues, assetPathProblem, sha256Hex } from './assets';

/**
 * 教材交换包（`.tbg`）——一个 ZIP，把 v9 图和它引用的图片放在同一个文件里。
 *
 * 目录结构：
 *   manifest.json          格式元信息（本文件定义）
 *   graph.json             v9 GraphJSON（assets[] 里只有元信息，不含二进制）
 *   assets/...             graph.assets[].path 指向的实际图片
 *   documents/...          可选的人类可读文档（coverage / exceptions），导入忽略
 *
 * 版本策略：
 *   - `formatVersion` 是这个容器格式的版本，当前 1；
 *   - `graph.json` 的 `schemaVersion` 是数据格式版本，当前 9；
 *   - 两者独立演进：容器结构变了升 formatVersion，节点/边/资源字段变了升 schemaVersion。
 *   - 导入端只接受 formatVersion=1 且 schemaVersion=9 的包；更高版本给明确报错。
 */

export const EXCHANGE_FORMAT = 'textbook-graph-exchange' as const;
export const EXCHANGE_FORMAT_VERSION = 1 as const;
export const EXCHANGE_EXTENSION = '.tbg';
export const EXCHANGE_MIME = 'application/x-textbook-graph';
export const EXCHANGE_MANIFEST = 'manifest.json';
export const EXCHANGE_GRAPH = 'graph.json';

/** 单个包的上限，防止误选超大 ZIP 把浏览器内存打满。818 张教材图约 160 MB。 */
export const MAX_EXCHANGE_BYTES = 512 * 1024 * 1024;

export interface ExchangeManifest {
  format: typeof EXCHANGE_FORMAT;
  formatVersion: typeof EXCHANGE_FORMAT_VERSION;
  schemaVersion: number;
  createdAt: string;
  generator: string;
  graph: string;
  book: {
    title: string;
    subject: string;
    stage: string;
    edition?: string;
  };
  counts: {
    nodes: number;
    edges: number;
    assets: number;
  };
  /** 可选的人类可读文档（包内路径）。导入时忽略。 */
  documents?: string[];
}

export interface ExchangeAsset {
  meta: AssetMeta;
  bytes: Uint8Array;
}

export interface ExchangeDocument {
  /** 包内路径，如 documents/coverage.md */
  path: string;
  bytes: Uint8Array;
}

export interface ExchangePackageInput {
  documents?: ExchangeDocument[];
  generator?: string;
  createdAt?: Date;
}

export interface ExchangePackage {
  manifest: ExchangeManifest;
  graph: GraphJSONV9;
  assets: ExchangeAsset[];
}

/** TS 6 的 Uint8Array<ArrayBufferLike> 不能直接当 BufferSource / BlobPart，这里复制成独立 ArrayBuffer。 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function assertPackagePath(path: string, label: string): void {
  const problem = assetPathProblem(path);
  if (problem) throw new Error(`${label} 路径不合法：${problem}`);
  if (path === EXCHANGE_MANIFEST || path === EXCHANGE_GRAPH) {
    throw new Error(`${label} 不能占用保留路径 ${path}。`);
  }
}

/** 生成交换包。会逐张校验资产大小与 sha256，不把损坏的图写进包里。 */
export async function buildExchangePackage(
  graph: GraphJSONV9,
  assets: ExchangeAsset[],
  input: ExchangePackageInput = {},
): Promise<Uint8Array> {
  if (graph.schemaVersion !== 9) {
    throw new Error(`交换包只支持 schemaVersion=9，当前是 ${String(graph.schemaVersion)}。`);
  }

  const graphAssetIds = new Set(graph.assets.map((asset) => asset.id));
  const provided = new Map<string, ExchangeAsset>();
  const paths = new Set<string>();
  for (const asset of assets) {
    if (provided.has(asset.meta.id)) throw new Error(`资源 id 重复：${asset.meta.id}`);
    if (!graphAssetIds.has(asset.meta.id)) {
      throw new Error(`资源 ${asset.meta.id} 不在 graph.assets 里。`);
    }
    assertPackagePath(asset.meta.path, `资源 ${asset.meta.id}`);
    if (paths.has(asset.meta.path)) throw new Error(`资源路径重复：${asset.meta.path}`);
    paths.add(asset.meta.path);

    const problems = assetMetaIssues(asset.meta);
    if (problems.length > 0) {
      throw new Error(problems.map((issue) => issue.message).join('；'));
    }
    if (asset.bytes.byteLength !== asset.meta.byteLength) {
      throw new Error(
        `资源 ${asset.meta.id} 实际 ${asset.bytes.byteLength} 字节，元信息写的是 ${asset.meta.byteLength}。`,
      );
    }
    const digest = await sha256Hex(toArrayBuffer(asset.bytes));
    if (digest !== asset.meta.sha256) {
      throw new Error(`资源 ${asset.meta.id} 的 sha256 与元信息不一致。`);
    }
    provided.set(asset.meta.id, asset);
  }
  if (provided.size !== graph.assets.length) {
    const missing = graph.assets.filter((asset) => !provided.has(asset.id)).map((asset) => asset.id);
    throw new Error(`交换包缺少 ${missing.length} 张资源：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  }

  const documents = input.documents ?? [];
  for (const document of documents) {
    assertPackagePath(document.path, '文档');
    if (paths.has(document.path)) throw new Error(`包内路径重复：${document.path}`);
    paths.add(document.path);
  }

  const manifest: ExchangeManifest = {
    format: EXCHANGE_FORMAT,
    formatVersion: EXCHANGE_FORMAT_VERSION,
    schemaVersion: graph.schemaVersion,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    generator: input.generator ?? 'textbook-graph',
    graph: EXCHANGE_GRAPH,
    book: {
      title: graph.book.title,
      subject: graph.book.subject,
      stage: graph.book.stage,
      ...(graph.book.edition ? { edition: graph.book.edition } : {}),
    },
    counts: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      assets: graph.assets.length,
    },
    ...(documents.length > 0 ? { documents: documents.map((document) => document.path) } : {}),
  };

  const files: Zippable = {
    [EXCHANGE_MANIFEST]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 9 }],
    [EXCHANGE_GRAPH]: [strToU8(JSON.stringify(graph)), { level: 9 }],
  };
  // 图片已经压缩过，用 store 避免白白耗 CPU；JSON 用小体积换速度。
  for (const asset of provided.values()) {
    files[asset.meta.path] = [asset.bytes, { level: 0 }];
  }
  for (const document of documents) {
    files[document.path] = [document.bytes, { level: 9 }];
  }

  return zipSync(files, { level: 0 });
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

function parseManifest(bytes: Uint8Array): ExchangeManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`${EXCHANGE_MANIFEST} 不是合法 JSON。`);
  }
  const manifest = asObject(raw, EXCHANGE_MANIFEST);
  if (manifest.format !== EXCHANGE_FORMAT) {
    throw new Error(`不是教材交换包：manifest.format = ${String(manifest.format)}。`);
  }
  if (manifest.formatVersion !== EXCHANGE_FORMAT_VERSION) {
    throw new Error(
      `交换包容器版本 ${String(manifest.formatVersion)} 不受支持，当前只接受 ${EXCHANGE_FORMAT_VERSION}。`,
    );
  }
  if (typeof manifest.graph !== 'string') throw new Error('manifest.graph 必须是字符串。');
  const graphPathProblem = assetPathProblem(manifest.graph);
  if (graphPathProblem) throw new Error(`manifest.graph 路径不合法：${graphPathProblem}`);
  if (manifest.graph !== EXCHANGE_GRAPH) {
    throw new Error(`manifest.graph 必须是 ${EXCHANGE_GRAPH}。`);
  }
  if (manifest.schemaVersion !== 9) {
    throw new Error(`交换包只支持 schemaVersion=9，当前是 ${String(manifest.schemaVersion)}。`);
  }
  if (typeof manifest.createdAt !== 'string') throw new Error('manifest.createdAt 必须是字符串。');
  if (typeof manifest.generator !== 'string') throw new Error('manifest.generator 必须是字符串。');
  const book = asObject(manifest.book, 'manifest.book');
  for (const key of ['title', 'subject', 'stage'] as const) {
    if (typeof book[key] !== 'string') throw new Error(`manifest.book.${key} 必须是字符串。`);
  }
  const counts = asObject(manifest.counts, 'manifest.counts');
  for (const key of ['nodes', 'edges', 'assets'] as const) {
    if (typeof counts[key] !== 'number') throw new Error(`manifest.counts.${key} 必须是数字。`);
  }
  if (manifest.documents !== undefined && !Array.isArray(manifest.documents)) {
    throw new Error('manifest.documents 必须是数组。');
  }
  return manifest as unknown as ExchangeManifest;
}

/** 读交换包：校验容器、清单、图，并逐张校验图片大小与 sha256。 */
export async function readExchangePackage(bytes: Uint8Array): Promise<ExchangePackage> {
  if (bytes.byteLength > MAX_EXCHANGE_BYTES) {
    throw new Error(`交换包 ${bytes.byteLength} 字节，超过上限 ${MAX_EXCHANGE_BYTES} 字节（512 MiB）。`);
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('不是有效的 .tbg 交换包（ZIP 解压失败）。');
  }
  const manifestBytes = files[EXCHANGE_MANIFEST];
  if (!manifestBytes) throw new Error(`交换包缺少 ${EXCHANGE_MANIFEST}。`);
  const manifest = parseManifest(manifestBytes);

  const graphBytes = files[manifest.graph];
  if (!graphBytes) throw new Error(`交换包缺少 ${manifest.graph}。`);
  let graphRaw: unknown;
  try {
    graphRaw = JSON.parse(strFromU8(graphBytes));
  } catch {
    throw new Error(`${manifest.graph} 不是合法 JSON。`);
  }
  const graphObject = asObject(graphRaw, manifest.graph);
  if (graphObject.schemaVersion !== 9) {
    throw new Error(`${manifest.graph}.schemaVersion 必须是 9。`);
  }
  const graphAssets = graphObject.assets;
  if (!Array.isArray(graphAssets)) throw new Error(`${manifest.graph}.assets 必须是数组。`);

  const assets: ExchangeAsset[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const raw of graphAssets) {
    const meta = asObject(raw, 'graph.assets[]') as unknown as AssetMeta;
    if (typeof meta.id !== 'string' || typeof meta.path !== 'string') {
      throw new Error('graph.assets[] 的 id / path 必须是字符串。');
    }
    if (ids.has(meta.id)) throw new Error(`资源 id 重复：${meta.id}`);
    ids.add(meta.id);
    if (paths.has(meta.path)) throw new Error(`资源路径重复：${meta.path}`);
    paths.add(meta.path);
    const problems = assetMetaIssues(meta);
    if (problems.length > 0) throw new Error(problems.map((issue) => issue.message).join('；'));

    const assetBytes = files[meta.path];
    if (!assetBytes) throw new Error(`交换包缺少资源文件：${meta.path}（${meta.id}）。`);
    if (assetBytes.byteLength !== meta.byteLength) {
      throw new Error(
        `资源 ${meta.id} 实际 ${assetBytes.byteLength} 字节，元信息写的是 ${meta.byteLength}。`,
      );
    }
    const digest = await sha256Hex(toArrayBuffer(assetBytes));
    if (digest !== meta.sha256) throw new Error(`资源 ${meta.id} 的 sha256 校验失败。`);
    assets.push({ meta, bytes: assetBytes });
  }

  return {
    manifest,
    graph: graphRaw as GraphJSONV9,
    assets,
  };
}

/** 给下载文件用：`textbook-graph-苏科版初中物理-全四册-2026-10-28.tbg` */
export function exchangeFileName(title: string | undefined, date = new Date()): string {
  const safe = (title ?? 'textbook')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'textbook';
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `textbook-graph-${safe}-${day}${EXCHANGE_EXTENSION}`;
}

/** 用户选中文件后判断走交换包还是旧版 JSON。 */
export function isExchangeFileName(name: string, mimeType = ''): boolean {
  return name.toLowerCase().endsWith(EXCHANGE_EXTENSION) || mimeType === EXCHANGE_MIME;
}
