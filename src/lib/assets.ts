import type { AssetMeta, Node, SourceAnchor } from './schema';
import type { ValidationIssue } from './validate';
import { regionProblem } from './coords';

/** 坐标校验与换算统一走 coords.ts，这里只做转出，别处不要重写一套 */
export { regionProblem };

/**
 * 本地媒体资源（`asset://`）的纯逻辑层。
 *
 * 这里只做「能不能收」「引用得上不上」的判断，不碰 IndexedDB、不碰 File/Blob，
 * 所以 db.ts / serialize.ts / validate.ts 都能复用，也能直接单测。
 */

export const ASSET_URL_SCHEME = 'asset://';

/** 单个资源上限 8 MiB。教材插图够用了，再大就别塞进 JSON 包。 */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/**
 * 允许的 MIME 类型白名单。
 *
 * TODO: `image/svg+xml` 暂不接受——SVG 可以内嵌 <script> 和远程引用，
 * 等接入清洗（去脚本、去外部 href）后再放行。
 */
export const ASSET_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** markdown 里 asset://<id> 的 id 字符集，与 rehype 插件共用 */
export const ASSET_ID_RE = /^[\w.-]+$/;

/** 全文扫描；不带 g 标志，`match` 不会残留 lastIndex */
const ASSET_URL_RE = /asset:\/\/([\w.-]+)/g;

export function isAssetUrl(src: string): boolean {
  return src.startsWith(ASSET_URL_SCHEME);
}

/** `asset://img-1` → `img-1`；不是 asset 链接返回 null */
export function assetIdOf(src: string): string | null {
  if (!isAssetUrl(src)) return null;
  const id = src.slice(ASSET_URL_SCHEME.length).split(/[?#]/, 1)[0];
  return ASSET_ID_RE.test(id) ? id : null;
}

/**
 * 一个资源可能对应的本地文件名。
 *
 * 用户是从文件管理器里多选图片丢进来的，浏览器只给 basename，
 * 所以先看 originalName，再拿 path 的 basename 兜底（见 loadAssetFiles）。
 */
export function assetFileNames(meta: AssetMeta): string[] {
  const names: string[] = [];
  if (meta.originalName) names.push(meta.originalName);
  const base = meta.path.split('/').pop();
  if (base && !names.includes(base)) names.push(base);
  return names;
}

/**
 * 按字节算 SHA-256，返回 64 位小写 hex。
 *
 * 用 `globalThis.crypto.subtle`：浏览器和 vitest 的 node 环境都有，
 * 不用 node:crypto，免得两套 API。
 */
export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 抽出 markdown 里引用的所有 asset id（去重，保留出现顺序） */
export function extractAssetIds(markdown: string): string[] {
  const ids: string[] = [];
  for (const match of markdown.matchAll(ASSET_URL_RE)) {
    const id = match[1];
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** asset id → 引用了它的节点 id 列表（content 与 solution 都扫） */
export function collectAssetReferences(nodes: Node[]): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const node of nodes) {
    for (const text of [node.content, node.solution ?? '']) {
      for (const id of extractAssetIds(text)) {
        const owners = refs.get(id);
        if (owners) {
          if (!owners.includes(node.id)) owners.push(node.id);
        } else {
          refs.set(id, [node.id]);
        }
      }
    }
  }
  return refs;
}

/**
 * 包内相对路径的硬性要求。
 * 返回 null 表示合法，否则返回一句中文原因。
 */
export function assetPathProblem(path: string): string | null {
  if (!path) return '路径不能为空。';
  if (path.startsWith('/')) return '路径必须是包内相对路径，不能以 / 开头。';
  if (path.includes('\\')) return '路径不能包含反斜杠。';
  if (path.includes('//')) return '路径不能包含连续的 //。';
  if (path.endsWith('/')) return '路径必须指向文件，不能以 / 结尾。';
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return '路径不能包含 . 或 .. 片段。';
  }
  if (!/^[\w./-]+$/.test(path)) return '路径只能包含字母、数字、下划线、点、连字符和斜杠。';
  return null;
}

/** 单个 AssetMeta 的字段校验（不含「有没有人引用」这类跨表检查） */
export function assetMetaIssues(meta: AssetMeta): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (code: string, message: string, field: string) =>
    issues.push({ severity: 'error', code, message, field });

  if (!ASSET_ID_RE.test(meta.id)) {
    push('invalid-asset-id', `资源 id「${meta.id}」不合法：只能用字母、数字、下划线、点和连字符。`, 'id');
  }

  const pathProblem = assetPathProblem(meta.path);
  if (pathProblem) push('invalid-asset-path', `资源 ${meta.id} 的路径不合法：${pathProblem}`, 'path');

  if (!(ASSET_MIME_TYPES as readonly string[]).includes(meta.mimeType)) {
    push(
      'unsupported-asset-type',
      `资源 ${meta.id} 的 MIME 类型「${meta.mimeType}」不受支持，只接受 ${ASSET_MIME_TYPES.join('、')}。`,
      'mimeType',
    );
  }

  if (!Number.isInteger(meta.byteLength) || meta.byteLength <= 0) {
    push('invalid-asset-size', `资源 ${meta.id} 的字节数必须是正整数。`, 'byteLength');
  } else if (meta.byteLength > MAX_ASSET_BYTES) {
    push(
      'asset-too-large',
      `资源 ${meta.id} 有 ${meta.byteLength} 字节，超过上限 ${MAX_ASSET_BYTES} 字节（8 MiB）。`,
      'byteLength',
    );
  }

  if (!/^[0-9a-f]{64}$/.test(meta.sha256)) {
    push('invalid-asset-sha256', `资源 ${meta.id} 的 sha256 必须是 64 位小写 hex。`, 'sha256');
  }

  return issues;
}

