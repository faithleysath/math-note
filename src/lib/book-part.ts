/**
 * 分章中间格式（book part）与合并器。
 *
 * 职责边界见 `docs/plans/transcribe-spec.md` §10（字段归属）：
 * - Pass 2 只填内容字段（id / type / kind / title / content / solution / parentId /
 *   key / aliases / tags / citation），本模块用 `BookPartSchema` 把它钉死；
 * - `order`、`createdAt`、`updatedAt`、`edges[].id`、`steps[].id`、`assertedBy` 由合并器生成，
 *   转写侧填了就是错误（错误信息要说人话，不能只丢一句 zod unrecognized_keys）；
 * - `assets[].path / sha256 / byteLength / mimeType` 由资源流水线回填，合并时必须有，
 *   注意 §10 只说了「Pass 2 不填」，没说「不许出现」。
 *
 * 三条硬要求：
 * 1. 节点字段**不另抄一份**：`partNodeSchema` 就是 v8 `nodeSchema` 去掉合并器字段。
 * 2. 图不变式**不另写一套**：把 part 补成 v8 形状后调 `validateGraphInvariants`，
 *    父子类型、关系端点、`supports` 起点、`depends-on` 无环全部复用。
 * 3. 合并**确定**：同样的 part 数组 + 同样的时钟输入，产出逐字节一致
 *    （`exportedAt` / 时间戳本身就来自同一个时钟读数）。数组顺序只依赖
 *    `meta.volume` → `meta.chapter` → part 内位置，不依赖对象 key 顺序、不依赖随机数。
 */

import { z, type ZodIssue } from 'zod';
import { assetMetaIssues, collectAssetReferences } from './assets';
import { REGION_EPS, regionProblem } from './coords';
import {
  ASSET_SHA256_RE,
  graphJSONSchema,
  sourceAnchorSchema,
  type AssetMeta,
  type BookMetaV9,
  type Edge,
  type GraphJSONV9,
  type InferenceStep,
  type Node,
  type SourceAnchor,
} from './schema';
import { validateGraphInvariants, type ValidationIssue } from './validate';
import { canonicalizePair } from './predicates';

// =============================================================================
// 分章中间格式（§10）
// =============================================================================

// schema.ts 只导出整图 schema，这里取元素复用，**不重抄字段定义**。
const v8NodeSchema = graphJSONSchema.shape.nodes.element;
const v8EdgeSchema = graphJSONSchema.shape.edges.element;
const v8StepSchema = graphJSONSchema.shape.steps.unwrap().element;

/**
 * 分章节点：v8 节点去掉合并器负责的字段。
 *
 * `attempt` 也一起去掉：整书转写不建 attempt 节点（§4.1 红线），
 * 它也不在 §10 的 Pass 2 字段清单里。
 */
const partNodeSchema = v8NodeSchema.omit({
  order: true,
  createdAt: true,
  updatedAt: true,
  attempt: true,
});

/** 分章关系：边 id / 断言来源 / 时间戳由合并器生成 */
const partEdgeSchema = v8EdgeSchema.omit({
  id: true,
  assertedBy: true,
  createdAt: true,
  updatedAt: true,
});

/** 分章推理步骤：同上 */
const partStepSchema = v8StepSchema.omit({
  id: true,
  assertedBy: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * 分章资源。
 *
 * 坐标规则直接复用 `sourceAnchorSchema` 里的 region 定义（含 §0.2 的容差 refine），
 * 不允许这里再写一套坐标校验。
 */
export const partAssetSchema = z
  .strictObject({
    id: z.string().min(1),
    /** 图注原文；原书没有图注就不填，不要填空串（§5） */
    caption: z.string().min(1).optional(),
    alt: z.string(),
    /** PDF 物理页序，1-based（§0.2.1） */
    pdfPage: z.number().int().min(1),
    region: sourceAnchorSchema.shape.region,
    regionOmittedReason: z.string().min(1).nullish(),
    nodeId: z.string().min(1),
    // ---- 以下由资源流水线回填（§10），Pass 2 不填 ----
    path: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    byteLength: z.number().int().positive().optional(),
    sha256: z.string().regex(ASSET_SHA256_RE).optional(),
  })
  .superRefine((asset, ctx) => {
    const hasRegion = asset.region !== undefined;
    const hasReason = asset.regionOmittedReason !== undefined && asset.regionOmittedReason !== null;
    if (hasRegion && hasReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['regionOmittedReason'],
        message:
          'region 与 regionOmittedReason 只能填一个：坐标已知就填 region，坐标不确定就写 regionOmittedReason。',
      });
    }
    if (!hasRegion && !hasReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['region'],
        message:
          '必须填 region 或 regionOmittedReason 之一：坐标不确定时写清原因（如「矢量插图，视觉模型无法给出可靠 bbox」），不要用零值或整页框假装定位完成（§0.2.2）。',
      });
    }
  });

/** 例外清单。`reason` 留空等于没写理由，覆盖率里按「无法判定」计（§0.3）。 */
const partExceptionSchema = z.strictObject({
  srcId: z.string().min(1).optional(),
  reason: z.string(),
  originalText: z.string().optional(),
});

const partMetaSchema = z
  .strictObject({
    /** 'b8a' | 'b8b' | 'b9a' | 'b9b' */
    volume: z.string().min(1),
    /** 章节点 id，如 phy-b8a-c04；一章一份 part */
    chapter: z.string().min(1),
    pdfPageRange: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    printedPageRange: z.tuple([z.string().min(1), z.string().min(1)]),
    agent: z.string().min(1),
  })
  .refine((meta) => meta.pdfPageRange[0] <= meta.pdfPageRange[1], {
    message: 'meta.pdfPageRange 的起点不能大于终点。',
    path: ['pdfPageRange'],
  });

/**
 * 分章中间格式。不是 v9 `GraphJSON`：没有 order / 时间戳 / 边与步骤 id / assertedBy /
 * anchors / assets 的媒体元信息。
 */
export const BookPartSchema = z.strictObject({
  meta: partMetaSchema,
  nodes: z.array(partNodeSchema),
  edges: z.array(partEdgeSchema),
  steps: z.array(partStepSchema),
  assets: z.array(partAssetSchema),
  exceptions: z.array(partExceptionSchema),
});

export type PartMeta = z.infer<typeof partMetaSchema>;
export type PartNode = z.infer<typeof partNodeSchema>;
export type PartEdge = z.infer<typeof partEdgeSchema>;
export type PartStep = z.infer<typeof partStepSchema>;
export type PartAsset = z.infer<typeof partAssetSchema>;
export type PartException = z.infer<typeof partExceptionSchema>;
export type BookPart = z.infer<typeof BookPartSchema>;

// =============================================================================
// Pass 1 清单（expected）与实体注册表
// =============================================================================

/** Pass 1 冻结清单里本模块用得到的部分；其余字段（kind / region / text…）不参与机械校验 */
export interface ExpectedItem {
  srcId: string;
  kind?: string;
  pdfPage?: number;
  text?: string;
  /** 嵌套：本条目属于哪个容器条目（规约 §3.1）。父子 bbox 必须完全包含 */
  parentSrcId?: string | null;
  /** 部分相交的对方 srcId（规约 §3.1）；相交必须双方声明 */
  overlaps?: string[];
  region?: { x: number; y: number; width: number; height: number };
  regionOmittedReason?: string;
  /** 跨页内容在后续页上的区域（规约 §3.1） */
  extraRegions?: { pdfPage: number; region: { x: number; y: number; width: number; height: number } }[];
  /** 印刷图注直接压在图上、裁不掉（规约 §3.1）：Pass 2 不写 caption，避免与 figcaption 重复 */
  captionOnImage?: boolean;
  originalNumber?: string | null;
  continuesOn?: number | null;
}

/** Pass 1 冻结清单，存放在 local-textbook/sukey/expected/<册>-<章>.json（§3.2） */
export interface ExpectedManifest {
  volume?: string;
  chapter?: string;
  /** 本章覆盖的 PDF 物理页区间 [起, 止]（闭区间）；只有清单校验器会用到 */
  pdfPageRange?: [number, number];
  items: ExpectedItem[];
}

/** 跨册实体注册表条目（§9） */
export interface EntityEntry {
  id: string;
  key: string;
  title: string;
  aliases: string[];
  firstSeen: string;
}

// =============================================================================
// ID 规约（§2）
// =============================================================================

export type IdFamily =
  | 'branch'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'content'
  | 'asset'
  | 'edge'
  | 'step'
  | 'unknown';

/** 从最具体到最宽，顺序不能乱 */
const ID_PATTERNS: ReadonlyArray<readonly [IdFamily, RegExp]> = [
  ['step', /^phy-[a-z0-9]+-c\d{2}-i\d{3}$/],
  ['edge', /^phy-[a-z0-9]+-c\d{2}-e\d{3}$/],
  ['asset', /^phy-[a-z0-9]+-p\d{3,4}-fig\d{2}$/],
  ['subsection', /^phy-[a-z0-9]+-c\d{2}-s\d{2}-ss\d{2}$/],
  ['section', /^phy-[a-z0-9]+-c\d{2}-s\d{2}$/],
  ['chapter', /^phy-[a-z0-9]+-c\d{2}$/],
  ['content', /^phy-[a-z0-9]+-p\d{3,4}-\d{2}(@\d+)?$/],
  ['branch', /^phy-[a-z0-9]+$/],
];

const STRUCTURAL_FAMILIES: ReadonlySet<IdFamily> = new Set<IdFamily>([
  'branch',
  'chapter',
  'section',
  'subsection',
]);

/** §2 的 ID 家族；认不出来返回 'unknown'（历史数据兼容，只报警告） */
export function idFamilyOf(id: string): IdFamily {
  for (const [family, pattern] of ID_PATTERNS) {
    if (pattern.test(id)) return family;
  }
  return 'unknown';
}

function volumeOfId(id: string): string | null {
  return /^phy-([a-z0-9]+)(?:-|$)/.exec(id)?.[1] ?? null;
}

/** 跨 part 的父节点若是结构 ID，可以只靠 ID 推断类型，从而真的校验父子类型 */
function structuralStubType(id: string): 'branch' | 'section' | null {
  const family = idFamilyOf(id);
  if (family === 'branch') return 'branch';
  if (family === 'chapter' || family === 'section' || family === 'subsection') return 'section';
  return null;
}

