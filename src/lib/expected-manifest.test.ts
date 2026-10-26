import { describe, expect, it } from 'vitest';
import {
  expectedManifestStats,
  validateExpectedManifest,
  type ExpectedManifestIssue,
} from './book-part';

// =============================================================================
// 夹具：清单是外部 JSON，校验器收 unknown，所以这里也用宽类型，方便故意写坏
// =============================================================================

const PAGE = 19;

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    srcId: 'phy-b8a-p012-01',
    kind: 'para',
    pdfPage: PAGE,
    region: { x: 0.1, y: 0.1, width: 0.4, height: 0.1 },
    parentSrcId: null,
    overlaps: [],
    continuesOn: null,
    extraRegions: [],
    ...overrides,
  };
}

function manifestOf(items: unknown[], header: Record<string, unknown> = {}): unknown {
  return { volume: 'b8a', chapter: 'phy-b8a-c01', pdfPageRange: [18, 25], ...header, items };
}

/** 一条合法清单：嵌套、互写 overlaps、跨页 extraRegions 全都在规则内 */
function validManifest(): unknown {
  return manifestOf([
    item({
      srcId: 'phy-b8a-p012-01',
      kind: 'module',
      region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    }),
    item({
      srcId: 'phy-b8a-p012-02',
      region: { x: 0.15, y: 0.15, width: 0.2, height: 0.1 },
      parentSrcId: 'phy-b8a-p012-01',
    }),
    item({
      srcId: 'phy-b8a-p012-03',
      kind: 'figure',
      region: { x: 0.1, y: 0.7, width: 0.3, height: 0.2 },
      overlaps: ['phy-b8a-p012-04'],
    }),
    item({
      srcId: 'phy-b8a-p012-04',
      kind: 'figure',
      region: { x: 0.25, y: 0.68, width: 0.3, height: 0.2 },
      overlaps: ['phy-b8a-p012-03'],
    }),
    // 跨页大框：续页在 pdfPage 20，续页上的条目一律 parentSrcId: null
    item({
      srcId: 'phy-b8a-p012-05',
      kind: 'module',
      region: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
      continuesOn: 20,
      extraRegions: [{ pdfPage: 20, region: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 } }],
    }),
    item({
      srcId: 'phy-b8a-p013-01',
      pdfPage: 20,
      region: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
    }),
  ]);
}

const matching = (
  issues: ExpectedManifestIssue[],
  code: string,
  severity: ExpectedManifestIssue['severity'],
): ExpectedManifestIssue[] =>
  issues.filter((issue) => issue.code === code && issue.severity === severity);

const hasIssue = (
  issues: ExpectedManifestIssue[],
  code: string,
  severity: ExpectedManifestIssue['severity'] = 'error',
): boolean => matching(issues, code, severity).length > 0;

// =============================================================================
// 形状
// =============================================================================

describe('validateExpectedManifest · 形状', () => {
  it('合法清单 → 0 issue', () => {
    expect(validateExpectedManifest(validManifest())).toEqual([]);
  });

  it('manifest-shape：顶层不是对象 / 缺 items / volume 为空串', () => {
    for (const broken of [null, undefined, 'items', 42, []]) {
      const issues = validateExpectedManifest(broken);
      expect(matching(issues, 'manifest-shape', 'error')).toHaveLength(1);
    }

    expect(hasIssue(validateExpectedManifest({ volume: 'b8a' }), 'manifest-shape')).toBe(true);
    expect(hasIssue(validateExpectedManifest(manifestOf([], { volume: '  ' })), 'manifest-shape')).toBe(true);
    expect(
      hasIssue(validateExpectedManifest(manifestOf([], { pdfPageRange: [25, 18] })), 'manifest-shape'),
    ).toBe(true);
  });

  it('item-shape：srcId / kind / pdfPage / region 与原因都没写', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({ srcId: '' }),
        item({ srcId: 'phy-b8a-p012-02', kind: 'note' }),
        item({ srcId: 'phy-b8a-p012-03', pdfPage: '19' }),
        item({ srcId: 'phy-b8a-p012-04', region: undefined }),
      ]),
    );
    expect(matching(issues, 'item-shape', 'error')).toHaveLength(4);
    expect(matching(issues, 'item-shape', 'warning')).toEqual([]);
  });
});

