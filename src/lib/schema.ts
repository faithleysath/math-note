import { z } from 'zod';

// =============================================================================
// 节点类型（恰好 9 种）
// =============================================================================
// 存储层用稳定的英文 key，显示层用中文。改文案不需要迁移数据。
//
// 定理 / 引理 / 推论 不是独立类型，而是 proposition 的 kind；
// 例题 / 练习 不是独立类型，而是 problem 的 kind；
// 章节 / 小节 不是独立类型，而是 section 的 kind。

export const NODE_TYPES = [
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
  proposition: ['theorem', 'lemma', 'corollary', 'property', 'formula', 'criterion', 'claim'],
  proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
  problem: ['example', 'exercise', 'exploration', 'review'],
  note: ['explanation', 'method', 'summary', 'history', 'context', 'topic', 'remark'],
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
  history: '数学文化',
  context: '语境',
  remark: '备注',
  numerical: '数值反例',
  personal: '个人解题',
};

export interface NodeTypeMeta {
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
  return `${meta.label} · ${kindLabel}`;
}

export function isKnownKind(type: NodeType, kind?: string): boolean {
  if (!kind) return true;
  return KIND_OPTIONS[type].includes(kind);
}

/** 是否是「语境」节点：v5 用 note(kind='context') 承担 */
export function isContextNode(node: { type: NodeType; kind?: string }): boolean {
  return node.type === 'note' && node.kind === 'context';
}

/** 是否是「方法」节点：depends-on / covers / uses 的目标之一 */
export function isMethodNote(node: { type: NodeType; kind?: string }): boolean {
  return node.type === 'note' && node.kind === 'method';
}

/** 可以承载「标准答案 / 教科书式证明」的类型 */
export const SOLUTION_TYPES: ReadonlySet<NodeType> = new Set([
  'proposition',
  'problem',
  'proof',
]);

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
// 关系谓词（恰好 9 种）
// =============================================================================

export const PREDICATES = [
  'depends-on', // 学习前置（不是数学蕴含）
  'covers', // 题目考查的知识点
  'uses', // 证明/解法实际用到的依据
  'proves', // 证明 → 命题
  'refutes', // 反例 → 命题
  'implies', // A ⇒ B
  'iff', // A ⇔ B
  'generalizes', // 概念/命题的推广
  'cites', // 弱引用
] as const;

export type Predicate = (typeof PREDICATES)[number];

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
  /** problem 的标准解答；proof 的遗留证明文本 */
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

/** 导入旧版本时允许出现历史类型字符串 */
export type AnyNode = Omit<Node, 'type'> & { type: string };

/** 渲染用的节点：附带算好的教科书编号 */
export type ProcessedNode = Node & { displayNumber: string; isChapter: boolean };

export type EdgeStatus = 'asserted' | 'conjecture' | 'disproven';

/**
 * 审核级别。人工读过不能冒充机器验证：
 * formally-checked 只能由真正的形式化检查器写入。
 */
export type ReviewState = 'unreviewed' | 'human-reviewed' | 'formally-checked';

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  unreviewed: '未审核',
  'human-reviewed': '人工审核',
  'formally-checked': '形式化验证',
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
  status?: EdgeStatus;
  /** 审核状态，缺省视为 unreviewed */
  reviewState?: ReviewState;
  /** 语境：必须指向 note(kind='context')；缺省表示「语境未知」，不当作全局成立 */
  contextId?: string;
  /** 结构化前提（节点 id 列表） */
  assumptionIds?: string[];
  assertedBy: 'manual' | 'ai' | 'import';
  model?: string;
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
  status?: EdgeStatus;
  reviewState?: ReviewState;
  note?: string;
  assertedBy: 'manual' | 'ai' | 'import';
  createdAt: number;
  updatedAt: number;
}

export interface GraphJSON {
  schemaVersion: 2 | 3 | 4 | 5;
  exportedAt: number;
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
}

// =============================================================================
// 运行时校验（zod）
// =============================================================================

const citationSchema = z.object({
  source: z.string().optional(),
  page: z.string().optional(),
  originalNumber: z.string().optional(),
  // 兼容 v4 的字段名
  book: z.string().optional(),
  theoremNo: z.string().optional(),
});

const attemptMetaSchema = z.object({
  correct: z.boolean().optional(),
  durationMin: z.number().optional(),
  method: z.string().optional(),
});

export const rawNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
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

export const nodeSchema = rawNodeSchema.extend({
  type: z.enum(NODE_TYPES),
});

export const edgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  predicate: z.enum(PREDICATES),
  condition: z.string().optional(),
  note: z.string().optional(),
  status: z.enum(['asserted', 'conjecture', 'disproven']).optional(),
  reviewState: z.enum(['unreviewed', 'human-reviewed', 'formally-checked']).optional(),
  contextId: z.string().optional(),
  assumptionIds: z.array(z.string()).optional(),
  assertedBy: z.enum(['manual', 'ai', 'import']),
  model: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const stepSchema = z.object({
  id: z.string().min(1),
  premiseIds: z.array(z.string()).min(1),
  conclusionId: z.string().min(1),
  rule: z.string().min(1),
  contextId: z.string().optional(),
  proofId: z.string().optional(),
  status: z.enum(['asserted', 'conjecture', 'disproven']).optional(),
  reviewState: z.enum(['unreviewed', 'human-reviewed', 'formally-checked']).optional(),
  note: z.string().optional(),
  assertedBy: z.enum(['manual', 'ai', 'import']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const graphJSONSchema = z.object({
  schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  exportedAt: z.number(),
  nodes: z.array(rawNodeSchema),
  edges: z.array(edgeSchema),
  steps: z.array(stepSchema).optional(),
});

// =============================================================================
// AI 操作协议
// =============================================================================

export const aiOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create-node'),
    /** 同一批操作内部引用用的临时名，后续用 "ref:名字" 指代 */
    ref: z.string().optional(),
    parentId: z.string(),
    after: z.string().nullable().optional(),
    type: z.enum(NODE_TYPES),
    kind: z.string().optional(),
    title: z.string(),
    content: z.string().default(''),
    solution: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal('update-node'),
    id: z.string(),
    ref: z.string().optional(),
    title: z.string().optional(),
    kind: z.string().optional(),
    content: z.string().optional(),
    solution: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal('delete-node'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('create-edge'),
    from: z.string(),
    to: z.string(),
    predicate: z.enum(PREDICATES),
    condition: z.string().optional(),
    note: z.string().optional(),
    contextId: z.string().optional(),
    assumptionIds: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal('delete-edge'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('create-step'),
    premiseIds: z.array(z.string()).min(1),
    conclusionId: z.string(),
    rule: z.string(),
    contextId: z.string().optional(),
    proofId: z.string().optional(),
  }),
  z.object({
    op: z.literal('delete-step'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('select'),
    id: z.string(),
  }),
]);

export type AiOperation = z.infer<typeof aiOperationSchema>;

export const aiOperationListSchema = z.object({
  operations: z.array(aiOperationSchema),
});