function structuralParentId(id: string): string | null {
  // 册分支是树的根（phy-b8a 的父就是 null），不能按 lastIndexOf('-') 截成 'phy'
  if (idFamilyOf(id) === 'branch') return null;
  if (structuralStubType(id) === null) return null;
  const cut = id.lastIndexOf('-');
  return cut > 0 ? id.slice(0, cut) : null;
}

function expectedFamiliesOf(node: PartNode): IdFamily[] {
  if (node.type === 'branch') return ['branch'];
  if (node.type === 'section') return node.kind === 'chapter' ? ['chapter'] : ['section', 'subsection'];
  return ['content'];
}

function isStructuralNode(node: PartNode): boolean {
  return node.type === 'branch' || node.type === 'section';
}

// =============================================================================
// 校验：越权字段
// =============================================================================

const TIMESTAMP_FIELDS = [
  ['createdAt', 'createdAt 由合并器生成，转写侧不得填写。'],
  ['updatedAt', 'updatedAt 由合并器生成，转写侧不得填写。'],
] as const;

const ASSERTED_BY_FIELD = ['assertedBy', 'assertedBy 由合并器统一填 import，转写侧不得填写。'] as const;

const NODE_FORBIDDEN_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['order', 'order 由合并器生成，转写侧不得填写。'],
  ...TIMESTAMP_FIELDS,
  ASSERTED_BY_FIELD,
];

const EDGE_FORBIDDEN_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['id', '关系 id 由合并器生成（<章id>-e<三位序号>），转写侧不得填写。'],
  ...TIMESTAMP_FIELDS,
  ASSERTED_BY_FIELD,
];

const STEP_FORBIDDEN_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['id', '推理步骤 id 由合并器生成（<章id>-i<三位序号>），转写侧不得填写。'],
  ...TIMESTAMP_FIELDS,
  ASSERTED_BY_FIELD,
];

const FORBIDDEN_LISTS = [
  ['nodes', NODE_FORBIDDEN_FIELDS],
  ['edges', EDGE_FORBIDDEN_FIELDS],
  ['steps', STEP_FORBIDDEN_FIELDS],
] as const;

/**
 * 越权字段的先行扫描。
 *
 * strict schema 也会拦，但只会说「Unrecognized key」，操作者不知道字段归谁。
 * 这里先说人话，zod 的同一条错误在合并时去重。
 */
function forbiddenFieldIssues(part: unknown): ValidationIssue[] {
  if (typeof part !== 'object' || part === null) return [];
  const source = part as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const [listName, fields] of FORBIDDEN_LISTS) {
    const list = source[listName];
    if (!Array.isArray(list)) continue;
    list.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) return;
      for (const [field, message] of fields) {
        if (!(field in item)) continue;
        issues.push({
          severity: 'error',
          code: 'forbidden-field',
          message: `${message}（出现在 ${listName}[${index}]）`,
          field: `${listName}.${index}.${field}`,
        });
      }
    });
  }

  return issues;
}

// =============================================================================
// 校验：zod 错误 → 人话
// =============================================================================

function schemaIssueOf(issue: ZodIssue, reported: ReadonlySet<string>): ValidationIssue | null {
  const path = issue.path.map((segment) => String(segment));
  const field = path.length > 0 ? path.join('.') : undefined;

  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys.filter((key) => !reported.has([...path, key].join('.')));
    if (keys.length === 0) return null;
    return {
      severity: 'error',
      code: 'unknown-field',
      message: `${field ?? '（根）'} 出现不允许的字段：${keys.join('、')}。字段归属见规约 §10：order / 时间戳 / assertedBy / 边与步骤的 id 由合并器生成，Pass 2 不得填写。`,
      field,
    };
  }

  if (issue.code === 'invalid_type') {
    return {
      severity: 'error',
      code: 'invalid-part',
      message: `${field ?? '（根）'} 缺失或类型不对：${issue.message}`,
      field,
    };
  }

  return {
    severity: 'error',
    code: 'invalid-part',
    message: field ? `${field}：${issue.message}` : issue.message,
    field,
  };
}

// =============================================================================
// 补成 v8 形状（只补占位值，不改语义）
// =============================================================================

const PLACEHOLDER_TIME = 0;

/** 按固定字段顺序构造节点，保证同一输入的序列化结果逐字节一致 */
function asNode(node: PartNode, order: number, at: number): Node {
  return {
    id: node.id,
    type: node.type,
    ...(node.kind === undefined ? {} : { kind: node.kind }),
    title: node.title,
    content: node.content,
    ...(node.solution === undefined ? {} : { solution: node.solution }),
    parentId: node.parentId,
    order,
    ...(node.key === undefined ? {} : { key: node.key }),
    ...(node.aliases === undefined ? {} : { aliases: [...node.aliases] }),
    ...(node.tags === undefined ? {} : { tags: [...node.tags] }),
    ...(node.citation === undefined ? {} : { citation: { ...node.citation } }),
    createdAt: at,
    updatedAt: at,
  };
}

function asEdge(edge: PartEdge, id: string, at: number): Edge {
  return {
    id,
    from: edge.from,
    to: edge.to,
    predicate: edge.predicate,
    ...(edge.condition === undefined ? {} : { condition: edge.condition }),
    ...(edge.note === undefined ? {} : { note: edge.note }),
    ...(edge.contextId === undefined ? {} : { contextId: edge.contextId }),
    assertedBy: 'import',
    createdAt: at,
    updatedAt: at,
  };
}

function asStep(step: PartStep, id: string, at: number): InferenceStep {
  return {
    id,
    premiseIds: [...step.premiseIds],
    conclusionId: step.conclusionId,
    rule: step.rule,
    ...(step.contextId === undefined ? {} : { contextId: step.contextId }),
    ...(step.proofId === undefined ? {} : { proofId: step.proofId }),
    ...(step.note === undefined ? {} : { note: step.note }),
    assertedBy: 'import',
    createdAt: at,
    updatedAt: at,
  };
}

function sequenceId(prefix: string, marker: 'e' | 'i', seq: number): string {
  return `${prefix}-${marker}${String(seq).padStart(3, '0')}`;
}

/** part 内按 parentId 分组，(i + 1) * 1024；跨 part 的父节点补结构桩，否则父子类型无从校验 */
function shapedNodesOf(part: BookPart): Node[] {
  const cursors = new Map<string, number>();
  const nodes = part.nodes.map((node) => {
    const key = node.parentId ?? '';
    const index = (cursors.get(key) ?? 0) + 1;
    cursors.set(key, index);
    return asNode(node, index * 1024, PLACEHOLDER_TIME);
  });

  const known = new Set(nodes.map((node) => node.id));
  const stubs: Node[] = [];
  const visit = (id: string) => {
    if (known.has(id)) return;
    const type = structuralStubType(id);
    if (!type) return;
    known.add(id);
    const parentId = structuralParentId(id);
    if (parentId) visit(parentId);
    stubs.push({
      id,
      type,
      title: id,
      content: '',
      parentId,
      order: 0,
      createdAt: PLACEHOLDER_TIME,
      updatedAt: PLACEHOLDER_TIME,
    });
  };
  for (const node of nodes) {
    if (node.parentId) visit(node.parentId);
  }
  return [...nodes, ...stubs];
}

/** 关系 / 步骤的占位 id 只用于整图校验，必须在本 part 内唯一 */
function shapedEdgesOf(part: BookPart): Edge[] {
  return part.edges.map((edge, index) => asEdge(edge, sequenceId(part.meta.chapter, 'e', index + 1), PLACEHOLDER_TIME));
}

function shapedStepsOf(part: BookPart): InferenceStep[] {
  return part.steps.map((step, index) => asStep(step, sequenceId(part.meta.chapter, 'i', index + 1), PLACEHOLDER_TIME));
}

/**
 * 父子类型、关系端点、supports 起点、depends-on 无环……全部交给现成的
 * `validateGraphInvariants`，这里只补占位值。
 */
function graphIssuesOf(part: BookPart): ValidationIssue[] {
  const nodes = shapedNodesOf(part);
  const issues = validateGraphInvariants(
    {
      nodes,
      edges: shapedEdgesOf(part),
      steps: shapedStepsOf(part),
    },
    { allowExternalEndpoints: true },
  );

  // 父节点在本 part 之外、且 ID 推不出类型时，validateGraphInvariants 只能报
  // 「父节点不存在」。补一句说明，避免误导人去改合法的 part。
  const ids = new Set(part.nodes.map((node) => node.id));
  const unknowable = new Set<string>();
  for (const node of part.nodes) {
    if (!node.parentId || ids.has(node.parentId)) continue;
    if (structuralStubType(node.parentId) === null) unknowable.add(node.id);
  }
  if (unknowable.size === 0) return issues;

  return issues.map((issue) =>
    issue.code === 'missing-parent' && issue.nodeId && unknowable.has(issue.nodeId)
      ? {
          ...issue,
          suggestion:
            '父节点可能位于同册的其它分章 part：跨 part 的父子关系要等合并后才知道，这里只提醒。',
        }
      : issue,
  );
}

// =============================================================================
// 校验：ID 命名（§2）
// =============================================================================