// =============================================================================
// region
// =============================================================================

describe('validateExpectedManifest · region', () => {
  it('item-region-both：region 与 regionOmittedReason 并存', () => {
    const issues = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', regionOmittedReason: '矢量插图，视觉模型无法给出可靠 bbox' })]),
    );
    expect(hasIssue(issues, 'item-region-both', 'error')).toBe(true);
  });

  it('item-region-invalid：越界 / 零宽 / 非有限数，原因拼进 message', () => {
    const outOfPage = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', region: { x: 0.8, y: 0.1, width: 0.4, height: 0.1 } })]),
    );
    expect(hasIssue(outOfPage, 'item-region-invalid', 'error')).toBe(true);
    expect(outOfPage[0].message).toContain('右边界');

    const zeroWidth = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', region: { x: 0.1, y: 0.1, width: 0, height: 0.1 } })]),
    );
    expect(zeroWidth[0].message).toContain('region.width');

    const nan = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', region: { x: Number.NaN, y: 0.1, width: 0.2, height: 0.1 } })]),
    );
    expect(hasIssue(nan, 'item-region-invalid', 'error')).toBe(true);
  });

  it('只有 regionOmittedReason 不算错', () => {
    const issues = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', region: undefined, regionOmittedReason: '矢量插图，给不出可靠 bbox' })]),
    );
    expect(issues).toEqual([]);
  });
});

// =============================================================================
// srcId
// =============================================================================

describe('validateExpectedManifest · srcId', () => {
  it('srcid-duplicate：同一个 srcId 出现两次', () => {
    const issues = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01' }), item({ srcId: 'phy-b8a-p012-01' })]),
    );
    const duplicates = matching(issues, 'srcid-duplicate', 'error');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].srcId).toBe('phy-b8a-p012-01');
  });

  it('srcid-format：不是 phy-<册>-p<页码>-<两位序号> 只告警', () => {
    const issues = validateExpectedManifest(manifestOf([item({ srcId: 'phy-b8a-p12-01' })]));
    expect(hasIssue(issues, 'srcid-format', 'warning')).toBe(true);
    expect(matching(issues, 'srcid-format', 'error')).toEqual([]);
  });

  it('srcid-order：同一 pdfPage 断号要看得见，但仍只是 warning', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({ srcId: 'phy-b8a-p012-01' }),
        item({ srcId: 'phy-b8a-p012-03', region: { x: 0.1, y: 0.5, width: 0.2, height: 0.1 } }),
      ]),
    );
    const order = matching(issues, 'srcid-order', 'warning');
    expect(order).toHaveLength(1);
    expect(order[0].message).toContain('缺 02');

    const reversed = validateExpectedManifest(
      manifestOf([
        item({ srcId: 'phy-b8a-p012-02' }),
        item({ srcId: 'phy-b8a-p012-01', region: { x: 0.1, y: 0.5, width: 0.2, height: 0.1 } }),
      ]),
    );
    const reversedOrder = matching(reversed, 'srcid-order', 'warning');
    expect(reversedOrder).toHaveLength(1);
    expect(reversedOrder[0].message).toContain('乱序');
  });

  it('pdfpage-out-of-range：页号不在清单头部声明的范围内', () => {
    const issues = validateExpectedManifest(manifestOf([item({ srcId: 'phy-b8a-p012-01', pdfPage: 26 })]));
    expect(hasIssue(issues, 'pdfpage-out-of-range', 'error')).toBe(true);

    // 没写 pdfPageRange 就不做这项检查
    const noRange = validateExpectedManifest({
      volume: 'b8a',
      chapter: 'phy-b8a-c01',
      items: [item({ srcId: 'phy-b8a-p012-01', pdfPage: 26 })],
    });
    expect(hasIssue(noRange, 'pdfpage-out-of-range')).toBe(false);
  });
});

// =============================================================================
// 父子
// =============================================================================

