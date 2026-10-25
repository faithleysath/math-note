import { z } from 'zod';

// =============================================================================
// 节点类型
// =============================================================================
// 存储层用稳定的英文 key，显示层用中文。改文案不需要迁移数据。

export const NODE_TYPES = [
  'branch', // 分支（数学分析 / 高等代数 …）
  'chapter', // 主章节
  'section', // 子章节
  'definition', // 定义
  'theorem', // 定理
  'lemma', // 引理
  'corollary', // 推论
  'example', // 例题
  'exercise', // 练习
  'note', // 笔记
  'attempt', // 解题记录（练习/例题下的尝试）
  'proof', // 独立证明（挂在命题下，通过 proves 关联被证命题）
  'concept', // 跨章节共享的数学概念
  'context', // 语境 / 前提集合
  'counterexample', // 反例（反驳明确的命题）
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export interface NodeTypeMeta {
  /** 中文全称，用于徽章与选择器 */
  label: string;
  /** 树里的短前缀 */
  short: string;
  /** 是否参与教科书编号（定义 1.2.3 这种） */
  numbered: boolean;
  /** 是否可出现在目录树里 */
  inTree: boolean;
}

export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
  branch: { label: '分支', short: '', numbered: false, inTree: true },
  chapter: { label: '主章节', short: '', numbered: true, inTree: true },
  section: { label: '子章节', short: '', numbered: true, inTree: true },
  definition: { label: '定义', short: 'Def', numbered: true, inTree: true },
  theorem: { label: '定理', short: 'Th', numbered: true, inTree: true },
  lemma: { label: '引理', short: 'Lem', numbered: true, inTree: true },
  corollary: { label: '推论', short: 'Cor', numbered: true, inTree: true },
  example: { label: '例题', short: 'Eg', numbered: true, inTree: true },
  exercise: { label: '练习', short: 'Ex', numbered: true, inTree: true },
  note: { label: '笔记', short: 'Note', numbered: false, inTree: true },
  attempt: { label: '解题记录', short: 'Try', numbered: false, inTree: false },
  proof: { label: '证明', short: 'Pf', numbered: false, inTree: true },
  concept: { label: '概念', short: 'Con', numbered: false, inTree: true },
  context: { label: '语境', short: 'Ctx', numbered: false, inTree: true },
  counterexample: { label: '反例', short: 'Cex', numbered: false, inTree: true },
};

/** 教科书里会被编号的类型（定义 / 定理 / 引理 / 推论 / 例题 / 练习） */
export const NUMBERED_TYPES: ReadonlySet<NodeType> = new Set(
  NODE_TYPES.filter((t) => NODE_TYPE_META[t].numbered),
);

/** 可以承载「标准答案 / 教科书式证明」的类型 */
export const SOLUTION_TYPES: ReadonlySet<NodeType> = new Set([
  'theorem',
  'lemma',
  'corollary',
  'example',
  'exercise',
]);

/**
 * 结构规则：什么类型可以放进什么父节点。
 * UI 的「新建」菜单和数据层校验共用这一张表。
 */
export function allowedChildTypes(parentType: NodeType | null): NodeType[] {
  switch (parentType) {
    case null:
      return ['branch'];
    case 'branch':
      return ['chapter', 'concept', 'context'];
    case 'chapter':
      return ['section', 'note', 'concept', 'context'];
    case 'section':
      return ['definition', 'theorem', 'lemma', 'corollary', 'example', 'exercise', 'note', 'concept', 'context'];
    case 'definition':
      return ['example', 'note', 'concept'];
    case 'theorem':
      return ['lemma', 'corollary', 'example', 'proof', 'counterexample', 'note'];
    case 'lemma':
    case 'corollary':
      return ['example', 'proof', 'counterexample', 'note'];
    case 'example':
    case 'exercise':
      return ['attempt', 'note'];
    case 'concept':
    case 'context':
      return ['note'];
    default:
      return ['note'];
  }
}

// =============================================================================
// 关系谓词
// =============================================================================
// 只有 7 个。旧版的「是…的定义/定理/例题/练习题」由 type + parentId 派生，
// 「必要条件」是 implies 换方向，都不再单独存储。

export const PREDICATES = [
  'cites', // 提及 / 参考（弱关联，不传递）
  'depends-on', // 依赖（强关联，可传递）
  'proves', // 证明 / 支撑
  'refutes', // 反例 / 反驳
  'implies', // A ⇒ B
  'iff', // A ⇔ B
  'generalizes', // A 是 B 的推广
  'defines', // 定义刻画了某个概念
] as const;

export type Predicate = (typeof PREDICATES)[number];

// =============================================================================
// 实体
// =============================================================================

export interface Citation {
  book?: string;
  page?: string;
  theoremNo?: string;
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
  title: string;
  /** 陈述 / 题干 / 正文，Markdown + LaTeX */
  content: string;
  /** 教科书式证明 / 标准答案 */
  solution?: string;
  parentId: string | null;
  /** 兄弟间排序。间隔 1024，间隙耗尽时局部重排。 */
  order: number;
  /** 全局唯一的术语键，用于跨章节引用（如 'power-set'） */
  key?: string;
  aliases?: string[];
  tags?: string[];
  citation?: Citation;
  /** 仅 type === 'attempt' 时使用 */
  attempt?: AttemptMeta;
  createdAt: number;
  updatedAt: number;
}

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
  /** 语境：必须指向一个 context 节点；缺省表示「语境未知」，不当作全局成立 */
  contextId?: string;
  /** 结构化前提（节点 id 列表），用于条件不足时保留出处 */
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
 * 「{A, B} 同时成立才推出 C」（AND），例如：
 *   {f 在 [a,b] 上连续, [a,b] 是闭区间} ⇒ f 在 [a,b] 上有界
 * 拆成 A⇒C 和 B⇒C 两条二元边就都是假命题。
 *
 * 所以单独存一个对象：至少一个前提、一个结论、一个规则名。
 * 它不参与目录树、没有位置、也没有编号。
 */
export interface InferenceStep {
  id: string;
  /** 前提节点 id，至少一个；全部成立才能推出结论 */
  premiseIds: string[];
  conclusionId: string;
  /** 用了哪条规则/定理，例如「紧集上连续函数有界」 */
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
  schemaVersion: 2 | 3 | 4;
  exportedAt: number;
  nodes: Node[];
  edges: Edge[];
  /** v4 起才有；旧数据缺省为空数组 */
  steps?: InferenceStep[];
}

// =============================================================================
// 运行时校验（zod）
// =============================================================================

const citationSchema = z.object({
  book: z.string().optional(),
  page: z.string().optional(),
  theoremNo: z.string().optional(),
});

const attemptMetaSchema = z.object({
  correct: z.boolean().optional(),
  durationMin: z.number().optional(),
  method: z.string().optional(),
});

export const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES),
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
  schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  exportedAt: z.number(),
  nodes: z.array(nodeSchema),
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
