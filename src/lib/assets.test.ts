import { describe, expect, it } from 'vitest';
import {
  MAX_ASSET_BYTES,
  assetIdOf,
  assetMetaIssues,
  assetPathProblem,
  collectAssetReferences,
  extractAssetIds,
  validateAssetIntegrity,
} from './assets';
import { mkNode } from './test-helpers';
import type { AssetMeta, SourceAnchor } from './schema';

const goodAsset: AssetMeta = {
  id: 'img-001',
  path: 'assets/img-001.png',
  mimeType: 'image/png',
  byteLength: 4096,
  sha256: 'a'.repeat(64),
  alt: '示意图',
};

const codes = (meta: AssetMeta) => assetMetaIssues(meta).map((issue) => issue.code);

const branch = mkNode('b', 'branch', null, 1024);
const noteWith = (content: string, id = 'n1', solution?: string) =>
  mkNode(id, 'note', 'b', 1024, { content, solution });

describe('asset 路径', () => {
  it('接受包内相对路径', () => {
    expect(assetPathProblem('assets/img-001.png')).toBeNull();
    expect(assetPathProblem('assets/ch2/fig-3.webp')).toBeNull();
  });

  it('拒绝 .. 片段', () => {
    expect(assetPathProblem('assets/../secret.png')).toMatch(/\.\./);
    expect(assetPathProblem('../secret.png')).toMatch(/\.\./);
  });

  it('拒绝绝对路径', () => {
    expect(assetPathProblem('/etc/passwd')).toMatch(/相对路径/);
  });

  it('拒绝连续斜杠、点片段与结尾斜杠', () => {
    expect(assetPathProblem('assets//img.png')).toMatch(/\/\//);
    expect(assetPathProblem('assets/./img.png')).toMatch(/\./);
    expect(assetPathProblem('assets/')).toMatch(/\//);
    expect(assetPathProblem('')).toMatch(/不能为空/);
  });

  it('拒绝反斜杠', () => {
    expect(assetPathProblem('assets\\img.png')).toMatch(/反斜杠/);
  });
});

describe('asset 元信息', () => {
  it('合法资源没有问题', () => {
    expect(assetMetaIssues(goodAsset)).toEqual([]);
  });

  it('MIME 不在白名单就拒（svg 暂缓）', () => {
    expect(codes({ ...goodAsset, mimeType: 'image/gif' })).toContain('unsupported-asset-type');
    expect(codes({ ...goodAsset, mimeType: 'image/svg+xml' })).toContain('unsupported-asset-type');
    expect(codes({ ...goodAsset, mimeType: 'image/webp' })).toEqual([]);
    expect(codes({ ...goodAsset, mimeType: 'image/jpeg' })).toEqual([]);
  });

  it('sha256 必须是 64 位小写 hex', () => {
    expect(codes({ ...goodAsset, sha256: 'abc' })).toContain('invalid-asset-sha256');
    expect(codes({ ...goodAsset, sha256: 'A'.repeat(64) })).toContain('invalid-asset-sha256');
    expect(codes({ ...goodAsset, sha256: 'a'.repeat(63) })).toContain('invalid-asset-sha256');
  });

  it('byteLength 必须是正整数且不超过 8 MiB', () => {
    expect(codes({ ...goodAsset, byteLength: 0 })).toContain('invalid-asset-size');
    expect(codes({ ...goodAsset, byteLength: -1 })).toContain('invalid-asset-size');
    expect(codes({ ...goodAsset, byteLength: 1.5 })).toContain('invalid-asset-size');
    expect(codes({ ...goodAsset, byteLength: MAX_ASSET_BYTES + 1 })).toContain('asset-too-large');
    expect(codes({ ...goodAsset, byteLength: MAX_ASSET_BYTES })).toEqual([]);
  });

  it('id 字符集与 markdown 里的 asset://<id> 一致', () => {
    expect(codes({ ...goodAsset, id: 'img 001' })).toContain('invalid-asset-id');
    expect(codes({ ...goodAsset, id: 'img_001.v2' })).toEqual([]);
  });
});

describe('asset 引用扫描', () => {
  it('抽 id 时去重并保留出现顺序', () => {
    expect(extractAssetIds('![](asset://b) ![](asset://a) ![](asset://b)')).toEqual(['b', 'a']);
  });

  it('assetIdOf 能去掉查询串与锚点', () => {
    expect(assetIdOf('asset://img-1')).toBe('img-1');
    expect(assetIdOf('asset://img-1?v=2#top')).toBe('img-1');
    expect(assetIdOf('https://example.com/a.png')).toBeNull();
    expect(assetIdOf('asset://')).toBeNull();
  });

  it('content 与 solution 里的引用都算', () => {
    const refs = collectAssetReferences([
      branch,
      noteWith('![](asset://img-1)', 'n1'),
      noteWith('', 'n2', '![](asset://img-1) ![](asset://img-2)'),
    ]);
    expect(refs.get('img-1')).toEqual(['n1', 'n2']);
    expect(refs.get('img-2')).toEqual(['n2']);
  });
});

describe('validateAssetIntegrity', () => {
  const nodes = [branch, noteWith('![](asset://img-001) and ![](asset://img-404)')];

  it('引用了不存在的资源是 error，并指出节点与 id', () => {
    const issues = validateAssetIntegrity({ nodes, assets: [goodAsset] });
    const missing = issues.filter((issue) => issue.code === 'missing-asset');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('error');
    expect(missing[0].message).toContain('asset://img-404');
    expect(missing[0].message).toContain('n1');
  });

  it('没人引用的资源是 warning', () => {
    const issues = validateAssetIntegrity({
      nodes: [branch, noteWith('![](asset://img-001)')],
      assets: [goodAsset],
    });
    expect(issues).toEqual([]);

    const unused = validateAssetIntegrity({
      nodes: [branch],
      assets: [goodAsset],
    });
    expect(unused.map((issue) => issue.code)).toEqual(['unused-asset']);
    expect(unused[0].severity).toBe('warning');
  });

  it('资源 id 重复是 error', () => {
    const issues = validateAssetIntegrity({
      nodes: [branch, noteWith('![](asset://img-001)')],
      assets: [goodAsset, { ...goodAsset }],
    });
    expect(issues.map((issue) => issue.code)).toContain('duplicate-asset-id');
    expect(issues.find((issue) => issue.code === 'duplicate-asset-id')?.severity).toBe('error');
  });

  it('字段非法会一路报上来', () => {
    const issues = validateAssetIntegrity({
      nodes: [branch],
      assets: [{ ...goodAsset, path: '../x.png', mimeType: 'image/gif', sha256: 'zz' }],
    });
    const reported = issues.map((issue) => issue.code);
    expect(reported).toContain('invalid-asset-path');
    expect(reported).toContain('unsupported-asset-type');
    expect(reported).toContain('invalid-asset-sha256');
  });

  it('锚点指向不存在的节点是 error', () => {
    const anchors: SourceAnchor[] = [
      { id: 'a1', nodeId: 'ghost', sourceId: 's1', pageLabel: 'P1' },
      { id: 'a2', nodeId: 'b', sourceId: 's1', pageLabel: 'P2' },
    ];
    const issues = validateAssetIntegrity({ nodes: [branch], anchors });
    expect(issues.map((issue) => issue.code)).toEqual(['missing-anchor-node']);
    expect(issues[0].message).toContain('ghost');
  });
});