describe('validateExpectedManifest · 父子', () => {
  it('parent-missing：指向清单里没有的条目，或指向自己', () => {
    const unknown = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', parentSrcId: 'phy-b8a-p011-09' })]),
    );
    expect(hasIssue(unknown, 'parent-missing', 'error')).toBe(true);

    const self = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', parentSrcId: 'phy-b8a-p012-01' })]),
    );
    expect(hasIssue(self, 'parent-missing', 'error')).toBe(true);
  });

  it('parent-not-contained：子框超出父框，消息指出哪条边', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({
          srcId: 'phy-b8a-p012-01',
          kind: 'module',
          region: { x: 0.1, y: 0.1, width: 0.4, height: 0.3 },
        }),
        item({
          srcId: 'phy-b8a-p012-02',
          kind: 'figure',
          region: { x: 0.45, y: 0.1, width: 0.2, height: 0.1 },
          parentSrcId: 'phy-b8a-p012-01',
        }),
      ]),
    );
    const problems = matching(issues, 'parent-not-contained', 'error');
    expect(problems).toHaveLength(1);
    expect(problems[0].srcId).toBe('phy-b8a-p012-02');
    expect(problems[0].message).toContain('phy-b8a-p012-01');
    expect(problems[0].message).toContain('右超出');
    // 父子之间部分相交不该再报 overlap-undeclared
    expect(hasIssue(issues, 'overlap-undeclared')).toBe(false);
  });

  it('parent-cross-page：跨页父框的续页子条目不许填 parentSrcId', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({
          srcId: 'phy-b8a-p012-01',
          kind: 'module',
          region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
          continuesOn: 20,
          extraRegions: [{ pdfPage: 20, region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }],
        }),
        // 同页子条目合法：包含关系能在单页内证明
        item({
          srcId: 'phy-b8a-p012-02',
          region: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
          parentSrcId: 'phy-b8a-p012-01',
        }),
        // 续页子条目非法
        item({
          srcId: 'phy-b8a-p013-01',
          pdfPage: 20,
          region: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
          parentSrcId: 'phy-b8a-p012-01',
        }),
      ]),
    );
    const crossPage = matching(issues, 'parent-cross-page', 'error');
    expect(crossPage).toHaveLength(1);
    expect(crossPage[0].srcId).toBe('phy-b8a-p013-01');
    expect(crossPage[0].message).toContain('parentSrcId: null');
    expect(hasIssue(issues, 'parent-not-contained')).toBe(false);
  });
});

// =============================================================================
// overlaps
// =============================================================================

describe('validateExpectedManifest · overlaps', () => {
  it('overlaps-asymmetric：只有一边声明', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({
          srcId: 'phy-b8a-p012-01',
          region: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
          overlaps: ['phy-b8a-p012-02'],
        }),
        item({ srcId: 'phy-b8a-p012-02', region: { x: 0.4, y: 0.1, width: 0.4, height: 0.2 } }),
      ]),
    );
    expect(hasIssue(issues, 'overlaps-asymmetric', 'error')).toBe(true);
    expect(hasIssue(issues, 'overlaps-phantom')).toBe(false);
    // 只写一边时不算「双方都没声明」，未声明相交不再重复报
    expect(hasIssue(issues, 'overlap-undeclared')).toBe(false);
  });

  it('overlaps-phantom：声明了但实际不相交 / 指向不存在的条目', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({
          srcId: 'phy-b8a-p012-01',
          region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          overlaps: ['phy-b8a-p012-02', 'phy-b8a-p011-09'],
        }),
        item({
          srcId: 'phy-b8a-p012-02',
          region: { x: 0.6, y: 0.6, width: 0.2, height: 0.2 },
          overlaps: ['phy-b8a-p012-01'],
        }),
      ]),
    );
    // 两个方向各一条「声明了但不想交」，外加 01 指向清单里没有的 phy-b8a-p011-09
    const phantoms = matching(issues, 'overlaps-phantom', 'error');
    expect(phantoms).toHaveLength(3);
    expect(phantoms.some((issue) => issue.message.includes('phy-b8a-p011-09'))).toBe(true);
  });

  it('overlaps-is-containment：该用 parentSrcId 的情况只告警', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({
          srcId: 'phy-b8a-p012-01',
          region: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
          overlaps: ['phy-b8a-p012-02'],
        }),
        item({
          srcId: 'phy-b8a-p012-02',
          region: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
          overlaps: ['phy-b8a-p012-01'],
        }),
      ]),
    );
    const warnings = matching(issues, 'overlaps-is-containment', 'warning');
    expect(warnings).toHaveLength(1);
    expect(matching(issues, 'overlaps-is-containment', 'error')).toEqual([]);
  });

  it('overlap-undeclared：部分相交却双方都没写 overlaps', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({ srcId: 'phy-b8a-p012-01', region: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 } }),
        item({ srcId: 'phy-b8a-p012-02', region: { x: 0.4, y: 0.1, width: 0.4, height: 0.2 } }),
      ]),
    );
    const undeclared = matching(issues, 'overlap-undeclared', 'error');
    expect(undeclared).toHaveLength(1);
    expect(undeclared[0].message).toContain('phy-b8a-p012-01');
    expect(undeclared[0].message).toContain('phy-b8a-p012-02');

    // 跨页不比对：不同 pdfPage 的相同坐标不算相交
    const crossPage = validateExpectedManifest(
      manifestOf([
        item({ srcId: 'phy-b8a-p012-01', region: { x: 0.1, y: 0.1, width: 0.4, height: 0.2 } }),
        item({
          srcId: 'phy-b8a-p013-01',
          pdfPage: 20,
          region: { x: 0.4, y: 0.1, width: 0.4, height: 0.2 },
        }),
      ]),
    );
    expect(hasIssue(crossPage, 'overlap-undeclared')).toBe(false);
  });
});