function nodeIdIssues(part: BookPart, node: PartNode, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const field = `nodes.${index}.id`;
  const family = idFamilyOf(node.id);
  const expected = expectedFamiliesOf(node);

  if (family === 'unknown') {
    issues.push({
      severity: 'warning',
      code: 'id-format',
      message: `节点 id「${node.id}」不符合 §2 的命名规则（历史数据兼容，只告警）。`,
      nodeId: node.id,
      field,
      suggestion: '结构节点用 phy-<册>-c<章号>/s<节号>，内容节点用 phy-<册>-p<印刷页码>-<页内序>。',
    });
  } else if (!expected.includes(family)) {
    if (family === 'edge' || family === 'step' || family === 'asset') {
      issues.push({
        severity: 'error',
        code: 'id-wrong-family',
        message: `节点「${node.title}」的 id「${node.id}」是${family === 'asset' ? '资源' : family === 'edge' ? '关系' : '推理步骤'} ID 的形式，节点不能用。`,
        nodeId: node.id,
        field,
      });
    } else if (STRUCTURAL_FAMILIES.has(family) && !isStructuralNode(node)) {
      issues.push({
        severity: 'error',
        code: 'id-wrong-system',
        message: `内容节点「${node.title}」的 id「${node.id}」用了结构 ID：内容节点必须用页码 ID（phy-<册>-p<印刷页码>-<页内序>，§2）。`,
        nodeId: node.id,
        field,
      });
    } else if (STRUCTURAL_FAMILIES.has(family)) {
      issues.push({
        severity: 'error',
        code: 'id-level-mismatch',
        message: `节点「${node.title}」的 id「${node.id}」层级不符：${node.type === 'branch' ? '分支' : node.kind === 'chapter' ? '章' : '节'}的 id 格式见 §2。`,
        nodeId: node.id,
        field,
      });
    } else {
      issues.push({
        severity: 'error',
        code: 'id-wrong-system',
        message: `章节节点「${node.title}」的 id「${node.id}」用了页码 ID：branch / section 必须用结构 ID（§2）。`,
        nodeId: node.id,
        field,
      });
    }
  }

  const volume = volumeOfId(node.id);
  if (volume !== null && volume !== part.meta.volume) {
    issues.push({
      severity: 'error',
      code: 'id-volume-mismatch',
      message: `节点「${node.id}」属于 ${volume}，但本 part 的 meta.volume 是 ${part.meta.volume}：一章一份 part，不能混册。`,
      nodeId: node.id,
      field,
    });
  }

  if (family === 'chapter' && node.id !== part.meta.chapter) {
    issues.push({
      severity: 'error',
      code: 'chapter-mismatch',
      message: `节点「${node.id}」是另一个章的章节点，但 meta.chapter 是「${part.meta.chapter}」：一份 part 只装一章。`,
      nodeId: node.id,
      field,
    });
  }

  const insideChapter =
    family === 'chapter' || family === 'section' || family === 'subsection';
  if (insideChapter && node.id !== part.meta.chapter && !node.id.startsWith(`${part.meta.chapter}-`)) {
    issues.push({
      severity: 'error',
      code: 'node-outside-chapter',
      message: `节点「${node.id}」不在本章「${part.meta.chapter}」下。`,
      nodeId: node.id,
      field,
    });
  }

  return issues;
}

/** §7 只允许这 7 种；implies / iff / proves / generalizes / refutes 本次禁用 */
const DISABLED_PREDICATES: ReadonlySet<string> = new Set([
  'implies',
  'iff',
  'proves',
  'generalizes',
  'refutes',
]);

function ownershipIssues(part: BookPart): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { volume, chapter } = part.meta;

  if (idFamilyOf(chapter) !== 'chapter') {
    issues.push({
      severity: 'error',
      code: 'chapter-id-format',
      message: `meta.chapter「${chapter}」不是章节点 id：应为 phy-<册>-c<两位章号>（§2）。`,
      field: 'meta.chapter',
    });
  } else if (volumeOfId(chapter) !== volume) {
    issues.push({
      severity: 'error',
      code: 'chapter-volume-mismatch',
      message: `meta.chapter「${chapter}」不属于 meta.volume「${volume}」。`,
      field: 'meta.chapter',
    });
  }

  part.nodes.forEach((node, index) => {
    issues.push(...nodeIdIssues(part, node, index));
  });

  part.edges.forEach((edge, index) => {
    if (!DISABLED_PREDICATES.has(edge.predicate)) return;
    issues.push({
      severity: 'error',
      code: 'predicate-not-allowed',
      message: `关系 ${edge.from} → ${edge.to} 用了「${edge.predicate}」：本次转写禁用该谓词（§7 白名单只有 depends-on / uses / supports / covers / cites / part-of / is-a）。`,
      field: `edges.${index}.predicate`,
    });
  });

  return issues;
}

// =============================================================================
// 校验：depends-on 的质量（§7）
// =============================================================================

/** 同一个目标被这么多条 depends-on 指向，就按星形中心报出来（§7） */
const DEPENDS_ON_HUB_THRESHOLD = 4;

/** note 少于这么多个字，等于没写依据（§7） */
const DEPENDS_ON_NOTE_MIN_LENGTH = 12;

/** 依据原句必须带引号抄进 note；CJK 引号与西文双引号都算 */
const DEPENDS_ON_QUOTE_PATTERN = /[「」『』“”"]/;

/** 沿 parentId 链往上找最近的 section 节点（章、节、小节都算），找不到返回 null */
function nearestSectionAncestorOf(id: string, nodesById: Map<string, Node>): string | null {
  let cursor = nodesById.get(id)?.parentId ?? null;
  while (cursor) {
    const node = nodesById.get(cursor);
    if (!node) return null;
    if (node.type === 'section') return node.id;
    cursor = node.parentId;
  }
  return null;
}

/**
 * §7 的三条机械判据：星形中心、同小节互连、缺原句依据。一律只告警。
 *
 * 主题词（噪声 / 频率 / 振动）靠语义判断拦不住模型，只能靠「同一个目标被多少人依赖」
 * 「两端是不是同一个 section」「note 里有没有抄原句」这些结构性信号兜底。
 */
function dependsOnIssuesOf(part: BookPart): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodesById = new Map(shapedNodesOf(part).map((node) => [node.id, node]));
  const titleOf = (id: string) => nodesById.get(id)?.title ?? id;
  const dependsOn = part.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => edge.predicate === 'depends-on');

  // ---- 星形中心：同一个目标被 >= 4 条依赖指向（§7） ----
  const targetCounts = new Map<string, number>();
  for (const { edge } of dependsOn) {
    targetCounts.set(edge.to, (targetCounts.get(edge.to) ?? 0) + 1);
  }
  for (const [to, count] of targetCounts) {
    if (count < DEPENDS_ON_HUB_THRESHOLD) continue;
    issues.push({
      severity: 'warning',
      code: 'depends-on-hub',
      message: `depends-on 目标「${titleOf(to)}」（${to}）被 ${count} 条边指向：同一个目标被 ≥ ${DEPENDS_ON_HUB_THRESHOLD} 条依赖指向，基本可以断定它是主题词而不是真前置，必须逐条复核（§7）。`,
      nodeId: to,
    });
  }

  for (const { edge, index } of dependsOn) {
    // ---- 同小节互连：两端最近的 section 祖先相同（§7） ----
    const fromSection = nearestSectionAncestorOf(edge.from, nodesById);
    const toSection = nearestSectionAncestorOf(edge.to, nodesById);
    if (fromSection !== null && fromSection === toSection) {
      issues.push({
        severity: 'warning',
        code: 'depends-on-same-subsection',
        message: `${edge.from} → ${edge.to} 两端的最近 section 祖先都是「${titleOf(fromSection)}」（${fromSection}）：前置依赖通常跨小节，同小节互连多半是同段拆出来的兄弟节点（§7）。`,
        field: `edges.${index}.from`,
      });
    }

    // ---- 依据不足：note 空、太短、没抄原句（§7） ----
    const note = edge.note?.trim() ?? '';
    const problems: string[] = [];
    if (note === '') problems.push('note 是空的');
    else if (note.length < DEPENDS_ON_NOTE_MIN_LENGTH) {
      problems.push(`note 只有 ${note.length} 个字（不足 ${DEPENDS_ON_NOTE_MIN_LENGTH} 字）`);
    }
    if (!DEPENDS_ON_QUOTE_PATTERN.test(note)) problems.push('note 里没有引号引出的原句');
    if (problems.length === 0) continue;
    issues.push({
      severity: 'warning',
      code: 'depends-on-weak-evidence',
      message: `${edge.from} → ${edge.to} 的依据不足（${problems.join('；')}）：depends-on 必须把依据原句抄进 note（§7）。`,
      field: `edges.${index}.note`,
    });
  }

  return issues;
}

// =============================================================================
// 校验：资源（§0.2.2、§10、§11）
// =============================================================================

const PIPELINE_FIELDS = ['path', 'mimeType', 'byteLength', 'sha256'] as const;

function assetIssuesOf(part: BookPart, nodes: Node[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(part.nodes.map((node) => node.id));
  const [rangeStart, rangeEnd] = part.meta.pdfPageRange;
  const known = new Set<string>();

  part.assets.forEach((asset, index) => {
    const field = `assets.${index}`;

    if (known.has(asset.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-asset-id',
        message: `资源 id 重复：${asset.id}`,
        field: `${field}.id`,
      });
    }
    known.add(asset.id);

    if (idFamilyOf(asset.id) !== 'asset') {
      issues.push({
        severity: 'warning',
        code: 'asset-id-format',
        message: `资源 id「${asset.id}」不符合 §2 的格式（phy-<册>-p<页码>-fig<两位>）。`,
        field: `${field}.id`,
      });
    }

    if (!nodeIds.has(asset.nodeId)) {
      issues.push({
        severity: 'error',
        code: 'asset-node-missing',
        message: `资源 ${asset.id} 挂在节点 ${asset.nodeId} 上，但本 part 里没有这个节点。`,
        nodeId: asset.nodeId,
        field: `${field}.nodeId`,
      });
    }

    if (asset.pdfPage < rangeStart || asset.pdfPage > rangeEnd) {
      issues.push({
        severity: 'error',
        code: 'asset-page-outside-range',
        message: `资源 ${asset.id} 的 pdfPage=${asset.pdfPage} 不在 meta.pdfPageRange [${rangeStart}, ${rangeEnd}] 内：图只能来自本章的页。`,
        field: `${field}.pdfPage`,
      });
    }

    const missing = PIPELINE_FIELDS.filter((key) => asset[key] === undefined);
    if (missing.length === 0) {
      // 流水线字段齐了，直接复用 assets.ts 的资源字段校验（id / path / mime / 大小 / sha256）
      issues.push(
        ...assetMetaIssues({
          id: asset.id,
          path: asset.path as string,
          mimeType: asset.mimeType as string,
          byteLength: asset.byteLength as number,
          sha256: asset.sha256 as string,
          alt: asset.alt,
          caption: asset.caption,
        }),
      );
    } else if (missing.length < PIPELINE_FIELDS.length) {
      issues.push({
        severity: 'error',
        code: 'asset-pipeline-incomplete',
        message: `资源 ${asset.id} 的资源流水线字段只填了一部分（缺 ${missing.join('、')}）：path / mimeType / byteLength / sha256 要么全部回填，要么全部留空等流水线补。`,
        field,
      });
    } else {
      issues.push({
        severity: 'warning',
        code: 'asset-pipeline-pending',
        message: `资源 ${asset.id} 还没有 path / mimeType / byteLength / sha256：裁图后由资源流水线回填（§10），合并前必须补齐。`,
        field,
      });
    }
  });

  // asset:// 闭合：正文引用了就必须有资源记录，反之提示未被引用
  const references = collectAssetReferences(nodes);
  for (const [assetId, owners] of references) {
    if (known.has(assetId)) continue;
    issues.push({
      severity: 'error',
      code: 'missing-asset',
      message: `节点 ${owners.join('、')} 引用了 asset://${assetId}，但本 part 的 assets 里没有这个资源。`,
      nodeId: owners[0],
      suggestion: `补上 ${assetId} 的资源记录并裁图，或把正文里的 asset://${assetId} 删掉。`,
    });
  }
  for (const asset of part.assets) {
    if (references.has(asset.id)) continue;
    issues.push({
      severity: 'warning',
      code: 'unused-asset',
      message: `资源 ${asset.id} 没有被任何节点引用。`,
      suggestion: '合并前删掉用不上的资源，或者把它的图放进正文。',
    });
  }

  return issues;
}

