import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BookPartSchema,
  coverageOf,
  mergeBookParts,
  validateBookPart,
  type BookPart,
  type EntityEntry,
  type ExpectedManifest,
  type PartAsset,
  type PartNode,
} from './book-part';
import type { BookMetaV9 } from './schema';
import { validateGraphInvariants, type ValidationIssue } from './validate';

const BOOK: BookMetaV9 = {
  subject: 'physics',
  stage: 'junior',
  title: '苏科版初中物理八年级上册',
  edition: '2024 年第 4 版',
  publisher: '江苏凤凰科学技术出版社',
  publicationYear: 2024,
  volume: '八年级上册',
};

const BRANCH_ID = 'phy-b8a';
const CHAPTER_ID = 'phy-b8a-c04';
const CHAPTER_B = 'phy-b8a-c05';
const SECTION_ID = 'phy-b8a-c04-s01';

const errorsOf = (issues: ValidationIssue[]) => issues.filter((issue) => issue.severity === 'error');

function partNode(
  id: string,
  type: PartNode['type'],
  parentId: string | null,
  extra: Partial<PartNode> = {},
): PartNode {
  return { id, type, title: extra.title ?? id, content: '', parentId, ...extra };
}

/** 合法的最小一章：章 → 节 → 实验 + 实验结论（结论是兄弟，不是实验的子节点） */
function basePart(): BookPart {
  return {
    meta: {
      volume: 'b8a',
      chapter: CHAPTER_ID,
      // 印刷 43..63 ↔ PDF 50..70，两端偏移都是 +7
      pdfPageRange: [50, 70],
      printedPageRange: ['43', '63'],
      agent: 'test-agent',
    },
    nodes: [
      partNode(BRANCH_ID, 'branch', null, { title: '八年级上册' }),
      partNode(CHAPTER_ID, 'section', BRANCH_ID, { kind: 'chapter', title: '第四章 物态变化' }),
      partNode(SECTION_ID, 'section', CHAPTER_ID, { kind: 'section', title: '一、温度' }),
      partNode('phy-b8a-p045-01', 'note', SECTION_ID, {
        kind: 'experiment',
        title: '活动 4.1 测量水温',
        content: '如图 4-1 所示。\n\n![温度计](asset://phy-b8a-p045-fig01)',
      }),
      partNode('phy-b8a-p045-02', 'proposition', SECTION_ID, {
        kind: 'claim',
        title: '液体温度计利用热胀冷缩',
      }),
    ],
    edges: [
      {
        from: 'phy-b8a-p045-01',
        to: 'phy-b8a-p045-02',
        predicate: 'supports',
        note: '原文：由实验可知',
      },
    ],
    steps: [],
    assets: [
      {
        id: 'phy-b8a-p045-fig01',
        caption: '图 4-1 用温度计测量水温',
        alt: '学生用温度计测量烧杯中水的温度',
        pdfPage: 52,
        region: { x: 0.12, y: 0.3, width: 0.7, height: 0.35 },
        nodeId: 'phy-b8a-p045-01',
      },
    ],
    exceptions: [],
  };
}

/** 资源流水线回填后的资源（§10：path / mimeType / byteLength / sha256 由裁图脚本补） */
function pipelined(asset: PartAsset): PartAsset {
  return {
    ...asset,
    path: `assets/b8a/${asset.id}.png`,
    mimeType: 'image/png',
    byteLength: 2048,
    sha256: 'f'.repeat(64),
  };
}

function pipelinedPart(): BookPart {
  const part = basePart();
  part.assets = part.assets.map(pipelined);
  return part;
}

function expectedOf(srcIds: string[]): ExpectedManifest {
  return { volume: 'b8a', chapter: CHAPTER_ID, items: srcIds.map((srcId) => ({ srcId })) };
}

const expectedManifest = () => expectedOf(['phy-b8a-p045-01', 'phy-b8a-p045-02']);