// =============================================================================
// extraRegions / continuesOn
// =============================================================================

describe('validateExpectedManifest · 跨页', () => {
  it('extraregions-invalid：region 越界、缺 pdfPage', () => {
    const issues = validateExpectedManifest(
      manifestOf([
        item({
          srcId: 'phy-b8a-p012-01',
          continuesOn: 20,
          extraRegions: [
            { pdfPage: 20, region: { x: 0.9, y: 0.1, width: 0.3, height: 0.1 } },
            { region: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } },
          ],
        }),
      ]),
    );
    expect(matching(issues, 'extraregions-invalid', 'error')).toHaveLength(2);
  });

  it('continueson-bad：不是 pdfPage + 1 时只告警', () => {
    const issues = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', continuesOn: 22 })]),
    );
    expect(hasIssue(issues, 'continueson-bad', 'warning')).toBe(true);

    const good = validateExpectedManifest(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', continuesOn: 20 })]),
    );
    expect(hasIssue(good, 'continueson-bad')).toBe(false);
  });
});

// =============================================================================
// 统计与入参
// =============================================================================

describe('expectedManifestStats', () => {
  it('总数、kind / 页分布、坐标覆盖、overlaps 对数、parentSrcId 条数', () => {
    const stats = expectedManifestStats(validManifest());
    expect(stats).toEqual({
      total: 6,
      kinds: [
        { kind: 'figure', count: 2 },
        { kind: 'module', count: 2 },
        { kind: 'para', count: 2 },
      ],
      pages: [
        { pdfPage: 19, count: 5 },
        { pdfPage: 20, count: 1 },
      ],
      withRegion: 6,
      reasonOnly: 0,
      overlapPairs: 1,
      parentLinks: 1,
    });
  });

  it('只有 regionOmittedReason 的条目单独计数；非对象输入给零值', () => {
    const stats = expectedManifestStats(
      manifestOf([item({ srcId: 'phy-b8a-p012-01', region: undefined, regionOmittedReason: '矢量插图' })]),
    );
    expect(stats.withRegion).toBe(0);
    expect(stats.reasonOnly).toBe(1);
    expect(expectedManifestStats(null)).toEqual({
      total: 0,
      kinds: [],
      pages: [],
      withRegion: 0,
      reasonOnly: 0,
      overlapPairs: 0,
      parentLinks: 0,
    });
  });
});

describe('validateExpectedManifest · 契约', () => {
  it('不抛错、不改入参', () => {
    const manifest = validManifest();
    const snapshot = JSON.stringify(manifest);
    expect(() => validateExpectedManifest(manifest)).not.toThrow();
    expect(JSON.stringify(manifest)).toBe(snapshot);

    // 坏输入也不能抛：校验器要能跑在任意 JSON 上
    for (const broken of [null, undefined, [], { items: [null, 3, 'x'] }]) {
      expect(() => validateExpectedManifest(broken)).not.toThrow();
    }
  });
});