// =============================================================================
// 覆盖率（§0.3）
// =============================================================================

const SRC_TAG_PREFIX = 'src:';

/** 覆盖率六项。分子只算 mapped + exception；undecided 必须单列，不许并进「完成度」。 */
export interface PartCoverage {
  total: number;
  mapped: number;
  exception: number;
  missing: number;
  duplicate: number;
  undecided: number;
  missingSrcIds: string[];
}

interface CoverageAnalysis extends PartCoverage {
  duplicatedSrcIds: string[];
  undecidedSrcIds: string[];
  /** 既映射又登记例外：按 mapped 计，但要求复核 */
  conflictingSrcIds: string[];
}

function isSplitIdOf(id: string, srcId: string): boolean {
  if (id === srcId) return true;
  if (!id.startsWith(`${srcId}@`)) return false;
  return /^\d+$/.test(id.slice(srcId.length + 1));
}

/**
 * 逐条判定清单条目属于哪一类。
 *
 * - mapped：节点 id 就是 srcId，或是 srcId 的 `@n` 拆分，或节点 tags 里有 `src:<srcId>`
 *   （一个 note 吞并多个连续源条目时只登记第一个 srcId，其余进 tags，§3.3）；
 * - duplicate：一个 srcId 被多个互不相关的节点占用（`@n` 拆分不算）；
 * - exception：例外清单里登记了**并且写了理由**；
 * - undecided：登记了例外但没写理由——没有依据就不算例外，也不计入覆盖率；
 * - missing：既没有映射也没有登记。
 */
function analyzeCoverage(part: BookPart, expected: ExpectedManifest): CoverageAnalysis {
  const tagOwners = new Map<string, string[]>();
  for (const node of part.nodes) {
    for (const tag of node.tags ?? []) {
      if (!tag.startsWith(SRC_TAG_PREFIX)) continue;
      const srcId = tag.slice(SRC_TAG_PREFIX.length);
      if (!srcId) continue;
      const owners = tagOwners.get(srcId);
      if (!owners) tagOwners.set(srcId, [node.id]);
      else if (!owners.includes(node.id)) owners.push(node.id);
    }
  }

  const exceptionReasons = new Map<string, string[]>();
  for (const exception of part.exceptions) {
    if (!exception.srcId) continue;
    const reasons = exceptionReasons.get(exception.srcId);
    if (reasons) reasons.push(exception.reason);
    else exceptionReasons.set(exception.srcId, [exception.reason]);
  }
  const documented = (srcId: string) =>
    (exceptionReasons.get(srcId) ?? []).some((reason) => reason.trim() !== '');

  const result: CoverageAnalysis = {
    total: expected.items.length,
    mapped: 0,
    exception: 0,
    missing: 0,
    duplicate: 0,
    undecided: 0,
    missingSrcIds: [],
    duplicatedSrcIds: [],
    undecidedSrcIds: [],
    conflictingSrcIds: [],
  };

  for (const item of expected.items) {
    const srcId = item.srcId;
    const proper = part.nodes.filter((node) => isSplitIdOf(node.id, srcId)).map((node) => node.id);
    const properIds = new Set(proper);
    const unrelated = (tagOwners.get(srcId) ?? []).filter((id) => !properIds.has(id));

    const duplicated = unrelated.length > 1 || (unrelated.length === 1 && proper.length > 0);
    if (duplicated) {
      result.duplicate += 1;
      result.duplicatedSrcIds.push(srcId);
      continue;
    }

    const claimed = proper.length + unrelated.length;
    if (claimed > 0) {
      result.mapped += 1;
      if (exceptionReasons.has(srcId)) result.conflictingSrcIds.push(srcId);
      continue;
    }

    if (documented(srcId)) {
      result.exception += 1;
      continue;
    }

    if (exceptionReasons.has(srcId)) {
      result.undecided += 1;
      result.undecidedSrcIds.push(srcId);
      continue;
    }

    result.missing += 1;
    result.missingSrcIds.push(srcId);
  }

  return result;
}

/** 结构覆盖率六项计数。结构覆盖率本身 = (mapped + exception) / total，由调用方算。 */
export function coverageOf(part: BookPart, expected: ExpectedManifest): PartCoverage {
  const analysis = analyzeCoverage(part, expected);
  return {
    total: analysis.total,
    mapped: analysis.mapped,
    exception: analysis.exception,
    missing: analysis.missing,
    duplicate: analysis.duplicate,
    undecided: analysis.undecided,
    missingSrcIds: analysis.missingSrcIds,
  };
}

function coverageIssuesOf(part: BookPart, expected: ExpectedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (expected.chapter && expected.chapter !== part.meta.chapter) {
    issues.push({
      severity: 'error',
      code: 'manifest-chapter-mismatch',
      message: `清单的 chapter「${expected.chapter}」与本 part 的 meta.chapter「${part.meta.chapter}」不一致：拿错清单了。`,
      field: 'meta.chapter',
    });
  }
  if (expected.volume && expected.volume !== part.meta.volume) {
    issues.push({
      severity: 'error',
      code: 'manifest-volume-mismatch',
      message: `清单的 volume「${expected.volume}」与本 part 的 meta.volume「${part.meta.volume}」不一致：拿错清单了。`,
      field: 'meta.volume',
    });
  }

  const analysis = analyzeCoverage(part, expected);

  for (const srcId of analysis.missingSrcIds) {
    issues.push({
      severity: 'error',
      code: 'missing-srcid',
      message: `清单条目 ${srcId} 既没有映射节点，也没有登记例外：未转写不得计为完成（§0.1.4）。`,
      suggestion: '要么补节点，要么在 exceptions 里写清理由。',
    });
  }
  for (const srcId of analysis.duplicatedSrcIds) {
    issues.push({
      severity: 'error',
      code: 'duplicate-srcid',
      message: `清单条目 ${srcId} 被多个互不相关的节点占用：一个 srcId 只能映射到 id 为 srcId 或 srcId@n 的节点（§2、§3.3）。`,
      suggestion: '拆分请用 @1 / @2；吞并多个源条目时把多余的 srcId 写进 tags。',
    });
  }
  for (const srcId of analysis.undecidedSrcIds) {
    issues.push({
      severity: 'warning',
      code: 'undecided-srcid',
      message: `清单条目 ${srcId} 登记了例外但没写理由：按「无法判定」计，不计入覆盖率。`,
      suggestion: '写清依据（原书原文或版面位置），或者补映射。',
    });
  }
  for (const srcId of analysis.conflictingSrcIds) {
    issues.push({
      severity: 'warning',
      code: 'exception-also-mapped',
      message: `清单条目 ${srcId} 已经映射到节点，却又登记了例外：覆盖率按已映射算，请删掉多余的那条。`,
    });
  }

  const known = new Set(expected.items.map((item) => item.srcId));
  for (const exception of part.exceptions) {
    if (!exception.srcId || known.has(exception.srcId)) continue;
    issues.push({
      severity: 'warning',
      code: 'exception-unknown-srcid',
      message: `例外清单里的 ${exception.srcId} 不在本次清单中：清单已冻结，不许增删条目（§0.1.3）。`,
    });
  }

  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const item of expected.items) {
    if (!seen.has(item.srcId)) {
      seen.add(item.srcId);
      continue;
    }
    if (reported.has(item.srcId)) continue;
    reported.add(item.srcId);
    issues.push({
      severity: 'warning',
      code: 'expected-duplicate-srcid',
      message: `清单里 ${item.srcId} 出现了多次：清单应已冻结且唯一，重复条目会让覆盖率分母偏大。`,
    });
  }

  return issues;
}

// =============================================================================
// 校验：Pass 1 清单（§3.1、§3.2）
// =============================================================================

/**
 * 清单校验的一条结论。
 *
 * 不复用 `ValidationIssue`：清单里没有节点 / 字段名，定位靠 `srcId` 与清单内的 JSON
 * 路径（如 `items[3].region`）。`code` 供脚本分组，文案给人看。
 */
export interface ExpectedManifestIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  srcId?: string;
  path?: string;
}

/** §3.1 的 kind 白名单：清单只能登记这 10 种，节点类型留给 Pass 2 映射（§4） */
const EXPECTED_KINDS: readonly string[] = [
  'heading',
  'para',
  'figure',
  'table',
  'activity-title',
  'block-title',
  'module',
  'exercise',
  'summary',
  'question',
];

/** srcId：phy-<册>-p<三位或四位印刷页码>-<两位页内序号>（§2、§3.2） */
const EXPECTED_SRCID_PATTERN = /^phy-[a-z0-9]+-p\d{3,4}-\d{2}$/;

/** 取 srcId 末尾的页内序号（两位） */
const EXPECTED_SRCID_SEQ_PATTERN = /-(\d{2})$/;

interface ManifestBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isManifestRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** pdfPage：PDF 物理页序，从 1 开始的整数（§0.2.1） */
function pdfPageOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