/**
 * v9 的跨表检查：assets 字段 / 引用完整性 / anchors 指向。
 *
 * 只在调用方明确提供了 assets 或 anchors 时才应该跑（见 validateGraphInvariants），
 * 老调用点不传这两个字段，行为与 v8 完全一致。
 */
export function validateAssetIntegrity(graph: {
  nodes: Node[];
  assets?: AssetMeta[];
  anchors?: SourceAnchor[];
}): ValidationIssue[] {
  const assets = graph.assets ?? [];
  const anchors = graph.anchors ?? [];
  const issues: ValidationIssue[] = [];

  const known = new Set<string>();
  for (const asset of assets) {
    if (known.has(asset.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-asset-id',
        message: `资源 id 重复：${asset.id}`,
        field: 'id',
      });
      continue;
    }
    known.add(asset.id);
    issues.push(...assetMetaIssues(asset));
  }

  const refs = collectAssetReferences(graph.nodes);
  const titles = new Map(graph.nodes.map((node) => [node.id, node.title]));

  for (const [assetId, nodeIds] of refs) {
    if (known.has(assetId)) continue;
    const owners = nodeIds.map((id) => `「${titles.get(id) ?? id}」`).join('、');
    issues.push({
      severity: 'error',
      code: 'missing-asset',
      message: `节点${owners}引用了 asset://${assetId}，但 assets 里没有这个资源。`,
      nodeId: nodeIds[0],
      suggestion: `补上 ${assetId} 的媒体文件，或把正文里的 asset://${assetId} 删掉。`,
    });
  }

  for (const asset of assets) {
    if (refs.has(asset.id)) continue;
    issues.push({
      severity: 'warning',
      code: 'unused-asset',
      message: `资源 ${asset.id}（${asset.path}）没有被任何节点引用。`,
      suggestion: '如果确实用不上，可以删掉这个资源以减小包体积。',
    });
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  for (const anchor of anchors) {
    if (!nodeIds.has(anchor.nodeId)) {
      issues.push({
        severity: 'error',
        code: 'missing-anchor-node',
        message: `出处锚点 ${anchor.id} 指向不存在的节点 ${anchor.nodeId}。`,
        nodeId: anchor.nodeId,
        field: 'nodeId',
      });
    }
    if (anchor.region !== undefined) {
      const problem = regionProblem(anchor.region);
      if (problem) {
        issues.push({
          severity: 'error',
          code: 'invalid-anchor-region',
          message: `出处锚点 ${anchor.id} 的 region 不合法：${problem}`,
          nodeId: anchor.nodeId,
          field: 'region',
          suggestion: '按 §0.2 的坐标规范重新换算；坐标不确定就整个省略 region，不要填零值或整页框。',
        });
      }
    }
  }

  return issues;
}
