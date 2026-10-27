import { z } from 'zod';
import { REGION_EPS } from './coords';

/**
 * 当前数据格式版本。Dexie 的 DB version 与它对齐（见 `db.ts`）：
 * 数据格式升到 v10 时，DB 也加 `this.version(10)`，库名始终保持 `textbook-graph`。
 */
export const SCHEMA_VERSION = 9 as const;

// =============================================================================
// 节点类型（恰好 9 种）
// =============================================================================
// 存储层用稳定的英文 key，显示层用中文。改文案不需要迁移数据。
//
// 定理 / 引理 / 推论 不是独立类型，而是 proposition 的 kind；
// 例题 / 练习 不是独立类型，而是 problem 的 kind；
// 章节 / 小节 不是独立类型，而是 section 的 kind。

const NODE_TYPES = [
  'branch', // 根知识分支（高中数学）
  'section', // 任意深度的知识目录
  'definition', // 概念及其定义
  'proposition', // 有真假意义的数学断言
  'proof', // 独立证明文本
  'problem', // 例题 / 练习 / 探究题
  'note', // 一般性讲解与学习内容
  'counterexample', // 否定某一断言的具体反例
  'attempt', // 一次个人解题过程
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/**
 * kind 是强类型属性：新建/编辑只能从对应枚举里选。
 * 导入历史数据时允许暂存未知 kind，但会给出警告（见 validateGraphInvariants）。
 */
export const KIND_OPTIONS: Record<NodeType, readonly string[]> = {
  branch: [],
  section: ['chapter', 'section', 'subsection', 'topic'],
  definition: ['notation'],
  proposition: ['theorem', 'lemma', 'corollary', 'property', 'formula', 'criterion', 'claim', 'law', 'principle', 'reaction'],
  proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
  problem: ['example', 'exercise', 'exploration', 'review'],
  note: [
    'explanation',
    'method',
    'summary',
    'history',
    'context',
    'topic',
    'remark',
    'experiment',
    'model',
    'phenomenon',
    'process',
    'structure',
  ],
  counterexample: ['numerical', 'geometric', 'other'],
  attempt: ['personal', 'review'],
};

export const KIND_LABELS: Record<string, string> = {
  chapter: '章',
  section: '节',
  subsection: '小节',
  topic: '主题',
  notation: '记号',
  theorem: '定理',
  lemma: '引理',
  corollary: '推论',
  property: '性质',
  formula: '公式',
  criterion: '判定',
  claim: '断言',
  law: '定律',
  principle: '原理',
  reaction: '化学反应',
  direct: '直接证明',
  contradiction: '反证法',
  induction: '归纳法',
  geometric: '几何法',
  other: '其他',
  example: '例题',
  exercise: '练习',
  exploration: '探究',
  review: '复习',
  explanation: '讲解',
  method: '方法',
  summary: '总结',
  history: '科学文化',
  context: '语境',
  remark: '备注',
  experiment: '实验',
  model: '模型',
  phenomenon: '现象',
  process: '过程',
  structure: '结构',
  numerical: '数值反例',
  personal: '个人解题',
};

interface NodeTypeMeta {
  /** 中文全称，用于徽章与选择器 */
  label: string;
  /** 树里的短前缀 */
  short: string;
  /** 是否参与教科书编号 */
  numbered: boolean;
  /** 是否可出现在目录树里 */
  inTree: boolean;
  /** kind 的中文标签函数 */
  kindLabel: (kind?: string) => string;
}

function labeler(fallbacks: Record<string, string>, def: string) {
  return (kind?: string) => (kind ? (fallbacks[kind] ?? KIND_LABELS[kind] ?? kind) : def);
}

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
  branch: { label: '分支', short: '', numbered: false, inTree: true, kindLabel: () => '分支' },
  section: { label: '章节', short: '', numbered: true, inTree: true, kindLabel: labeler({ chapter: '章' }, '节') },
  definition: { label: '定义', short: 'Def', numbered: true, inTree: true, kindLabel: labeler({}, '定义') },
  proposition: { label: '命题', short: 'Prop', numbered: true, inTree: true, kindLabel: labeler({}, '命题') },
  proof: { label: '证明', short: 'Pf', numbered: false, inTree: true, kindLabel: labeler({}, '证明') },
  problem: { label: '题目', short: 'Prob', numbered: true, inTree: true, kindLabel: labeler({ example: '例题', exercise: '练习' }, '题目') },
  note: { label: '笔记', short: 'Note', numbered: false, inTree: true, kindLabel: labeler({}, '笔记') },
  counterexample: { label: '反例', short: 'Cex', numbered: false, inTree: true, kindLabel: labeler({}, '反例') },
  attempt: { label: '解题记录', short: 'Try', numbered: false, inTree: false, kindLabel: labeler({}, '解题记录') },
};