/** 合法 region 才返回盒子；非法已经在 `item-region-invalid` / `extraregions-invalid` 里报过 */
function boxOf(value: unknown): ManifestBox | null {
  if (regionProblem(value) !== null) return null;
  const box = value as ManifestBox;
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function intersectionArea(left: ManifestBox, right: ManifestBox): number {
  const width = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const height = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function containsBox(outer: ManifestBox, inner: ManifestBox): boolean {
  return (
    inner.x >= outer.x - REGION_EPS &&
    inner.y >= outer.y - REGION_EPS &&
    inner.x + inner.width <= outer.x + outer.width + REGION_EPS &&
    inner.y + inner.height <= outer.y + outer.height + REGION_EPS
  );
}

/** 同一页内两个 bbox 的关系；跨页的坐标不在同一坐标系，调用方必须先按 pdfPage 过滤 */
function boxRelation(left: ManifestBox, right: ManifestBox): 'disjoint' | 'partial' | 'containment' {
  if (intersectionArea(left, right) <= 0) return 'disjoint';
  // 包含（含完全重合）不是 overlaps 的用途，应该用 parentSrcId
  if (containsBox(left, right) || containsBox(right, left)) return 'containment';
  return 'partial';
}

/** 坐标 / 面积显示：0.0123、0.5，不把 0.5 显示成 0.5000 */
function formatBoxNumber(value: number): string {
  const fixed = value.toFixed(4);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

function formatSeq(seq: number): string {
  return String(seq).padStart(2, '0');
}

/** 无向对：overlaps 与父子关系都要按「这对」去重 */
function unorderedPairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

/** 子框超出父框的那几条边（只报真正超出的边，方便照着改坐标） */
function containmentExcess(outer: ManifestBox, inner: ManifestBox): string {
  const sides: string[] = [];
  const left = outer.x - inner.x;
  const top = outer.y - inner.y;
  const right = inner.x + inner.width - (outer.x + outer.width);
  const bottom = inner.y + inner.height - (outer.y + outer.height);
  if (left > REGION_EPS) sides.push(`左超出 ${formatBoxNumber(left)}`);
  if (top > REGION_EPS) sides.push(`上超出 ${formatBoxNumber(top)}`);
  if (right > REGION_EPS) sides.push(`右超出 ${formatBoxNumber(right)}`);
  if (bottom > REGION_EPS) sides.push(`下超出 ${formatBoxNumber(bottom)}`);
  return sides.length > 0 ? sides.join('、') : '差异在容差内';
}

/** 从清单读出来的一条，只留机械校验用得到的字段；非法值记 null 并已经报过 */
interface ChecklistEntry {
  index: number;
  path: string;
  srcId: string | null;
  pdfPage: number | null;
  box: ManifestBox | null;
  parentSrcId: string | null;
  overlaps: string[];
  /** 续页页号：写了 extraRegions 就算，不看 region 是否合法 */
  extraPages: Set<number>;
}

function readChecklistEntry(
  raw: unknown,
  index: number,
  issues: ExpectedManifestIssue[],
): ChecklistEntry | null {
  const path = `items[${index}]`;
  if (!isManifestRecord(raw)) {
    issues.push({
      severity: 'error',
      code: 'item-shape',
      message: `清单第 ${index + 1} 条不是 JSON 对象：每条必须有 srcId、kind、pdfPage，并给出 region 或 regionOmittedReason（§3.1、§3.2）。`,
      path,
    });
    return null;
  }

  const srcId = isFilledText(raw.srcId) ? raw.srcId.trim() : null;
  if (srcId === null) {
    issues.push({
      severity: 'error',
      code: 'item-shape',
      message: `清单第 ${index + 1} 条缺少 srcId：必须是非空字符串，Pass 2 拿它当节点 id 的前缀（§2、§3.2）。`,
      path: `${path}.srcId`,
    });
  } else if (!EXPECTED_SRCID_PATTERN.test(srcId)) {
    issues.push({
      severity: 'warning',
      code: 'srcid-format',
      message: `srcId「${srcId}」不符合 phy-<册>-p<三位或四位印刷页码>-<两位页内序号>（§2）。格式不对会连带节点 id 违规，请核对印刷页码和页内序号。`,
      srcId,
      path: `${path}.srcId`,
    });
  }

  if (typeof raw.kind !== 'string' || !EXPECTED_KINDS.includes(raw.kind)) {
    issues.push({
      severity: 'error',
      code: 'item-shape',
      message:
        raw.kind === undefined
          ? `清单第 ${index + 1} 条缺少 kind：只能填 ${EXPECTED_KINDS.join(' / ')}（§3.1）。`
          : `清单第 ${index + 1} 条的 kind「${String(raw.kind)}」不在白名单内：只能填 ${EXPECTED_KINDS.join(' / ')}（§3.1）。`,
      srcId: srcId ?? undefined,
      path: `${path}.kind`,
    });
  }

  const pdfPage = pdfPageOf(raw.pdfPage);
  if (pdfPage === null) {
    issues.push({
      severity: 'error',
      code: 'item-shape',
      message: `清单第 ${index + 1} 条的 pdfPage 缺失或不合法（当前 ${JSON.stringify(raw.pdfPage)}）：必须是 ≥ 1 的整数，指 PDF 物理页序（§0.2.1）。`,
      srcId: srcId ?? undefined,
      path: `${path}.pdfPage`,
    });
  }

  // region / regionOmittedReason：二选一，且必须有一个（§0.2.2、§3.2）
  const hasRegion = raw.region !== undefined && raw.region !== null;
  const hasReason = raw.regionOmittedReason !== undefined && raw.regionOmittedReason !== null;
  let box: ManifestBox | null = null;

  if (hasRegion && hasReason) {
    issues.push({
      severity: 'error',
      code: 'item-region-both',
      message: `region 与 regionOmittedReason 同时存在：二选一。坐标已知就填 region，坐标不确定就只写原因（§0.2.2、§3.2）。`,
      srcId: srcId ?? undefined,
      path: `${path}.regionOmittedReason`,
    });
  }

  if (hasRegion) {
    box = boxOf(raw.region);
    const problem = regionProblem(raw.region);
    if (problem !== null) {
      issues.push({
        severity: 'error',
        code: 'item-region-invalid',
        message: `region 不合法：${problem} 坐标以页面左上角为原点、归一化到 [0, 1]，越界就是错误，不许静默裁剪（§0.2.2）。`,
        srcId: srcId ?? undefined,
        path: `${path}.region`,
      });
    }
  }

  if (hasReason && !isFilledText(raw.regionOmittedReason)) {
    issues.push({
      severity: 'error',
      code: 'item-shape',
      message: `regionOmittedReason 必须是非空字符串：写清为什么给不出 bbox（如「矢量插图，视觉模型无法给出可靠 bbox」），空串等于没写（§0.2.2）。`,
      srcId: srcId ?? undefined,
      path: `${path}.regionOmittedReason`,
    });
  }

  if (!hasRegion && !hasReason) {
    issues.push({
      severity: 'error',
      code: 'item-shape',
      message: `必须填 region 或 regionOmittedReason 之一（§0.2.2）：坐标不确定时写清原因，不要用零值或整页框假装定位完成。`,
      srcId: srcId ?? undefined,
      path: `${path}.region`,
    });
  }

  let parentSrcId: string | null = null;
  if (raw.parentSrcId !== undefined && raw.parentSrcId !== null) {
    if (isFilledText(raw.parentSrcId)) parentSrcId = raw.parentSrcId.trim();
    else {
      issues.push({
        severity: 'error',
        code: 'item-shape',
        message: `parentSrcId 要么是父条目的 srcId，要么是 null：不嵌套就写 null，不要留空串（§3.1）。`,
        srcId: srcId ?? undefined,
        path: `${path}.parentSrcId`,
      });
    }
  }

  const overlaps: string[] = [];
  if (raw.overlaps !== undefined && raw.overlaps !== null) {
    if (!Array.isArray(raw.overlaps)) {
      issues.push({
        severity: 'error',
        code: 'item-shape',
        message: `overlaps 必须是 srcId 数组：没有相交就写 []（§3.1）。`,
        srcId: srcId ?? undefined,
        path: `${path}.overlaps`,
      });
    } else {
      raw.overlaps.forEach((value, position) => {
        if (!isFilledText(value)) {
          issues.push({
            severity: 'error',
            code: 'item-shape',
            message: `overlaps[${position}] 必须是对方的 srcId 字符串（§3.1）。`,
            srcId: srcId ?? undefined,
            path: `${path}.overlaps[${position}]`,
          });
          return;
        }
        const target = value.trim();
        if (!overlaps.includes(target)) overlaps.push(target);
      });
    }
  }

  const extraPages = new Set<number>();
  if (raw.extraRegions !== undefined && raw.extraRegions !== null) {
    if (!Array.isArray(raw.extraRegions)) {
      issues.push({
        severity: 'error',
        code: 'extraregions-invalid',
        message: `extraRegions 必须是数组：每个续页区域写成 { pdfPage, region }（§3.1）。`,
        srcId: srcId ?? undefined,
        path: `${path}.extraRegions`,
      });
    } else {
      raw.extraRegions.forEach((value, position) => {
        const entryPath = `${path}.extraRegions[${position}]`;
        if (!isManifestRecord(value)) {
          issues.push({
            severity: 'error',
            code: 'extraregions-invalid',
            message: `extraRegions[${position}] 必须是 { pdfPage, region } 对象：跨页内容要在续页给出自己的 pdfPage 与 region（§3.1）。`,
            srcId: srcId ?? undefined,
            path: entryPath,
          });
          return;
        }
        const page = pdfPageOf(value.pdfPage);
        if (page === null) {
          issues.push({
            severity: 'error',
            code: 'extraregions-invalid',
            message: `extraRegions[${position}] 的 pdfPage 缺失或不合法（当前 ${JSON.stringify(value.pdfPage)}）：续页区域必须绑定自己的 PDF 物理页序（§3.1）。`,
            srcId: srcId ?? undefined,
            path: `${entryPath}.pdfPage`,
          });
        } else {
          extraPages.add(page);
        }
        const problem = regionProblem(value.region);
        if (problem !== null) {
          issues.push({
            severity: 'error',
            code: 'extraregions-invalid',
            message: `extraRegions[${position}].region 不合法：${problem} 一个 region 只能属于一个 pdfPage，续页必须单独给框（§0.2.2）。`,
            srcId: srcId ?? undefined,
            path: `${entryPath}.region`,
          });
        }
      });
    }
  }

  if (raw.continuesOn !== undefined && raw.continuesOn !== null) {
    const continuesOn = pdfPageOf(raw.continuesOn);
    if (continuesOn === null) {
      issues.push({
        severity: 'warning',
        code: 'continueson-bad',
        message: `continuesOn 必须是下一页的 pdfPage 整数（当前 ${JSON.stringify(raw.continuesOn)}）：不跨页就写 null（§3.1）。`,
        srcId: srcId ?? undefined,
        path: `${path}.continuesOn`,
      });
    } else if (pdfPage !== null && continuesOn !== pdfPage + 1) {
      issues.push({
        severity: 'warning',
        code: 'continueson-bad',
        message: `pdfPage ${pdfPage} 的 continuesOn=${continuesOn}，不是 pdfPage + 1（${pdfPage + 1}）：跨页内容登记在起始页、续到紧邻的下一页（§3.1），请人工确认是否跨了三页以上。`,
        srcId: srcId ?? undefined,
        path: `${path}.continuesOn`,
      });
    }
  }

  return { index, path, srcId, pdfPage, box, parentSrcId, overlaps, extraPages };
}

/** pdfPageRange 只在写了的情况下才算数；值不对就报 manifest-shape 并当作没有 */
function manifestPageRangeOf(
  manifest: Record<string, unknown>,
  issues: ExpectedManifestIssue[],
): [number, number] | null {
  const raw = manifest.pdfPageRange;
  if (raw === undefined) return null;
  if (!Array.isArray(raw) || raw.length !== 2) {
    issues.push({
      severity: 'error',
      code: 'manifest-shape',
      message: 'pdfPageRange 必须是 [起始页, 结束页] 两个整数：清单头部的页范围是 pdfpage-out-of-range 的依据（§3.2）。',
      path: 'pdfPageRange',
    });
    return null;
  }
  const start = pdfPageOf(raw[0]);
  const end = pdfPageOf(raw[1]);
  if (start === null || end === null) {
    issues.push({
      severity: 'error',
      code: 'manifest-shape',
      message: `pdfPageRange 的两个值都必须是 ≥ 1 的整数（当前 ${JSON.stringify(raw)}），且是 PDF 物理页序（§0.2.1）。`,
      path: 'pdfPageRange',
    });
    return null;
  }
  if (start > end) {
    issues.push({
      severity: 'error',
      code: 'manifest-shape',
      message: `pdfPageRange 的起始页 ${start} 大于结束页 ${end}：顺序写反了（§3.2）。`,
      path: 'pdfPageRange',
    });
    return null;
  }
  return [start, end];
}

/** 同一 pdfPage 内的序号应从 01 起连续；断号 / 乱序允许存在，但必须看得见 */
function srcIdOrderIssues(entries: ChecklistEntry[]): ExpectedManifestIssue[] {
  const byPage = new Map<number, { entry: ChecklistEntry; seq: number }[]>();
  for (const entry of entries) {
    const { srcId, pdfPage } = entry;
    if (srcId === null || pdfPage === null) continue;
    const seqText = EXPECTED_SRCID_SEQ_PATTERN.exec(srcId)?.[1];
    if (seqText === undefined) continue; // 格式问题交给 srcid-format
    const row = { entry, seq: Number.parseInt(seqText, 10) };
    const rows = byPage.get(pdfPage);
    if (rows) rows.push(row);
    else byPage.set(pdfPage, [row]);
  }

  const issues: ExpectedManifestIssue[] = [];
  for (const [page, rows] of [...byPage.entries()].sort((left, right) => left[0] - right[0])) {
    const seqs = rows.map((row) => row.seq);
    const ascending = seqs.every((seq, index) => index === 0 || seq === seqs[index - 1] + 1);
    if (ascending && seqs[0] === 1) continue;

    const sorted = [...seqs].sort((left, right) => left - right);
    const reasons: string[] = [];
    if (sorted[0] !== 1) reasons.push(`最小的是 ${formatSeq(sorted[0])}，应从 01 起`);
    const missing: string[] = [];
    for (let seq = sorted[0]; seq <= sorted[sorted.length - 1]; seq += 1) {
      if (!sorted.includes(seq)) missing.push(formatSeq(seq));
    }
    if (missing.length > 0) reasons.push(`缺 ${missing.join('、')}`);
    const duplicated = sorted.filter((seq, index) => index > 0 && seq === sorted[index - 1]);
    if (duplicated.length > 0) reasons.push(`${duplicated.map(formatSeq).join('、')} 重复`);
    if (!ascending && missing.length === 0 && sorted[0] === 1) reasons.push('出现顺序与页码顺序不一致（乱序）');

    const first = rows[0];
    issues.push({
      severity: 'warning',
      code: 'srcid-order',
      message: `pdfPage ${page} 的页内序号不是从 01 起连续递增：实际 ${seqs.map(formatSeq).join('、')}（${reasons.join('；')}）。页内序按页面从上到下、从左到右分配，分配后不改（§2）；允许留空号，但必须是故意的。`,
      srcId: first.entry.srcId ?? undefined,
      path: `${first.entry.path}.srcId`,
    });
  }
  return issues;
}

/**
 * Pass 1 清单校验：不抛错、不改入参。
 *
 * 只查清单自己能不能当「覆盖率的分母」：形状、region 合法性、页内序号、父子包含、
 * overlaps 双向与「部分相交必须声明」。清单与 part 的一致性由 `validateBookPart` 的
 * 覆盖率检查负责，这里不重复。
 */
export function validateExpectedManifest(manifest: unknown): ExpectedManifestIssue[] {
  const issues: ExpectedManifestIssue[] = [];

  if (!isManifestRecord(manifest)) {
    return [
      {
        severity: 'error',
        code: 'manifest-shape',
        message: '清单必须是 JSON 对象：顶层要有 volume / chapter / pdfPageRange / items（§3.2）。',
      },
    ];
  }

  for (const key of ['volume', 'chapter'] as const) {
    if (manifest[key] === undefined) continue;
    if (isFilledText(manifest[key])) continue;
    issues.push({
      severity: 'error',
      code: 'manifest-shape',
      message: `${key} 存在时必须是非空字符串：清单头部写清册与章，拿错清单会被覆盖率检查发现（§3.2）。`,
      path: key,
    });
  }

  if (!Array.isArray(manifest.items)) {
    issues.push({
      severity: 'error',
      code: 'manifest-shape',
      message: '清单缺少 items 数组：Pass 1 清单是 { items: [...] }，不是裸数组、也不是分章 part（§3.2）。',
      path: 'items',
    });
    return issues;
  }

  const pageRange = manifestPageRangeOf(manifest, issues);

  const entries: ChecklistEntry[] = [];
  manifest.items.forEach((raw, index) => {
    const entry = readChecklistEntry(raw, index, issues);
    if (entry) entries.push(entry);
  });

  // ---- 页范围 ----
  if (pageRange !== null) {
    for (const entry of entries) {
      if (entry.pdfPage === null) continue;
      if (entry.pdfPage >= pageRange[0] && entry.pdfPage <= pageRange[1]) continue;
      issues.push({
        severity: 'error',
        code: 'pdfpage-out-of-range',
        message: `pdfPage=${entry.pdfPage} 不在清单头部声明的 pdfPageRange [${pageRange[0]}, ${pageRange[1]}] 内：本章清单只覆盖这几页，跨章条目要拆到另一份清单（§3.2）。`,
        srcId: entry.srcId ?? undefined,
        path: `${entry.path}.pdfPage`,
      });
    }
  }

  // ---- srcId 唯一 ----
  const bySrcId = new Map<string, ChecklistEntry>();
  for (const entry of entries) {
    if (entry.srcId === null) continue;
    const first = bySrcId.get(entry.srcId);
    if (first === undefined) {
      bySrcId.set(entry.srcId, entry);
      continue;
    }
    issues.push({
      severity: 'error',
      code: 'srcid-duplicate',
      message: `srcId「${entry.srcId}」重复：第 ${first.index + 1} 条与第 ${entry.index + 1} 条用的是同一个 id。清单冻结后 srcId 全局唯一，重复会让覆盖率分母偏大（§0.1.3）。`,
      srcId: entry.srcId,
      path: `${entry.path}.srcId`,
    });
  }

  // ---- 页内序号 ----
  issues.push(...srcIdOrderIssues(entries));

  // ---- 父子关系 ----
  for (const entry of entries) {
    const parentSrcId = entry.parentSrcId;
    if (parentSrcId === null) continue;
    if (entry.srcId !== null && parentSrcId === entry.srcId) {
      issues.push({
        severity: 'error',
        code: 'parent-missing',
        message: `${entry.srcId} 的 parentSrcId 指向自己：父条目必须是同页里真正把它包住的另一条（§3.1）。`,
        srcId: entry.srcId,
        path: `${entry.path}.parentSrcId`,
      });
      continue;
    }
    const parent = bySrcId.get(parentSrcId);
    if (parent === undefined) {
      issues.push({
        severity: 'error',
        code: 'parent-missing',
        message: `${entry.srcId ?? `第 ${entry.index + 1} 条`} 的 parentSrcId 指向 ${parentSrcId}，但本章清单里没有这条：父条目必须也在清单里，跨章的父框不填 parentSrcId（§3.1）。`,
        srcId: entry.srcId ?? undefined,
        path: `${entry.path}.parentSrcId`,
      });
      continue;
    }

    const parentPage = parent.pdfPage;
    // 跨页父框只有「续页上的子条目」必须断开（§3.1）：同页子条目还能靠 bbox 证明包含，
    // 续页上的坐标属于另一页，包含关系无从谈起，所以一律 parentSrcId: null。
    if (entry.pdfPage !== null && parentPage !== null && entry.pdfPage !== parentPage) {
      if (parent.extraPages.has(entry.pdfPage)) {
        issues.push({
          severity: 'error',
          code: 'parent-cross-page',
          message: `${entry.srcId} 在 pdfPage ${entry.pdfPage}，是跨页条目 ${parent.srcId}（pdfPage ${parentPage}）的续页：包含关系只在单页内成立，续页上的子条目一律 parentSrcId: null（§3.1）。`,
          srcId: entry.srcId ?? undefined,
          path: `${entry.path}.parentSrcId`,
        });
      } else {
        issues.push({
          severity: 'error',
          code: 'parent-not-contained',
          message: `${entry.srcId} 在 pdfPage ${entry.pdfPage}，父条目 ${parent.srcId} 在 pdfPage ${parentPage}：跨页的 bbox 不在同一坐标系，包含关系无法成立（§3.1）。`,
          srcId: entry.srcId ?? undefined,
          path: `${entry.path}.parentSrcId`,
        });
      }
      continue;
    }

    // 坐标不全就没法机械判定包含，留给人工（srcId 那条已经报过）
    if (entry.box === null || parent.box === null) continue;
    if (containsBox(parent.box, entry.box)) continue;
    issues.push({
      severity: 'error',
      code: 'parent-not-contained',
      message: `${entry.srcId} 的 region 未落在父条目 ${parent.srcId} 内（${containmentExcess(parent.box, entry.box)}）：子条目必须整个落进父框；若框本身失真，宁可放大父框或改成 overlaps（§3.1）。`,
      srcId: entry.srcId ?? undefined,
      path: `${entry.path}.region`,
    });
  }

  // ---- overlaps：双向声明、实际相交 ----
  const reportedPairs = new Set<string>();
  for (const entry of entries) {
    if (entry.srcId === null) continue;
    for (const target of entry.overlaps) {
      if (target === entry.srcId) {
        issues.push({
          severity: 'error',
          code: 'overlaps-phantom',
          message: `${entry.srcId} 的 overlaps 里写了自己：一条不能与自己相交，删掉即可（§3.1）。`,
          srcId: entry.srcId,
          path: `${entry.path}.overlaps`,
        });
        continue;
      }
      const other = bySrcId.get(target);
      if (other === undefined) {
        issues.push({
          severity: 'error',
          code: 'overlaps-phantom',
          message: `${entry.srcId} 声明与 ${target} 相交，但本章清单里没有 ${target}：overlaps 只能写清单内的 srcId（§3.1）。`,
          srcId: entry.srcId,
          path: `${entry.path}.overlaps`,
        });
        continue;
      }
      // bySrcId 的 key 就是 srcId，这里只是让类型收窄
      if (other.srcId === null) continue;
      if (!other.overlaps.includes(entry.srcId)) {
        issues.push({
          severity: 'error',
          code: 'overlaps-asymmetric',
          message: `${entry.srcId} 声明与 ${other.srcId} 相交，但 ${other.srcId} 的 overlaps 里没有 ${entry.srcId}：相交必须双方都写明，只写一边复核时看不到（§3.1）。`,
          srcId: entry.srcId,
          path: `${entry.path}.overlaps`,
        });
      }

      if (entry.box === null || other.box === null) continue;
      if (entry.pdfPage === null || other.pdfPage === null) continue;
      if (entry.pdfPage !== other.pdfPage) {
        issues.push({
          severity: 'error',
          code: 'overlaps-phantom',
          message: `${entry.srcId}（pdfPage ${entry.pdfPage}）声明与 ${other.srcId}（pdfPage ${other.pdfPage}）相交：跨页 bbox 不在同一坐标系，overlaps 只在同一页内成立（§3.1）。`,
          srcId: entry.srcId,
          path: `${entry.path}.overlaps`,
        });
        continue;
      }

      const relation = boxRelation(entry.box, other.box);
      if (relation === 'disjoint') {
        issues.push({
          severity: 'error',
          code: 'overlaps-phantom',
          message: `${entry.srcId} 声明与 ${other.srcId} 相交，但两个 region 实际不相交：多写的 overlaps 会误导复核，删掉或改框（§3.1）。`,
          srcId: entry.srcId,
          path: `${entry.path}.overlaps`,
        });
        continue;
      }
      if (relation === 'containment') {
        const key = unorderedPairKey(entry.srcId, other.srcId);
        if (reportedPairs.has(key)) continue;
        reportedPairs.add(key);
        issues.push({
          severity: 'warning',
          code: 'overlaps-is-containment',
          message: `${entry.srcId} 与 ${other.srcId} 声明是 overlaps，实际是包含关系：包含请用 parentSrcId（子条目），overlaps 只留给互不包含的部分相交（§3.1）。`,
          srcId: entry.srcId,
          path: `${entry.path}.overlaps`,
        });
      }
    }
  }

  // ---- 同页两两比对：部分相交却双方都没声明 ----
  const pageGroups = new Map<number, ChecklistEntry[]>();
  const parentChildPairs = new Set<string>();
  for (const entry of entries) {
    if (entry.pdfPage !== null && entry.srcId !== null) {
      const group = pageGroups.get(entry.pdfPage);
      if (group) group.push(entry);
      else pageGroups.set(entry.pdfPage, [entry]);
    }
    if (entry.srcId !== null && entry.parentSrcId !== null) {
      parentChildPairs.add(unorderedPairKey(entry.srcId, entry.parentSrcId));
    }
  }

  for (const [page, group] of [...pageGroups.entries()].sort((left, right) => left[0] - right[0])) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i];
        const right = group[j];
        if (left.srcId === null || right.srcId === null) continue;
        if (left.srcId === right.srcId) continue;
        if (left.box === null || right.box === null) continue;
        // 父子容器本来就要互相嵌套，包含关系不算未声明相交
        if (parentChildPairs.has(unorderedPairKey(left.srcId, right.srcId))) continue;
        if (boxRelation(left.box, right.box) !== 'partial') continue;
        if (left.overlaps.includes(right.srcId) || right.overlaps.includes(left.srcId)) continue;
        issues.push({
          severity: 'error',
          code: 'overlap-undeclared',
          message: `${left.srcId} 与 ${right.srcId} 的 region 在 pdfPage ${page} 部分相交（重叠面积 ${formatBoxNumber(intersectionArea(left.box, right.box))}），但双方都没在 overlaps 里声明对方：要么改框，要么双方互写 overlaps（§3.1）。`,
          srcId: left.srcId,
          path: `${left.path}.region`,
        });
      }
    }
  }

  return issues;
}