/** 第二章，用于合并测试；故意不包含 branch 节点（跨 part 的父节点由别的 part 提供） */
function secondPart(): BookPart {
  return {
    meta: {
      volume: 'b8a',
      chapter: CHAPTER_B,
      pdfPageRange: [71, 90],
      printedPageRange: ['64', '83'],
      agent: 'test-agent',
    },
    nodes: [
      partNode(CHAPTER_B, 'section', BRANCH_ID, { kind: 'chapter', title: '第五章 物体的运动' }),
      partNode('phy-b8a-c05-s01', 'section', CHAPTER_B, {
        kind: 'section',
        title: '一、长度和时间的测量',
      }),
      partNode('phy-b8a-p064-01', 'note', 'phy-b8a-c05-s01', { kind: 'experiment', title: '活动 5.1' }),
      partNode('phy-b8a-p064-02', 'proposition', 'phy-b8a-c05-s01', {
        kind: 'claim',
        title: '测量长度要看清分度值',
      }),
      partNode('phy-b8a-p064-03', 'proposition', 'phy-b8a-c05-s01', {
        kind: 'claim',
        title: '测量结果必须估读',
      }),
    ],
    edges: [
      { from: 'phy-b8a-p064-01', to: 'phy-b8a-p064-02', predicate: 'supports', note: '原文：由实验可知' },
      { from: 'phy-b8a-p064-03', to: 'phy-b8a-p064-02', predicate: 'depends-on', note: '原文：需要用到' },
    ],
    steps: [
      {
        premiseIds: ['phy-b8a-p064-02'],
        conclusionId: 'phy-b8a-p064-03',
        rule: '分度值决定估读位',
      },
    ],
    assets: [],
    exceptions: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// 结构校验
// =============================================================================

describe('validateBookPart', () => {
  it('合法最小 part 通过校验（只有等待资源流水线的 warning）', () => {
    const part = basePart();
    expect(BookPartSchema.safeParse(part).success).toBe(true);

    const issues = validateBookPart(part, expectedManifest());
    expect(errorsOf(issues)).toEqual([]);
    expect(issues.map((issue) => issue.code)).toEqual(['asset-pipeline-pending']);
    expect(issues[0].severity).toBe('warning');
  });

  it('转写侧填了合并器的字段：直接报错，并且说人话', () => {
    const base = basePart();
    base.nodes.push(
      partNode('phy-b8a-p045-03', 'proposition', SECTION_ID, { kind: 'claim', title: '另一条断言' }),
    );

    const withOrder = {
      ...base,
      nodes: base.nodes.map((node) => (node.id === 'phy-b8a-p045-01' ? { ...node, order: 2048 } : node)),
    };
    const orderIssues = validateBookPart(withOrder);
    expect(
      orderIssues.some((issue) => issue.code === 'forbidden-field' && /order 由合并器生成/.test(issue.message)),
    ).toBe(true);
    // strict schema 的 unrecognized_keys 被去重，不重复报同一件事
    expect(orderIssues.filter((issue) => issue.code === 'forbidden-field')).toHaveLength(1);
    expect(orderIssues.some((issue) => issue.code === 'unknown-field')).toBe(false);

    const withEdgeId = { ...base, edges: base.edges.map((edge) => ({ ...edge, id: 'e1' })) };
    expect(
      validateBookPart(withEdgeId).some((issue) => /关系 id 由合并器生成/.test(issue.message)),
    ).toBe(true);

    const withStepId = {
      ...base,
      steps: [
        {
          id: 'phy-b8a-c04-i001',
          premiseIds: ['phy-b8a-p045-02'],
          conclusionId: 'phy-b8a-p045-03',
          rule: '热胀冷缩',
        },
      ],
    };
    expect(
      validateBookPart(withStepId).some((issue) => /推理步骤 id 由合并器生成/.test(issue.message)),
    ).toBe(true);

    const withAssertedBy = {
      ...base,
      edges: base.edges.map((edge) => ({ ...edge, assertedBy: 'manual' })),
    };
    expect(
      validateBookPart(withAssertedBy).some((issue) => /assertedBy 由合并器统一填 import/.test(issue.message)),
    ).toBe(true);

    const withTimestamp = {
      ...base,
      nodes: base.nodes.map((node) => ({ ...node, updatedAt: 1 })),
    };
    expect(
      validateBookPart(withTimestamp).some((issue) => /updatedAt 由合并器生成/.test(issue.message)),
    ).toBe(true);
  });

  it('proposition 挂在 note 下：复用 allowedChildTypes 报父子类型错误', () => {
    const part = basePart();
    part.nodes.push(
      partNode('phy-b8a-p045-03', 'proposition', 'phy-b8a-p045-01', {
        kind: 'claim',
        title: '挂在实验下的命题',
      }),
    );

    const issues = validateBookPart(part);
    expect(
      issues.some(
        (issue) => issue.code === 'invalid-child-type' && /「笔记」下不能放「命题」/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('supports 起点不是实验/现象：报错误', () => {
    const part = basePart();
    part.nodes = part.nodes.map((node) =>
      node.id === 'phy-b8a-p045-01' ? { ...node, kind: 'explanation' } : node,
    );

    const issues = validateBookPart(part);
    expect(
      issues.some(
        (issue) => issue.code === 'invalid-endpoint-type' && /起点必须是实验或现象笔记/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('depends-on 成环：报错误', () => {
    const part = basePart();
    part.nodes.push(
      partNode('phy-b8a-p046-01', 'proposition', SECTION_ID, { kind: 'claim', title: '断言乙' }),
    );
    part.edges.push({ from: 'phy-b8a-p045-02', to: 'phy-b8a-p046-01', predicate: 'depends-on' });
    part.edges.push({ from: 'phy-b8a-p046-01', to: 'phy-b8a-p045-02', predicate: 'depends-on' });

    expect(validateBookPart(part).some((issue) => issue.code === 'prerequisite-cycle')).toBe(true);
  });

  it('§7 白名单之外的谓词直接报错', () => {
    const part = basePart();
    part.nodes.push(
      partNode('phy-b8a-p046-01', 'proposition', SECTION_ID, { kind: 'claim', title: '断言乙' }),
    );
    part.edges.push({ from: 'phy-b8a-p045-02', to: 'phy-b8a-p046-01', predicate: 'implies' });

    expect(validateBookPart(part).some((issue) => issue.code === 'predicate-not-allowed')).toBe(true);
  });

  it('asset:// 引用不存在的资源报错，未被引用的资源只告警', () => {
    const missingAsset = basePart();
    missingAsset.assets = [];
    const missingIssues = validateBookPart(missingAsset);
    expect(
      missingIssues.some(
        (issue) => issue.severity === 'error' && issue.code === 'missing-asset' && /phy-b8a-p045-fig01/.test(issue.message),
      ),
    ).toBe(true);

    const unusedAsset = basePart();
    unusedAsset.assets.push({
      id: 'phy-b8a-p045-fig02',
      alt: '没人引用的图',
      pdfPage: 53,
      region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      nodeId: 'phy-b8a-p045-02',
    });
    const unusedIssues = validateBookPart(unusedAsset);
    expect(
      unusedIssues.some(
        (issue) =>
          issue.severity === 'warning' && issue.code === 'unused-asset' && /phy-b8a-p045-fig02/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('region 与 regionOmittedReason 恰好二选一', () => {
    const both = basePart();
    both.assets = both.assets.map((asset) => ({
      ...asset,
      regionOmittedReason: '矢量插图，视觉模型无法给出可靠 bbox',
    }));
    expect(BookPartSchema.safeParse(both).success).toBe(false);
    expect(
      validateBookPart(both).some(
        (issue) => issue.severity === 'error' && /只能填一个/.test(issue.message),
      ),
    ).toBe(true);

    const neither = basePart();
    neither.assets = neither.assets.map((asset) => ({
      ...asset,
      region: undefined,
      regionOmittedReason: null,
    }));
    expect(BookPartSchema.safeParse(neither).success).toBe(false);
    expect(
      validateBookPart(neither).some(
        (issue) => issue.severity === 'error' && /必须填 region 或 regionOmittedReason/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('region 越界复用共享的坐标规则（不在本模块另写一套）', () => {
    const part = basePart();
    part.assets = part.assets.map((asset) => ({
      ...asset,
      region: { x: 0.9, y: 0.1, width: 0.5, height: 0.1 },
    }));

    expect(validateBookPart(part).some((issue) => /超出页面右边界/.test(issue.message))).toBe(true);
  });

  it('assets[].pdfPage 必须落在 meta.pdfPageRange 内', () => {
    const part = basePart();
    part.assets = part.assets.map((asset) => ({ ...asset, pdfPage: 999 }));

    const issues = validateBookPart(part);
    expect(
      issues.some(
        (issue) => issue.code === 'asset-page-outside-range' && /999/.test(issue.message),
      ),
    ).toBe(true);
  });

  it('ID 命名：内容节点不能借结构 ID，章节节点不能借页码 ID', () => {
    const contentWithStructuralId = basePart();
    contentWithStructuralId.nodes = contentWithStructuralId.nodes.map((node) =>
      node.id === 'phy-b8a-p045-02' ? { ...node, id: 'phy-b8a-c04-s02' } : node,
    );
    expect(
      validateBookPart(contentWithStructuralId).some(
        (issue) => issue.code === 'id-wrong-system' && /必须用页码 ID/.test(issue.message),
      ),
    ).toBe(true);

    const chapterWithPageId = basePart();
    chapterWithPageId.nodes = chapterWithPageId.nodes.map((node) =>
      node.id === CHAPTER_ID ? { ...node, id: 'phy-b8a-p043-01' } : node,
    );
    expect(
      validateBookPart(chapterWithPageId).some(
        (issue) => issue.code === 'id-wrong-system' && /必须用结构 ID/.test(issue.message),
      ),
    ).toBe(true);

    const oddId = basePart();
    oddId.nodes.push(
      partNode('p045-extra', 'note', SECTION_ID, { kind: 'explanation', title: '历史数据' }),
    );
    const oddIssues = validateBookPart(oddId);
    expect(
      oddIssues.some((issue) => issue.code === 'id-format' && issue.severity === 'warning'),
    ).toBe(true);
  });

  it('父节点在本 part 之外：结构 ID 靠 ID 推类型，照样校验父子类型', () => {
    const withoutChapter = basePart();
    withoutChapter.nodes = withoutChapter.nodes.filter((node) => node.id !== CHAPTER_ID);
    expect(errorsOf(validateBookPart(withoutChapter))).toEqual([]);

    const propositionUnderBranch = basePart();
    propositionUnderBranch.nodes = propositionUnderBranch.nodes
      .filter((node) => node.id !== CHAPTER_ID)
      .map((node) => (node.id === 'phy-b8a-p045-02' ? { ...node, parentId: BRANCH_ID } : node));
    expect(
      errorsOf(validateBookPart(propositionUnderBranch)).some(
        (issue) => issue.code === 'invalid-child-type',
      ),
    ).toBe(true);
  });
});

// =============================================================================
// depends-on 的质量检查（§7）
// =============================================================================

describe('depends-on 质量检查', () => {
  /** 合格依据：带引号抄原句，长度也够 */
  const GOOD_NOTE =
    '原句：「液体温度计利用热胀冷缩」，逐字用前文定义的「热胀冷缩」，离开它这句不成立。';
  const OTHER_SECTION_ID = 'phy-b8a-c04-s02';

  /** 往同一小节里塞 n 个节点，各自 depends-on 指向 phy-b8a-p045-02 */
  function hubPart(n: number): BookPart {
    const part = basePart();
    part.edges = [];
    for (let i = 1; i <= n; i += 1) {
      const id = `phy-b8a-p047-0${i}`;
      part.nodes.push(partNode(id, 'proposition', SECTION_ID, { kind: 'claim', title: `断言${i}` }));
      part.edges.push({ from: id, to: 'phy-b8a-p045-02', predicate: 'depends-on', note: GOOD_NOTE });
    }
    return part;
  }

  describe('depends-on-hub', () => {
    it('同一个目标被 4 条依赖指向：报 warning，带上标题和条数', () => {
      const hubs = validateBookPart(hubPart(4)).filter((issue) => issue.code === 'depends-on-hub');

      expect(hubs).toHaveLength(1);
      expect(hubs[0].severity).toBe('warning');
      expect(hubs[0].message).toContain('液体温度计利用热胀冷缩');
      expect(hubs[0].message).toContain('4 条');
      expect(hubs[0].message).toContain('主题词');
    });

    it('只被 3 条依赖指向：不报', () => {
      const hubs = validateBookPart(hubPart(3)).filter((issue) => issue.code === 'depends-on-hub');

      expect(hubs).toEqual([]);
    });
  });

  describe('depends-on-same-subsection', () => {
    it('两端在同一小节内：报 warning', () => {
      const part = basePart();
      part.edges = [
        { from: 'phy-b8a-p045-02', to: 'phy-b8a-p045-01', predicate: 'depends-on', note: GOOD_NOTE },
      ];

      const sameSection = validateBookPart(part).filter(
        (issue) => issue.code === 'depends-on-same-subsection',
      );
      expect(sameSection).toHaveLength(1);
      expect(sameSection[0].severity).toBe('warning');
      expect(sameSection[0].message).toContain('一、温度');
      expect(sameSection[0].message).toContain('兄弟节点');
    });

    it('两端跨小节：不报', () => {
      const part = basePart();
      part.nodes.push(
        partNode(OTHER_SECTION_ID, 'section', CHAPTER_ID, { kind: 'section', title: '二、熔化' }),
        partNode('phy-b8a-p053-01', 'definition', OTHER_SECTION_ID, { title: '熔化的定义' }),
      );
      part.edges = [
        { from: 'phy-b8a-p045-02', to: 'phy-b8a-p053-01', predicate: 'depends-on', note: GOOD_NOTE },
      ];

      const issues = validateBookPart(part).filter(
        (issue) => issue.code === 'depends-on-same-subsection',
      );
      expect(issues).toEqual([]);
    });
  });

  describe('depends-on-weak-evidence', () => {
    it('note 为空：报 warning，要求抄原句', () => {
      const part = basePart();
      part.edges = [{ from: 'phy-b8a-p045-02', to: 'phy-b8a-p045-01', predicate: 'depends-on' }];

      const weak = validateBookPart(part).filter(
        (issue) => issue.code === 'depends-on-weak-evidence',
      );
      expect(weak).toHaveLength(1);
      expect(weak[0].severity).toBe('warning');
      expect(weak[0].message).toContain('note 是空的');
      expect(weak[0].message).toContain('depends-on 必须把依据原句抄进 note');
    });

    it('note 太短或没有引号引出的原句：都报', () => {
      const shortNote = basePart();
      shortNote.edges = [
        { from: 'phy-b8a-p045-02', to: 'phy-b8a-p045-01', predicate: 'depends-on', note: '原句：「热胀冷缩」' },
      ];
      expect(
        validateBookPart(shortNote)
          .filter((issue) => issue.code === 'depends-on-weak-evidence')
          .some((issue) => issue.message.includes('不足')),
      ).toBe(true);

      const noQuote = basePart();
      noQuote.edges = [
        {
          from: 'phy-b8a-p045-02',
          to: 'phy-b8a-p045-01',
          predicate: 'depends-on',
          note: '液体温度计利用热胀冷缩，这里只是提到前文定义，没有抄原句。',
        },
      ];
      expect(
        validateBookPart(noQuote)
          .filter((issue) => issue.code === 'depends-on-weak-evidence')
          .some((issue) => issue.message.includes('没有引号引出的原句')),
      ).toBe(true);
    });

    it('note 带引号且够长：不报', () => {
      const part = basePart();
      part.edges = [
        { from: 'phy-b8a-p045-02', to: 'phy-b8a-p045-01', predicate: 'depends-on', note: GOOD_NOTE },
      ];

      const weak = validateBookPart(part).filter(
        (issue) => issue.code === 'depends-on-weak-evidence',
      );
      expect(weak).toEqual([]);
    });
  });
});

// =============================================================================
// 覆盖率（§0.3）
// =============================================================================

describe('coverageOf', () => {
  it('清单 5 条：映射 3、例外 1、遗漏 1', () => {
    const part = basePart();
    part.nodes.push(
      partNode('phy-b8a-p045-03', 'note', SECTION_ID, { kind: 'explanation', title: '第三段' }),
    );
    part.exceptions = [
      {
        srcId: 'phy-b8a-p045-04',
        reason: '原书该条与上一条合排，已并入 phy-b8a-p045-03',
        originalText: '不用温度计也能判断冷热吗？',
      },
    ];

    const manifest = expectedOf([
      'phy-b8a-p045-01',
      'phy-b8a-p045-02',
      'phy-b8a-p045-03',
      'phy-b8a-p045-04',
      'phy-b8a-p045-05',
    ]);

    const coverage = coverageOf(part, manifest);
    expect(coverage).toEqual({
      total: 5,
      mapped: 3,
      exception: 1,
      missing: 1,
      duplicate: 0,
      undecided: 0,
      missingSrcIds: ['phy-b8a-p045-05'],
    });
    // 结构覆盖率由调用方算：分子只算 mapped + exception
    expect((coverage.mapped + coverage.exception) / coverage.total).toBe(0.8);

    const issues = validateBookPart(part, manifest);
    expect(issues.some((issue) => issue.code === 'missing-srcid' && issue.severity === 'error')).toBe(true);
    expect(issues.some((issue) => issue.code === 'undecided-srcid')).toBe(false);
  });

  it('拆分、tags 吞并、重复映射、无法判定分别计数', () => {
    const part = basePart();
    // 同一个 srcId 拆成两个节点（@1 / @2）算已映射
    part.nodes.push(
      partNode('phy-b8a-p045-03@1', 'note', SECTION_ID, {
        kind: 'explanation',
        title: '拆分 1',
        tags: ['src:phy-b8a-p045-03'],
      }),
      partNode('phy-b8a-p045-03@2', 'note', SECTION_ID, {
        kind: 'explanation',
        title: '拆分 2',
        tags: ['src:phy-b8a-p045-03'],
      }),
      // 一个 note 吞并了后面的条目：id 登记第一条，其余写进 tags
      partNode('phy-b8a-p045-04', 'note', SECTION_ID, {
        kind: 'explanation',
        title: '吞并两条',
        tags: ['src:phy-b8a-p045-05'],
      }),
      // 两个互不相关的节点都声称同一个 srcId
      partNode('phy-b8a-p045-06', 'note', SECTION_ID, {
        kind: 'explanation',
        title: '重复甲',
        tags: ['src:phy-b8a-p045-07'],
      }),
      partNode('phy-b8a-p045-08', 'note', SECTION_ID, {
        kind: 'explanation',
        title: '重复乙',
        tags: ['src:phy-b8a-p045-07'],
      }),
    );
    // 登记了例外但没写理由 → 无法判定
    part.exceptions = [{ srcId: 'phy-b8a-p045-09', reason: '  ' }];

    const manifest = expectedOf([
      'phy-b8a-p045-01',
      'phy-b8a-p045-02',
      'phy-b8a-p045-03',
      'phy-b8a-p045-05',
      'phy-b8a-p045-07',
      'phy-b8a-p045-09',
    ]);

    expect(coverageOf(part, manifest)).toEqual({
      total: 6,
      mapped: 4,
      exception: 0,
      missing: 0,
      duplicate: 1,
      undecided: 1,
      missingSrcIds: [],
    });

    const issues = validateBookPart(part, manifest);
    expect(issues.some((issue) => issue.code === 'duplicate-srcid' && issue.severity === 'error')).toBe(true);
    expect(issues.some((issue) => issue.code === 'undecided-srcid' && issue.severity === 'warning')).toBe(true);
  });
});

// =============================================================================
// 合并
// =============================================================================

describe('mergeBookParts', () => {
  it('order 是 1024 递增，边/步骤 id 按全局序号生成', () => {
    // 故意把第二章放在前面，合并顺序只认 meta
    const merged = mergeBookParts([secondPart(), pipelinedPart()], BOOK);
    const orders = new Map(merged.graph.nodes.map((node) => [node.id, node.order]));

    expect(orders.get(BRANCH_ID)).toBe(1024);
    expect(orders.get(CHAPTER_ID)).toBe(1024);
    // 同一个父节点（branch）下接着排，不撞号
    expect(orders.get(CHAPTER_B)).toBe(2048);
    expect(orders.get('phy-b8a-p045-01')).toBe(1024);
    expect(orders.get('phy-b8a-p045-02')).toBe(2048);
    expect(orders.get('phy-b8a-p064-03')).toBe(3072);

    expect(merged.graph.edges.map((edge) => edge.id)).toEqual([
      'phy-b8a-c04-e001',
      'phy-b8a-c05-e002',
      'phy-b8a-c05-e003',
    ]);
    expect(merged.graph.steps?.map((step) => step.id)).toEqual(['phy-b8a-c05-i001']);
    expect(merged.graph.steps?.[0]?.assertedBy).toBe('import');
    expect(merged.graph.edges.every((edge) => edge.assertedBy === 'import')).toBe(true);
    expect(merged.graph.nodes.every((node) => node.createdAt === node.updatedAt)).toBe(true);
    expect(merged.graph.schemaVersion).toBe(9);
    expect(merged.graph.nodes.filter((node) => node.id === BRANCH_ID)).toHaveLength(1);

    // 合并结果必须是合法 v9：父子类型、关系端点、asset 闭合、anchor 都能过校验
    expect(validateGraphInvariants(merged.graph)).toEqual([]);
  });

  it('assets 转成 AssetMeta，带 region 的生成一条 anchor（pageLabel 是印刷页码）', () => {
    const merged = mergeBookParts([pipelinedPart()], BOOK);

    expect(merged.graph.assets).toEqual([
      {
        id: 'phy-b8a-p045-fig01',
        path: 'assets/b8a/phy-b8a-p045-fig01.png',
        mimeType: 'image/png',
        byteLength: 2048,
        sha256: 'f'.repeat(64),
        alt: '学生用温度计测量烧杯中水的温度',
        caption: '图 4-1 用温度计测量水温',
      },
    ]);
    expect(merged.graph.anchors).toEqual([
      {
        id: 'phy-b8a-p045-fig01-anchor',
        nodeId: 'phy-b8a-p045-01',
        sourceId: 'b8a',
        pageLabel: '45', // pdfPage 52 - 偏移 7
        region: { x: 0.12, y: 0.3, width: 0.7, height: 0.35 },
      },
    ]);
  });

  it('region 缺失的资源不产 anchor，但资源本身照样进图', () => {
    const part = pipelinedPart();
    part.assets = part.assets.map((asset) => ({
      ...asset,
      region: undefined,
      regionOmittedReason: '矢量插图，视觉模型无法给出可靠 bbox',
    }));

    const merged = mergeBookParts([part], BOOK);
    expect(merged.graph.anchors).toEqual([]);
    expect(merged.graph.assets).toHaveLength(1);
  });

  it('印刷页码换算不了就留空串，不猜', () => {
    const unparsable = pipelinedPart();
    unparsable.meta.printedPageRange = ['目录', '正文'];
    expect(mergeBookParts([unparsable], BOOK).graph.anchors[0].pageLabel).toBe('');

    const inconsistent = pipelinedPart();
    // 两端减出来的偏移不一致（13 vs 14），说明页码区间记错了
    inconsistent.meta.pdfPageRange = [14, 32];
    inconsistent.meta.printedPageRange = ['1', '18'];
    expect(mergeBookParts([inconsistent], BOOK).graph.anchors[0].pageLabel).toBe('');

    // manifest 明确给出 pageOffset 时以它为准（§0.2.1 的正规换算入口）
    expect(mergeBookParts([inconsistent], BOOK, { pageOffset: 7 }).graph.anchors[0].pageLabel).toBe(
      '45',
    );
  });

  it('节点 id 跨 part 重复：直接抛错并指出两个来源 part', () => {
    const clash = secondPart();
    clash.nodes.push(
      partNode('phy-b8a-p045-01', 'note', 'phy-b8a-c05-s01', { kind: 'explanation', title: '撞号' }),
    );

    expect(() => mergeBookParts([pipelinedPart(), clash], BOOK)).toThrowError(
      /节点 id 冲突：phy-b8a-p045-01 同时出现在 phy-b8a-c04 与 phy-b8a-c05/,
    );

    const duplicated = pipelinedPart();
    duplicated.nodes.push({ ...duplicated.nodes[duplicated.nodes.length - 1] });
    expect(() => mergeBookParts([duplicated], BOOK)).toThrowError(/的 part 内重复出现/);
  });

  it('资源还缺流水线字段：合并直接抛错，不产出带空 sha256 的图', () => {
    expect(() => mergeBookParts([basePart()], BOOK)).toThrowError(/缺少资源流水线字段/);
  });

  it('实体注册表：同一个 key 已登记时只告警，不覆盖原有条目', () => {
    const part = pipelinedPart();
    part.nodes = part.nodes.map((node) =>
      node.id === 'phy-b8a-p045-02'
        ? { ...node, key: 'thermometer', aliases: ['温度计'] }
        : node,
    );
    const existing: EntityEntry = {
      id: 'phy-b8b-p032-01',
      key: 'thermometer',
      title: '温度计',
      aliases: ['温度计'],
      firstSeen: 'phy-b8b-c10-s01',
    };

    const merged = mergeBookParts([part], BOOK, { entities: [existing] });
    expect(merged.entities).toEqual([existing]);
    expect(merged.warnings.map((warning) => warning.code)).toEqual(['duplicate-entity']);
    expect(merged.warnings[0].message).toMatch(/疑似重复建节点/);
  });

  it('实体注册表：新 key 被登记，firstSeen 指向最近的结构节点', () => {
    const part = pipelinedPart();
    part.nodes = part.nodes.map((node) =>
      node.id === 'phy-b8a-p045-02' ? { ...node, key: 'temperature', aliases: ['温度'] } : node,
    );

    const merged = mergeBookParts([part], BOOK);
    expect(merged.entities).toEqual([
      {
        id: 'phy-b8a-p045-02',
        key: 'temperature',
        title: '液体温度计利用热胀冷缩',
        aliases: ['温度'],
        firstSeen: SECTION_ID,
      },
    ]);
    expect(merged.warnings).toEqual([]);
  });

  it('确定性：同一批 part 合并两次逐字节一致，输入顺序打乱也不影响', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const parts = [pipelinedPart(), secondPart()];

    const first = mergeBookParts(parts, BOOK);
    const second = mergeBookParts([...parts].reverse(), BOOK);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.graph.exportedAt).toBe(1_700_000_000_000);
    expect(first.graph.nodes.every((node) => node.createdAt === 1_700_000_000_000)).toBe(true);

    // 换一个时钟，只有时间戳变，结构不变
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const later = mergeBookParts(parts, BOOK);
    expect(later.graph.nodes.map((node) => node.id)).toEqual(first.graph.nodes.map((node) => node.id));
    expect(later.graph.edges.map((edge) => edge.id)).toEqual(first.graph.edges.map((edge) => edge.id));
    expect(later.graph.anchors).toEqual(first.graph.anchors);
  });
});