/** 节点在界面上的完整类型名：命题 · 定理 */
export function typeLabel(node: { type: NodeType; kind?: string }): string {
  const meta = NODE_TYPE_META[node.type];
  const kindLabel = node.kind ? meta.kindLabel(node.kind) : '';
  if (!node.kind) return meta.label;
  if (node.type === 'section') return node.kind === 'chapter' ? '主章节' : kindLabel === '节' ? '子章节' : kindLabel;
  if (node.type === 'proposition' || node.type === 'problem') return kindLabel;
  // 理科学科的笔记类概念直接显示「实验 / 模型 / 过程」，不写成「笔记 · 实验」
  if (node.type === 'note' && ['experiment', 'model', 'phenomenon', 'process', 'structure'].includes(node.kind)) {
    return kindLabel;
  }
  return `${meta.label} · ${kindLabel}`;
}

export function isKnownKind(type: NodeType, kind?: string): boolean {
  if (!kind) return true;
  return KIND_OPTIONS[type].includes(kind);
}

/** 是否是「语境」节点：用 note(kind='context') 承担 */
export function isContextNode(node: { type: NodeType; kind?: string }): boolean {
  return node.type === 'note' && node.kind === 'context';
}

/** 只有题目有「标准答案」；命题的证明是独立的 proof 节点 */
export const SOLUTION_TYPES: ReadonlySet<NodeType> = new Set(['problem']);

/**
 * 结构规则：什么类型可以放进什么父节点（需求书 2.1）。
 * UI 的「新建」菜单和数据层校验共用这一张表。
 */
export function allowedChildTypes(parentType: NodeType | null): NodeType[] {
  if (parentType === null) return ['branch'];
  switch (parentType) {
    case 'branch':
      return ['section', 'note'];
    case 'section':
      return ['section', 'definition', 'proposition', 'proof', 'problem', 'note', 'counterexample'];
    case 'definition':
      return ['problem', 'note'];
    case 'proposition':
      return ['proof', 'counterexample', 'problem', 'note'];
    case 'proof':
      return ['note'];
    case 'problem':
      return ['attempt', 'note'];
    case 'note':
    case 'attempt':
    case 'counterexample':
      return ['note'];
    default:
      return ['note'];
  }
}

// =============================================================================
// 关系谓词（v8：原 9 种 + 3 种理科语义关系）
// =============================================================================

const PREDICATES = [
  'depends-on', // 学习前置（不是数学蕴含）
  'covers', // 题目考查的知识点
  'uses', // 证明/解法实际用到的依据
  'proves', // 证明 → 命题
  'refutes', // 反例 → 命题
  'implies', // A ⇒ B
  'iff', // A ⇔ B
  'generalizes', // 概念/命题的推广
  'cites', // 弱引用
  'supports', // 实验/观察 → 科学陈述
  'is-a', // 子类 → 上位类
  'part-of', // 组成部分 → 整体
] as const;

export type Predicate = (typeof PREDICATES)[number];

// =============================================================================
// 知识库级元信息（v8）
// =============================================================================

export const SUBJECTS = ['math', 'physics', 'chemistry', 'biology', 'science'] as const;
export type Subject = (typeof SUBJECTS)[number];

export const SUBJECT_LABELS: Record<Subject, string> = {
  math: '数学',
  physics: '物理',
  chemistry: '化学',
  biology: '生物学',
  science: '综合科学',
};

export const SCHOOL_STAGES = ['junior', 'senior'] as const;
export type SchoolStage = (typeof SCHOOL_STAGES)[number];

export const STAGE_LABELS: Record<SchoolStage, string> = {
  junior: '初中',
  senior: '高中',
};

/**
 * 一本教材自己的身份信息。
 * 这不是跨教材统一 ID：相同 title 的两份 JSON 仍然是两个互不相通的库。
 */
export interface BookMeta {
  subject: Subject;
  stage: SchoolStage;
  /** 如「八年级物理下册」 */
  title: string;
  /** 如「人教版」；可选 */
  edition?: string;
}

// =============================================================================
// 实体
// =============================================================================

export interface Citation {
  /** 来源（教材名、讲义、网页……） */
  source?: string;
  page?: string;
  /** 原书题号 / 定理号 */
  originalNumber?: string;
}

export interface AttemptMeta {
  /** 这次尝试是否做对 */
  correct?: boolean;
  /** 用时（分钟） */
  durationMin?: number;
  /** 方法标签：反证法 / 构造 / 归纳 … */
  method?: string;
}