/** 清单统计（`--stats` 用）：只数条目，不做校验 */
export interface ExpectedManifestStats {
  total: number;
  /** 按 kind 分布（条数降序，同数按名字）；kind 缺失或非法记作「未知」 */
  kinds: { kind: string; count: number }[];
  /** 按 PDF 页分布，页号升序 */
  pages: { pdfPage: number; count: number }[];
  /** 有合法 region 的条目数 */
  withRegion: number;
  /** 没有 region、只有 regionOmittedReason 的条目数 */
  reasonOnly: number;
  /** overlaps 声明对数（A 与 B 互写只算一对） */
  overlapPairs: number;
  /** parentSrcId 引用条数（每个子条目一条） */
  parentLinks: number;
}

export function expectedManifestStats(manifest: unknown): ExpectedManifestStats {
  const items = isManifestRecord(manifest) && Array.isArray(manifest.items) ? manifest.items : [];
  const kinds = new Map<string, number>();
  const pages = new Map<number, number>();
  const pairs = new Set<string>();
  let withRegion = 0;
  let reasonOnly = 0;
  let parentLinks = 0;

  for (const raw of items) {
    if (!isManifestRecord(raw)) continue;
    const kind = typeof raw.kind === 'string' && raw.kind.trim() !== '' ? raw.kind : '未知';
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);

    const page = pdfPageOf(raw.pdfPage);
    if (page !== null) pages.set(page, (pages.get(page) ?? 0) + 1);

    if (boxOf(raw.region) !== null) withRegion += 1;
    else if (isFilledText(raw.regionOmittedReason)) reasonOnly += 1;

    const srcId = isFilledText(raw.srcId) ? raw.srcId.trim() : null;
    if (srcId !== null && Array.isArray(raw.overlaps)) {
      for (const target of raw.overlaps) {
        if (isFilledText(target)) pairs.add(unorderedPairKey(srcId, target.trim()));
      }
    }
    if (srcId !== null && isFilledText(raw.parentSrcId)) parentLinks += 1;
  }

  return {
    total: items.length,
    kinds: [...kinds.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((left, right) => right.count - left.count || (left.kind < right.kind ? -1 : 1)),
    pages: [...pages.entries()]
      .map(([pdfPage, count]) => ({ pdfPage, count }))
      .sort((left, right) => left.pdfPage - right.pdfPage),
    withRegion,
    reasonOnly,
    overlapPairs: pairs.size,
    parentLinks,
  };
}

// =============================================================================
// 单章校验
// =============================================================================

/**
 * 校验一份分章中间格式。返回 issues，不抛错、不修改入参。
 *
 * 传了 `expected`（Pass 1 冻结清单）才会做 srcId 覆盖率检查。
 * zod 结构不过就到此为止：后面的检查都要解析后的数据，硬跑只会把「结构错」
 * 放大成一堆「引用错」。
 */
/**
 * `citation.page` 必须等于该条目在清单里的印刷页码。
 * 页码是溯源的根，写错一位就等于指向别的页；这类错误人工审计才能发现，值得机械化。
 */
function citationPageIssuesOf(part: BookPart, expected: ExpectedManifest): ValidationIssue[] {
  const offset = expected.pageOffset?.offset;
  if (typeof offset !== 'number' || !Number.isFinite(offset)) return [];

  const printedOf = new Map<string, string>();
  for (const item of expected.items) {
    if (typeof item.pdfPage !== 'number') continue;
    printedOf.set(item.srcId, String(item.pdfPage - offset));
  }

  const issues: ValidationIssue[] = [];
  for (const node of part.nodes) {
    if (node.type === 'branch') continue;
    const claimed: string[] = [node.id.replace(/@\d+$/, '')];
    for (const tag of node.tags ?? []) {
      if (typeof tag === 'string' && tag.startsWith('src:')) claimed.push(tag.slice(4));
    }
    const pages = new Set<string>();
    for (const srcId of claimed) {
      const printed = printedOf.get(srcId);
      if (printed !== undefined) pages.add(printed);
    }
    // 一个节点认领了跨页的多个条目时，任一页都算对
    if (pages.size === 0) continue;
    const page = node.citation?.page;
    if (page === undefined || page === null) {
      issues.push({
        severity: 'warning',
        code: 'citation-page-missing',
        message: `节点「${node.title}」没有 citation.page：原书页码是溯源的根，有据可查的节点必须填（§6）。`,
        nodeId: node.id,
        field: 'citation.page',
      });
      continue;
    }
    if (!pages.has(String(page).trim())) {
      issues.push({
        severity: 'warning',
        code: 'citation-page-mismatch',
        message:
          `节点「${node.title}」的 citation.page 是 ${String(page)}，但清单里对应条目的印刷页码是 ` +
          `${[...pages].join(' / ')}：页码写错会让溯源指到别的页（§6）。`,
        nodeId: node.id,
        field: 'citation.page',
      });
    }
  }
  return issues;
}

export function validateBookPart(part: unknown, expected?: ExpectedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = forbiddenFieldIssues(part);

  const parsed = BookPartSchema.safeParse(part);
  if (!parsed.success) {
    const reported = new Set(issues.map((issue) => issue.field ?? ''));
    for (const issue of parsed.error.issues) {
      const converted = schemaIssueOf(issue, reported);
      if (!converted) continue;
      issues.push(converted);
      if (converted.field) reported.add(converted.field);
    }
    return issues;
  }

  const value = parsed.data;
  issues.push(...graphIssuesOf(value));
  issues.push(...ownershipIssues(value));
  issues.push(...dependsOnIssuesOf(value));
  issues.push(...assetIssuesOf(value, shapedNodesOf(value)));
  if (expected) {
    issues.push(...coverageIssuesOf(value, expected));
    issues.push(...citationPageIssuesOf(value, expected));
  }

  return issues;
}

// =============================================================================
// 合并
// =============================================================================