export interface Node {
  id: string;
  type: NodeType;
  /** 各 type 对应的细分类，见 KIND_OPTIONS */
  kind?: string;
  title: string;
  /** 陈述 / 题干 / 正文，Markdown + LaTeX + 远程图片 */
  content: string;
  /** 仅 problem 使用：标准解答 */
  solution?: string;
  parentId: string | null;
  /** 兄弟间排序。间隔 1024，间隙耗尽时局部重排。 */
  order: number;
  /** 全局唯一的术语键，用于跨章节引用（如 'quadratic-function'） */
  key?: string;
  aliases?: string[];
  tags?: string[];
  citation?: Citation;
  /** 仅 type === 'attempt' 时使用 */
  attempt?: AttemptMeta;
  createdAt: number;
  updatedAt: number;
}

/** 编号来源：原书编号 / 软件生成 / 不显示 */
export type NumberSource = 'source' | 'generated' | 'none';

/** 渲染用的节点：附带算好的教科书编号 */
export type ProcessedNode = Node & {
  displayNumber: string;
  numberSource: NumberSource;
  isChapter: boolean;
};

/**
 * 边永远是 from 作为主语、to 作为宾语。
 * 「必要条件」在输入时归一化为 implies 反向，不存第二份。
 */
export interface Edge {
  id: string;
  from: string;
  to: string;
  predicate: Predicate;
  /** 前提条件，LaTeX / Markdown。数学蕴含几乎都带前提。 */
  condition?: string;
  note?: string;
  /** 语境：必须指向 note(kind='context')；缺省表示未说明语境 */
  contextId?: string;
  assertedBy: 'manual' | 'import';
  createdAt: number;
  updatedAt: number;
}

/**
 * 推理步骤（超边）。
 *
 * 二元边只能表达「任一前提足够」（OR）。数学里大量推理是
 * 「{A, B} 同时成立才推出 C」（AND）。
 */
export interface InferenceStep {
  id: string;
  /** 前提节点 id，至少一个；v5 起必须是 proposition */
  premiseIds: string[];
  conclusionId: string;
  /** 用了哪条规则/定理 */
  rule: string;
  contextId?: string;
  /** 这条推导属于哪个证明节点 */
  proofId?: string;
  note?: string;
  assertedBy: 'manual' | 'import';
  createdAt: number;
  updatedAt: number;
}

export interface GraphJSON {
  schemaVersion: 8;
  exportedAt: number;
  book: BookMeta;
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
}

// =============================================================================
// v9：本地媒体资源 + 出处锚点
// =============================================================================
// v9 只新增两张表，不动 v8 的任何字段语义：
//   assets  —— 本地图片等媒体（markdown 里写 asset://<id>）
//   anchors —— 教材出处锚点（页码 + 归一化区域 + 原文片段）
// v8 备份导入时自动补齐这两个空数组，见 migrations/v8-to-v9.ts。

/** 媒体资源的元信息；二进制内容不入 JSON，存在 IndexedDB 的 assets 表里 */
export interface AssetMeta {
  /** 与 markdown 里 asset://<id> 对应 */
  id: string;
  /** 包内相对路径，如 assets/img-001.png */
  path: string;
  mimeType: string;
  byteLength: number;
  /** 64 位小写 hex */
  sha256: string;
  alt: string;
  /** 原书图注原文；没有图注时不填，不要填空串 */
  caption?: string;
  /** 图片内在像素尺寸（裁图流水线回填），渲染时用来提前占位，避免加载后行高跳动 */
  width?: number;
  height?: number;
  originalName?: string;
}

/** 教材出处锚点：把节点定位到原书某页的某个区域 */
export interface SourceAnchor {
  id: string;
  nodeId: string;
  sourceId: string;
  pageLabel: string;
  /** 归一化到 0..1 的页面区域 */
  region?: { x: number; y: number; width: number; height: number };
  contentRange?: { start: number; end: number; contentHash: string };
}

/** v9 的教材元信息：比 v8 多出可选的出版信息 */
export interface BookMetaV9 extends BookMeta {
  bookId?: string;
  publisher?: string;
  publicationYear?: number;
  isbn?: string;
  volume?: string;
  sourceRevision?: string;
}

export interface GraphJSONV9 {
  schemaVersion: 9;
  exportedAt: number;
  book: BookMetaV9;
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
  anchors: SourceAnchor[];
  assets: AssetMeta[];
}

// =============================================================================
// 运行时校验（zod）
// =============================================================================

const bookMetaSchema = z.strictObject({
  subject: z.enum(SUBJECTS),
  stage: z.enum(SCHOOL_STAGES),
  title: z.string().min(1),
  edition: z.string().optional(),
});

const citationSchema = z.strictObject({
  source: z.string().optional(),
  page: z.string().optional(),
  originalNumber: z.string().optional(),
});

const attemptMetaSchema = z.strictObject({
  correct: z.boolean().optional(),
  durationMin: z.number().optional(),
  method: z.string().optional(),
});

const nodeSchema = z.strictObject({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
  // 历史数据的未知 kind 允许暂存，校验器会告警
  kind: z.string().optional(),
  title: z.string(),
  content: z.string(),
  solution: z.string().optional(),
  parentId: z.string().nullable(),
  order: z.number(),
  key: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  citation: citationSchema.optional(),
  attempt: attemptMetaSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const edgeSchema = z.strictObject({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  predicate: z.enum(PREDICATES),
  condition: z.string().optional(),
  note: z.string().optional(),
  contextId: z.string().optional(),
  assertedBy: z.enum(['manual', 'import']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const stepSchema = z.strictObject({
  id: z.string().min(1),
  premiseIds: z.array(z.string()).min(1),
  conclusionId: z.string().min(1),
  rule: z.string().min(1),
  contextId: z.string().optional(),
  proofId: z.string().optional(),
  note: z.string().optional(),
  assertedBy: z.enum(['manual', 'import']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const graphJSONSchema = z.strictObject({
  schemaVersion: z.literal(8),
  exportedAt: z.number(),
  book: bookMetaSchema,
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  steps: z.array(stepSchema).default([]),
});

// =============================================================================
// 运行时校验（zod，v9）
// =============================================================================

/** v9 的教材元信息：v8 字段不变，新增字段全部可选 */
export const bookMetaV9Schema = bookMetaSchema.extend({
  bookId: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  publicationYear: z.number().int().min(0).optional(),
  isbn: z.string().min(1).optional(),
  volume: z.string().min(1).optional(),
  sourceRevision: z.string().min(1).optional(),
});

/** sha256 只接受 64 位小写 hex */
export const ASSET_SHA256_RE = /^[0-9a-f]{64}$/;

export const assetMetaSchema = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  mimeType: z.string().min(1),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(ASSET_SHA256_RE),
  alt: z.string(),
  caption: z.string().optional(),
  /** 像素尺寸，正整数；老数据没有这两个字段也照常解析 */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  originalName: z.string().optional(),
});

/**
 * 归一化页面区域，坐标规范见 docs/plans/transcribe-spec.md §0.2.2：
 * 原点左上、x 向右、y 向下、归一化到 [0, 1]。
 *
 * 逐字段的 min/max 只能拦住单值越界，跨字段的「别超出页面」由两个 refine 保证；
 * 容差只吸收浮点噪声，越界就是错误，不做截断。
 */
const regionSchema = z
  .strictObject({
    x: z.number().finite().min(0).lt(1),
    y: z.number().finite().min(0).lt(1),
    width: z.number().finite().gt(0).max(1),
    height: z.number().finite().gt(0).max(1),
  })
  // JSON Schema 表达不了跨字段约束，至少把规则写进 description，外部工具能读到
  .describe('归一化页面区域（原点左上、y 向下）：x、y ∈ [0,1)，width、height ∈ (0,1]，且 x + width ≤ 1、y + height ≤ 1（容差 1e-6）。')
  .refine((region) => region.x + region.width <= 1 + REGION_EPS, {
    message: `region 超出页面右边界：x + width 必须 ≤ 1（容差 ${REGION_EPS}）。`,
    path: ['width'],
  })
  .refine((region) => region.y + region.height <= 1 + REGION_EPS, {
    message: `region 超出页面下边界：y + height 必须 ≤ 1（容差 ${REGION_EPS}）。`,
    path: ['height'],
  });

const contentRangeSchema = z
  .strictObject({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    contentHash: z.string().min(1),
  })
  .refine((range) => range.end >= range.start, {
    message: 'end 不能小于 start',
    path: ['end'],
  });

export const sourceAnchorSchema = z.strictObject({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  sourceId: z.string().min(1),
  pageLabel: z.string(),
  region: regionSchema.optional(),
  contentRange: contentRangeSchema.optional(),
});

export const graphJSONSchemaV9 = z.strictObject({
  schemaVersion: z.literal(9),
  exportedAt: z.number(),
  book: bookMetaV9Schema,
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  steps: z.array(stepSchema).default([]),
  anchors: z.array(sourceAnchorSchema).default([]),
  assets: z.array(assetMetaSchema).default([]),
});