export interface MergeOptions {
  /** 已有的跨册实体注册表；合并结果会带上新登记的核心概念 */
  entities?: EntityEntry[];
  /**
   * `manifest.json` 里的 `pageOffset.offset`（如 7）。给了就用它换算 anchor 的印刷页码；
   * 没给就从 part 自己声明的 `pdfPageRange` / `printedPageRange` 反推。
   *
   * 两种来源都没有确定值时 `pageLabel` 留空串——规约禁止用固定偏移量猜（§0.2.1）。
   */
  pageOffset?: number;
}

export interface MergeResult {
  graph: GraphJSONV9;
  entities: EntityEntry[];
  /** 合并告警（如实体注册表里已有同 key 的节点，疑似重复建节点）；不影响产出 */
  warnings: ValidationIssue[];
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * 合并顺序只看 meta：先 volume，再 chapter，最后才是输入下标。
 * 输入数组打乱不影响产出（并列时按下标，才保证同输入必定同输出）。
 */
function orderParts(parts: BookPart[]): BookPart[] {
  return parts
    .map((part, index) => ({ part, index }))
    .sort(
      (left, right) =>
        compareText(left.part.meta.volume, right.part.meta.volume) ||
        compareText(left.part.meta.chapter, right.part.meta.chapter) ||
        left.index - right.index,
    )
    .map((entry) => entry.part);
}

/**
 * 从 part 自己声明的页码区间反推印刷页码偏移（`opts.pageOffset` 没给时的后备）。
 *
 * 规约禁止用固定偏移量换算（§0.2.1）：`pdfPageRange` 两端减掉 `printedPageRange`
 * 两端必须得到同一个偏移，否则就是记错了或跨了无页码页——宁可留空页标，也不猜。
 */
function pageOffsetOf(meta: PartMeta): number | null {
  const [pdfStart, pdfEnd] = meta.pdfPageRange;
  const [printedStartText, printedEndText] = meta.printedPageRange;
  if (!/^\d+$/.test(printedStartText.trim()) || !/^\d+$/.test(printedEndText.trim())) return null;
  const startOffset = pdfStart - Number.parseInt(printedStartText, 10);
  const endOffset = pdfEnd - Number.parseInt(printedEndText, 10);
  return startOffset === endOffset ? startOffset : null;
}

function printedPageLabelOf(pdfPage: number, offset: number | null): string {
  if (offset === null) return '';
  const printed = pdfPage - offset;
  return printed > 0 ? String(printed) : '';
}

function assetMetaOf(asset: PartAsset): AssetMeta {
  const missing = PIPELINE_FIELDS.filter((key) => asset[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `资源 ${asset.id} 缺少资源流水线字段（${missing.join('、')}）：合并前必须先裁图回填 path / mimeType / byteLength / sha256（§10、§11）。`,
    );
  }
  return {
    id: asset.id,
    path: asset.path as string,
    mimeType: asset.mimeType as string,
    byteLength: asset.byteLength as number,
    sha256: asset.sha256 as string,
    alt: asset.alt,
    ...(asset.caption === undefined ? {} : { caption: asset.caption }),
  };
}

function anchorOf(asset: PartAsset, meta: PartMeta, offset: number | null): SourceAnchor | null {
  if (!asset.region) return null;
  return {
    id: `${asset.id}-anchor`,
    nodeId: asset.nodeId,
    sourceId: meta.volume,
    pageLabel: printedPageLabelOf(asset.pdfPage, offset),
    region: {
      x: asset.region.x,
      y: asset.region.y,
      width: asset.region.width,
      height: asset.region.height,
    },
  };
}

function firstSeenOf(node: Node, nodesById: Map<string, Node>, chapterOfNode: Map<string, string>): string {
  let cursor = node.parentId;
  while (cursor) {
    const parent = nodesById.get(cursor);
    if (!parent) break;
    if (parent.type === 'section') return parent.id;
    cursor = parent.parentId;
  }
  return chapterOfNode.get(node.id) ?? '';
}

function mergeEntityRegistry(
  nodes: Node[],
  chapterOfNode: Map<string, string>,
  provided: EntityEntry[] | undefined,
  warnings: ValidationIssue[],
): EntityEntry[] {
  // 复制一份，绝不改调用方传进来的注册表
  const entities: EntityEntry[] = (provided ?? []).map((entity) => ({
    id: entity.id,
    key: entity.key,
    title: entity.title,
    aliases: [...entity.aliases],
    firstSeen: entity.firstSeen,
  }));
  const byKey = new Map(entities.map((entity) => [entity.key, entity]));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (!node.key) continue;
    const existing = byKey.get(node.key);
    if (existing) {
      if (existing.id !== node.id) {
        warnings.push({
          severity: 'warning',
          code: 'duplicate-entity',
          message: `核心概念「${node.key}」已在实体注册表里登记为 ${existing.id}（${existing.title}），这里却为它新建了节点 ${node.id}（${node.title}）：疑似重复建节点，别处应该用 cites / depends-on 引用已有实体（§9）。`,
          nodeId: node.id,
          field: 'key',
        });
      }
      continue;
    }
    const entity: EntityEntry = {
      id: node.id,
      key: node.key,
      title: node.title,
      aliases: [...(node.aliases ?? [])],
      firstSeen: firstSeenOf(node, nodesById, chapterOfNode),
    };
    entities.push(entity);
    byKey.set(entity.key, entity);
  }

  return entities;
}

/**
 * 分章 part 合并成 v9 图。
 *
 * 只补合并器负责的字段，v8 语义一行不改：
 * - `order`：同一 parentId 下按出现顺序 `(i + 1) * 1024`（跨 part 同父时接着排，避免撞号）；
 * - 时间戳：合并时刻，`createdAt === updatedAt`；
 * - 边 / 步骤 id：`<章id>-e001`、`<章id>-i001`，序号在整次合并里全局递增；
 * - `assertedBy`：一律 `'import'`；
 * - `anchors`：每个带 region 的资源一条，`pageLabel` 优先用 `opts.pageOffset`
 *   （manifest 的 `pageOffset.offset`），其次从 part 声明的页码区间反推，
 *   两者都定不下来就留空串，不猜。
 *
 * 节点 id 跨 part 重复直接抛错（ID 一旦分配不得改名）；资源文件属性缺失也直接抛错
 * （合并必须发生在资源流水线之后）。
 */
/** 边去重键：谓词 + 端点（对称谓词规范化）+ 语境 + 规范化条件 */
function edgeDedupKey(edge: PartEdge): string {
  const pair = canonicalizePair(edge.predicate, edge.from, edge.to);
  const condition = (edge.condition ?? '').replace(/\s+/g, '');
  return [edge.predicate, pair.from, pair.to, edge.contextId ?? '', condition].join('\u0000');
}

export function mergeBookParts(
  parts: BookPart[],
  book: BookMetaV9,
  opts: MergeOptions = {},
): MergeResult {
  const mergedAt = Date.now();
  const ordered = orderParts(parts);
  const explicitOffset =
    typeof opts.pageOffset === 'number' && Number.isInteger(opts.pageOffset) ? opts.pageOffset : null;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const steps: InferenceStep[] = [];
  const assets: AssetMeta[] = [];
  const anchors: SourceAnchor[] = [];
  const warnings: ValidationIssue[] = [];

  const ownerOf = new Map<string, string>();
  const chapterOfNode = new Map<string, string>();
  const orderCursors = new Map<string, number>();
  const assetIds = new Set<string>();
  const edgeOwners = new Map<string, string>();
  let edgeSeq = 0;
  let stepSeq = 0;

  for (const part of ordered) {
    for (const node of part.nodes) {
      const owner = ownerOf.get(node.id);
      if (owner !== undefined) {
        throw new Error(
          owner === part.meta.chapter
            ? `节点 id 冲突：${node.id} 在 ${part.meta.chapter} 的 part 内重复出现。ID 一旦分配不得改名，请回 Pass 1 清单核对（§0.1.2、§2）。`
            : `节点 id 冲突：${node.id} 同时出现在 ${owner} 与 ${part.meta.chapter} 两个分章 part 里。ID 一旦分配不得改名，请回 Pass 1 清单核对（§0.1.2、§2）。`,
        );
      }
      ownerOf.set(node.id, part.meta.chapter);
      chapterOfNode.set(node.id, part.meta.chapter);

      const parentKey = node.parentId ?? '';
      const index = (orderCursors.get(parentKey) ?? 0) + 1;
      orderCursors.set(parentKey, index);
      nodes.push(asNode(node, index * 1024, mergedAt));
    }

    for (const edge of part.edges) {
      // 多个 part 并行转写时，边界上会各写一份同样的关系。
      // 去重键与 validateGraphInvariants 一致：谓词 + 端点（对称谓词无序）+ 语境 + 规范化条件。
      // 同端点不同条件/语境的边是合法的数学断言，必须都留下。
      const key = edgeDedupKey(edge);
      const owner = edgeOwners.get(key);
      if (owner !== undefined) {
        warnings.push({
          severity: 'warning',
          code: 'duplicate-edge-merged',
          message:
            `关系 ${edge.from} -[${edge.predicate}]-> ${edge.to} 在 ${owner} 与 ${part.meta.chapter} 里各写了一份，` +
            '合并时保留前一份（§12）。如果两份的 condition/contextId 不同，它们不会被合并，请核对。',
          edgeId: undefined,
        });
        continue;
      }
      edgeOwners.set(key, part.meta.chapter);
      edgeSeq += 1;
      edges.push(asEdge(edge, sequenceId(part.meta.chapter, 'e', edgeSeq), mergedAt));
    }

    for (const step of part.steps) {
      stepSeq += 1;
      steps.push(asStep(step, sequenceId(part.meta.chapter, 'i', stepSeq), mergedAt));
    }

    for (const asset of part.assets) {
      if (assetIds.has(asset.id)) {
        throw new Error(
          `资源 id 冲突：${asset.id} 在 ${part.meta.chapter} 里重复出现（跨 part 或 part 内重复）。资源 id 由裁图流水线分配，不得重名。`,
        );
      }
      assetIds.add(asset.id);
      assets.push(assetMetaOf(asset));
      const anchor = anchorOf(asset, part.meta, explicitOffset ?? pageOffsetOf(part.meta));
      if (anchor) anchors.push(anchor);
    }
  }

  const entities = mergeEntityRegistry(nodes, chapterOfNode, opts.entities, warnings);

  return {
    graph: {
      schemaVersion: 9,
      exportedAt: mergedAt,
      book,
      nodes,
      edges,
      steps,
      anchors,
      assets,
    },
    entities,
    warnings,
  };
}
