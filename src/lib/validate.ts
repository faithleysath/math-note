import type { GraphIndex } from './graph';
import { collectSubtree, findPath } from './graph';
import { validateAssetIntegrity } from './assets';
import { PREDICATE_SPECS, canonicalizePair, isEdgeAllowed } from './predicates';
import {
  KIND_OPTIONS,
  NODE_TYPE_META,
  SCHOOL_STAGES,
  SUBJECTS,
  allowedChildTypes,
  isContextNode,
  isKnownKind,
  type AssetMeta,
  type AttemptMeta,
  type BookMeta,
  type Citation,
  type Edge,
  type InferenceStep,
  type Node,
  type NodeType,
  type Predicate,
  type SourceAnchor,
} from './schema';

// =============================================================================
// 校验结果
// =============================================================================
// 一律返回「问题 + 位置 + 建议」，而不是抛一句看不懂的话。
// 错误 = 不能保存；警告 = 可以保存，但让人复核。

type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  field?: string;
  suggestion?: string;
}

export class ValidationError extends Error {
  field: string;
  issues: ValidationIssue[];

  constructor(field: string, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.issues = issues.length > 0 ? issues : [{ severity: 'error', code: 'invalid', message, field }];
  }
}

function errorOf(field: string, code: string, message: string, extra: Partial<ValidationIssue> = {}): ValidationError {
  return new ValidationError(field, message, [{ severity: 'error', code, message, field, ...extra }]);
}

export interface NewNodeInput {
  type: NodeType;
  kind?: string;
  title: string;
  content?: string;
  solution?: string;
  parentId: string | null;
  afterId?: string | null;
  key?: string;
  aliases?: string[];
  tags?: string[];
  citation?: Citation;
  attempt?: AttemptMeta;
}

export interface NodePatch {
  title?: string;
  kind?: string;
  content?: string;
  solution?: string;
  key?: string | null;
  aliases?: string[];
  tags?: string[];
  /** null 表示清空，undefined 表示不修改 */
  citation?: Citation | null;
  attempt?: AttemptMeta;
  parentId?: string | null;
}

export interface NewEdgeInput {
  from: string;
  to: string;
  predicate: Predicate;
  condition?: string;
  note?: string;
  contextId?: string;
  assertedBy?: Edge['assertedBy'];
}

// =============================================================================
// 节点校验
// =============================================================================

function assertTitle(title: string) {
  if (!title.trim()) {
    throw errorOf('title', 'empty-title', '标题不能为空。');
  }
}

function assertKind(type: NodeType, kind?: string) {
  if (!kind) return;
  if (!isKnownKind(type, kind)) {
    const allowed = KIND_OPTIONS[type].map((option) => KIND_OPTIONS[type].length && option).join('、');
    throw errorOf(
      'kind',
      'invalid-kind',
      allowed
        ? `「${NODE_TYPE_META[type].label}」不接受 kind="${kind}"。可选：${allowed}`
        : `「${NODE_TYPE_META[type].label}」没有 kind 分类，请留空。`,
    );
  }
}

function assertKeyUnique(index: GraphIndex, key: string, ignoreId?: string) {
  for (const node of index.nodes.values()) {
    if (node.key === key && node.id !== ignoreId) {
      throw errorOf('key', 'duplicate-key', `术语键 "${key}" 已被「${node.title}」占用。`, {
        nodeId: node.id,
        suggestion: '换一个术语键，或先修改占用它的节点。',
      });
    }
  }
}

function assertParentUsable(index: GraphIndex, parentId: string | null, type: NodeType) {
  if (parentId === null) {
    if (!allowedChildTypes(null).includes(type)) {
      throw errorOf('parentId', 'invalid-root-type', '只有「分支」可以作为根节点。');
    }
    return;
  }
  const parent = index.nodes.get(parentId);
  if (!parent) {
    throw errorOf('parentId', 'missing-parent', '父节点不存在。', { nodeId: parentId });
  }
  const allowed = allowedChildTypes(parent.type);
  if (!allowed.includes(type)) {
    throw errorOf(
      'parentId',
      'invalid-child-type',
      `「${NODE_TYPE_META[parent.type].label}」下不能放「${NODE_TYPE_META[type].label}」。`,
      {
        nodeId: parent.id,
        suggestion: `可选的类型：${allowed.map((item) => NODE_TYPE_META[item].label).join('、')}`,
      },
    );
  }
}

export function validateNewNode(index: GraphIndex, input: NewNodeInput): void {
  assertTitle(input.title);
  assertKind(input.type, input.kind);

  if (input.type === 'attempt') {
    const parent = input.parentId ? index.nodes.get(input.parentId) : undefined;
    if (!parent || parent.type !== 'problem') {
      throw errorOf('parentId', 'invalid-attempt-parent', '「解题记录」只能挂在题目下面。');
    }
  }

  assertParentUsable(index, input.parentId, input.type);

  if (input.key) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.key)) {
      throw errorOf('key', 'invalid-key', '术语键只能用小写字母、数字和连字符。');
    }
    assertKeyUnique(index, input.key);
  }

  if (input.type === 'branch' && input.parentId === null) {
    // 分支之间不重名，避免树上出现两个同名字段
    for (const node of index.nodes.values()) {
      if (node.type === 'branch' && node.title.trim() === input.title.trim()) {
        throw errorOf('title', 'duplicate-branch-title', `已存在同名分支「${input.title}」。`);
      }
    }
  }
}

export function validateNodePatch(index: GraphIndex, id: string, patch: NodePatch): void {
  const node = index.nodes.get(id);
  if (!node) throw errorOf('id', 'missing-node', '节点不存在。');

  if (patch.title !== undefined) assertTitle(patch.title);
  if (patch.kind !== undefined) {
    assertKind(node.type, patch.kind);
    assertKindChangeKeepsReferences(index, node, patch.kind);
    assertKindChangeKeepsEdges(index, node, patch.kind);
  }

  if (patch.key) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(patch.key)) {
      throw errorOf('key', 'invalid-key', '术语键只能用小写字母、数字和连字符。');
    }
    assertKeyUnique(index, patch.key, id);
  }

  if (patch.parentId !== undefined && patch.parentId !== node.parentId) {
    validateCanReparent(index, id, patch.parentId);
  }
}

/**
 * 修改 kind 可能让已存在的关系不再满足端点规则。
 * 例如把 supports 的实验起点改成普通讲解，边仍然在，但 Schema 已不合法。
 * 必须在保存前阻止，不能等到导出或下次导入才暴露。
 */
function assertKindChangeKeepsEdges(index: GraphIndex, node: Node, nextKind: string) {
  if ((node.kind ?? '') === nextKind) return;
  const patched: Node = { ...node, kind: nextKind || undefined };
  const incident = [
    ...(index.edgesFrom.get(node.id) ?? []),
    ...(index.edgesTo.get(node.id) ?? []),
  ];

  for (const edge of incident) {
    const fromNode = edge.from === node.id ? patched : index.nodes.get(edge.from);
    const toNode = edge.to === node.id ? patched : index.nodes.get(edge.to);
    if (!fromNode || !toNode) continue;
    if (isEdgeAllowed(edge.predicate, fromNode, toNode)) continue;

    const fromTitle = fromNode.title;
    const toTitle = toNode.title;
    throw errorOf(
      'kind',
      'kind-breaks-edge',
      `改成「${NODE_TYPE_META[node.type].kindLabel(nextKind || undefined)}」会让已有关系「${fromTitle} ${
        PREDICATE_HINT[edge.predicate]
      } ${toTitle}」不再合法。`,
      {
        nodeId: node.id,
        edgeId: edge.id,
        suggestion: '先删除或调整这条关系，再修改 kind；或者保留当前的细分分类。',
      },
    );
  }
}

/**
 * note(kind='context') 可能被关系和推理步骤当作语境引用。
 * 把它改成别的 kind 会让这些引用悬空，所以必须先解开引用。
 */
function assertKindChangeKeepsReferences(index: GraphIndex, node: Node, nextKind: string) {
  if (!isContextNode(node) || nextKind === 'context') return;

  const edgeCount = index.edges.filter((edge) => edge.contextId === node.id).length;
  const stepCount = index.steps.filter((step) => step.contextId === node.id).length;
  if (edgeCount === 0 && stepCount === 0) return;

  throw errorOf(
    'kind',
    'context-in-use',
    `「${node.title}」还被 ${edgeCount} 条关系、${stepCount} 个推理步骤当作语境引用，不能改成别的类型。`,
    {
      nodeId: node.id,
      suggestion: '先把这些关系的语境清空或换成别的语境节点，再修改 kind。',
    },
  );
}

function validateCanReparent(index: GraphIndex, id: string, newParentId: string | null): void {
  const node = index.nodes.get(id);
  if (!node) throw errorOf('id', 'missing-node', '节点不存在。');

  if (newParentId === null) {
    if (node.type !== 'branch') {
      throw errorOf('parentId', 'invalid-root-type', '只有「分支」可以移动到根节点。');
    }
    return;
  }

  if (newParentId === id) {
    throw errorOf('parentId', 'self-parent', '不能把节点移动到它自己下面。');
  }

  if (collectSubtree(index, id).includes(newParentId)) {
    throw errorOf('parentId', 'cyclic-parent', '不能把节点移动到它自己的子孙下面。');
  }

  assertParentUsable(index, newParentId, node.type);
}

// =============================================================================
// 边校验
// =============================================================================

const PREDICATE_HINT: Record<Predicate, string> = {
  'depends-on': '依赖',
  cites: '提及',
  proves: '证明',
  refutes: '反例',
  implies: '充分条件 / 必要条件',
  iff: '等价',
  generalizes: '推广 / 特例',
  covers: '考查',
  uses: '使用',
  supports: '支持',
  'is-a': '属于 / 包含',
  'part-of': '组成 / 由……组成',
};

function typeNames(types: NodeType[]): string {
  return types.map((type) => NODE_TYPE_META[type].label).join('、');
}

function normalizeCondition(condition?: string): string {
  return (condition ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 两条边是否算「同一条记录」。
 * 只有谓词、端点、语境、前提全都相同才算重复；
 * 相同端点但前提不同是两条不同的数学断言，必须都保留。
 */
type RelationKeyFields = Pick<Edge, 'predicate' | 'from' | 'to' | 'contextId' | 'condition'>;

/** 去重键：谓词 + 端点（对称谓词无序）+ 语境 + 规范化条件 */
function relationKey(edge: RelationKeyFields): string {
  const spec = PREDICATE_SPECS[edge.predicate];
  const endpoints = spec.symmetric
    ? [edge.from, edge.to].sort().join('|')
    : `${edge.from}|${edge.to}`;
  return [
    edge.predicate,
    endpoints,
    edge.contextId ?? '',
    normalizeCondition(edge.condition),
  ].join('::');
}

export function sameRelationKey(a: RelationKeyFields, b: RelationKeyFields): boolean {
  return relationKey(a) === relationKey(b);
}

interface EdgeCheckResult {
  warnings: ValidationIssue[];
}

/**
 * 校验一条新边。不合法直接抛 ValidationError；
 * 合法但可疑（互推、冗余等价、反向蕴含）返回警告，由调用方决定是否提示。
 */
export function validateNewEdge(index: GraphIndex, input: NewEdgeInput): EdgeCheckResult {
  const { from, to, predicate } = input;

  if (from === to) {
    throw errorOf('to', 'self-loop', '不能把节点连到它自己。');
  }

  const fromNode = index.nodes.get(from);
  const toNode = index.nodes.get(to);
  if (!fromNode) throw errorOf('from', 'missing-endpoint', '起点节点不存在。', { nodeId: from });
  if (!toNode) throw errorOf('to', 'missing-endpoint', '终点节点不存在。', { nodeId: to });

  const spec = PREDICATE_SPECS[predicate];

  if (!isEdgeAllowed(predicate, fromNode, toNode)) {
    const kindHint =
      predicate === 'supports'
        ? '起点必须是「实验」或「现象」笔记，终点必须是命题。'
        : '';
    throw errorOf(
      'predicate',
      'invalid-endpoint-type',
      `「${PREDICATE_HINT[predicate]}」不能用在「${NODE_TYPE_META[fromNode.type].label} → ${
        NODE_TYPE_META[toNode.type].label
      }」之间。${kindHint}起点须为 ${typeNames(spec.from)}，终点须为 ${typeNames(spec.to)}。`,
      {
        nodeId: from,
        suggestion:
          predicate === 'proves'
            ? '先把证明写成「证明」节点，再让它 proves 目标命题。'
            : predicate === 'refutes'
              ? '反例要用「反例」节点，并反驳一个明确的命题。'
              : predicate === 'supports'
                ? '实验与观察用 supports 支持科学陈述；proves 只用于理论证明。'
                : predicate === 'is-a' || predicate === 'part-of'
                  ? '这两个关系只连接两个「定义」节点，并且不能自指。'
                  : undefined,
      },
    );
  }

  if (input.contextId) {
    const context = index.nodes.get(input.contextId);
    if (!context || !isContextNode(context)) {
      throw errorOf('contextId', 'invalid-context', '语境必须指向一个「语境」节点（note, kind=context）。', {
        field: 'contextId',
      });
    }
  }

  const duplicate = index.edges.find((edge) => sameRelationKey(edge, input));
  if (duplicate) {
    throw errorOf('predicate', 'duplicate-edge', '这条关系已经存在了（谓词、端点、语境与前提都相同）。', {
      edgeId: duplicate.id,
    });
  }

  // 对称谓词仍然按规范化端点避免正反重复，但不同语境/前提可以是两条
  if (spec.symmetric) {
    const reverse = index.edges.find(
      (edge) =>
        edge.predicate === predicate &&
        edge.from === to &&
        edge.to === from &&
        normalizeCondition(edge.condition) === normalizeCondition(input.condition) &&
        (edge.contextId ?? '') === (input.contextId ?? ''),
    );
    if (reverse) {
      throw errorOf('predicate', 'duplicate-edge', '这条关系已经存在了（等价关系正反只存一条）。', {
        edgeId: reverse.id,
      });
    }
  }

  const warnings: ValidationIssue[] = [];

  // 只有学习前置关系要求 DAG；逻辑蕴含与等价允许成环
  if (spec.forbidCycle) {
    const path = findPath(index, to, from, predicate);
    if (path) {
      const titles = path.map((pathId) => index.nodes.get(pathId)?.title ?? pathId);
      throw errorOf(
        'predicate',
        'prerequisite-cycle',
        `前置学习关系成环：${[fromNode.title, ...titles].join(' → ')}。`,
        { suggestion: '删除其中一条，或改成一个汇总节点。注意这只影响学习顺序，不代表数学矛盾。' },
      );
    }
  }

  if (predicate === 'implies') {
    const reverse = index.edges.find(
      (edge) => edge.predicate === 'implies' && edge.from === to && edge.to === from,
    );
    if (reverse) {
      warnings.push({
        severity: 'warning',
        code: 'mutual-implication',
        message: `已存在反向蕴含（${toNode.title} ⇒ ${fromNode.title}）。两者同时成立通常意味着等价，可以保留，也可以改用「等价于」。`,
        edgeId: reverse.id,
      });
    }
  }

  if (predicate === 'iff') {
    // iff 三方环是合法的，只提示冗余
    const path = findPath(index, to, from, 'iff');
    if (path) {
      warnings.push({
        severity: 'warning',
        code: 'redundant-equivalence',
        message: '已经存在一条等价路径，这条边是冗余的，但允许保留。',
      });
    }
  }

  if (predicate === 'generalizes') {
    const reverse = index.edges.find(
      (edge) => edge.predicate === 'generalizes' && edge.from === to && edge.to === from,
    );
    if (reverse) {
      warnings.push({
        severity: 'warning',
        code: 'mutual-generalization',
        message: `${fromNode.title} 与 ${toNode.title} 互为推广，可能其实是同一个结论的不同说法，请人工核查。`,
        edgeId: reverse.id,
      });
    }
  }

  if (predicate === 'is-a' || predicate === 'part-of') {
    // 分类/组成允许非自指的环被人工保留，但先提示，避免把学习 DAG 规则机械套过来
    const path = findPath(index, to, from, predicate);
    if (path) {
      warnings.push({
        severity: 'warning',
        code: 'semantic-cycle',
        message: `这条「${PREDICATE_HINT[predicate]}」关系会形成一个环，请人工确认这是教材原意。`,
      });
    }
  }

  return { warnings };
}

// =============================================================================
// 推理步骤（超边）校验
// =============================================================================

/** 推理步骤的前提和结论都必须是 proposition */
const STEP_STATEMENT_TYPE: NodeType = 'proposition';

export interface NewStepInput {
  premiseIds: string[];
  conclusionId: string;
  rule: string;
  contextId?: string;
  proofId?: string;
  note?: string;
  assertedBy?: InferenceStep['assertedBy'];
}

function normalizedPremises(premiseIds: string[]): string[] {
  return [...new Set(premiseIds)].sort();
}

export function sameStepKey(
  a: Pick<InferenceStep, 'premiseIds' | 'conclusionId' | 'rule' | 'contextId'>,
  b: Pick<InferenceStep, 'premiseIds' | 'conclusionId' | 'rule' | 'contextId'>,
): boolean {
  if (a.conclusionId !== b.conclusionId) return false;
  if (a.rule.trim() !== b.rule.trim()) return false;
  if ((a.contextId ?? '') !== (b.contextId ?? '')) return false;
  return normalizedPremises(a.premiseIds).join('|') === normalizedPremises(b.premiseIds).join('|');
}

/**
 * 校验一个推理步骤：所有前提都成立才能推出结论。
 * 拆成 A⇒C、B⇒C 两条二元边是错的，所以这里要求前提至少一个、且不能自指。
 */
export function validateNewStep(index: GraphIndex, input: NewStepInput): void {
  if (input.premiseIds.length === 0) {
    throw errorOf('premiseIds', 'empty-premises', '推理步骤至少需要一个前提。');
  }

  const premiseIds = normalizedPremises(input.premiseIds);
  if (premiseIds.length !== input.premiseIds.length) {
    throw errorOf('premiseIds', 'duplicate-premise', '同一个前提不能重复添加。');
  }

  for (const premiseId of premiseIds) {
    const premise = index.nodes.get(premiseId);
    if (!premise) {
      throw errorOf('premiseIds', 'missing-premise', `前提节点 ${premiseId} 不存在。`);
    }
    if (premise.type !== STEP_STATEMENT_TYPE) {
      throw errorOf(
        'premiseIds',
        'invalid-premise-type',
        `「${NODE_TYPE_META[premise.type].label}」不是有真假意义的命题，不能作为推理前提。`,
        { suggestion: '定义与方法的依赖请用 uses 关系表达；推理前提必须是 proposition。' },
      );
    }
  }

  const conclusion = index.nodes.get(input.conclusionId);
  if (!conclusion) {
    throw errorOf('conclusionId', 'missing-conclusion', '结论节点不存在。');
  }
  if (conclusion.type !== STEP_STATEMENT_TYPE) {
    throw errorOf(
      'conclusionId',
      'invalid-conclusion-type',
      `结论必须是命题，不能是「${NODE_TYPE_META[conclusion.type].label}」。`,
    );
  }
  if (premiseIds.includes(input.conclusionId)) {
    throw errorOf('conclusionId', 'self-derivation', '结论不能同时是它的前提。');
  }

  if (!input.rule.trim()) {
    throw errorOf('rule', 'empty-rule', '请写清楚这条推理用的是什么规则或定理。');
  }

  if (input.contextId) {
    const context = index.nodes.get(input.contextId);
    if (!context || !isContextNode(context)) {
      throw errorOf('contextId', 'invalid-context', '语境必须指向一个「语境」节点。');
    }
  }

  if (input.proofId) {
    if (index.nodes.get(input.proofId)?.type !== 'proof') {
      throw errorOf('proofId', 'invalid-proof', '所属证明必须指向一个「证明」节点。');
    }
  }

  const duplicate = index.steps.find((step) => sameStepKey(step, input));
  if (duplicate) {
    throw errorOf('rule', 'duplicate-step', '同样的推理步骤已经存在了。', {
      edgeId: duplicate.id,
    });
  }
}

// =============================================================================
// 全图不变式
// =============================================================================

function parentChainHasCycle(nodes: Map<string, Node>): string[] {
  const cyclic: string[] = [];
  for (const node of nodes.values()) {
    const seen = new Set<string>([node.id]);
    let cursor = node.parentId;
    while (cursor) {
      if (seen.has(cursor)) {
        cyclic.push(node.id);
        break;
      }
      seen.add(cursor);
      cursor = nodes.get(cursor)?.parentId ?? null;
    }
  }
  return cyclic;
}

/** 新建/导入教材时的元信息校验。失败抛 ValidationError。 */
export function validateBook(book: Partial<BookMeta> | null | undefined): void {
  if (!book) {
    throw errorOf('book', 'missing-book', '缺少教材元信息（book）。');
  }
  if (!book.title || !book.title.trim()) {
    throw errorOf('book.title', 'empty-book-title', '教材名称不能为空。');
  }
  if (!book.subject || !(SUBJECTS as readonly string[]).includes(book.subject)) {
    throw errorOf('book.subject', 'invalid-subject', '请选择合法的学科。');
  }
  if (!book.stage || !(SCHOOL_STAGES as readonly string[]).includes(book.stage)) {
    throw errorOf('book.stage', 'invalid-stage', '请选择初中或高中。');
  }
}

function bookIssues(book: BookMeta | null | undefined): ValidationIssue[] {
  // 低层不变式校验允许不传 book（单元测试/局部图）；parseGraph 一定传入 v8 的 book
  if (book === undefined) return [];
  if (!book) {
    return [{ severity: 'error', code: 'missing-book', message: '缺少教材元信息（book）。', field: 'book' }];
  }
  const issues: ValidationIssue[] = [];
  if (!book.title?.trim()) {
    issues.push({ severity: 'error', code: 'empty-book-title', message: '教材名称不能为空。', field: 'book.title' });
  }
  if (!(SUBJECTS as readonly string[]).includes(book.subject)) {
    issues.push({
      severity: 'error',
      code: 'invalid-subject',
      message: `教材学科 "${String(book.subject)}" 不合法。`,
      field: 'book.subject',
    });
  }
  if (!(SCHOOL_STAGES as readonly string[]).includes(book.stage)) {
    issues.push({
      severity: 'error',
      code: 'invalid-stage',
      message: `学段 "${String(book.stage)}" 不合法。`,
      field: 'book.stage',
    });
  }
  return issues;
}

/**
 * 全图校验：导入、快照加载、迁移前都要跑。
 * 纯函数，不修改数据。
 *
 * v9 的资产 / 锚点检查只在调用方传了 `assets` 或 `anchors` 时才跑（也可以用
 * `options.checkAssets === false` 显式关掉）；老调用点只传 v8 的四个字段，
 * 行为与以前完全一致。
 */
export function validateGraphInvariants(
  graph: {
    book?: BookMeta | null;
    nodes: Node[];
    edges: Edge[];
    steps?: InferenceStep[];
    assets?: AssetMeta[];
    anchors?: SourceAnchor[];
  },
  options: { checkAssets?: boolean } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = bookIssues(graph.book);
  const nodes = new Map<string, Node>();

  if (options.checkAssets !== false && (graph.assets !== undefined || graph.anchors !== undefined)) {
    issues.push(
      ...validateAssetIntegrity({ nodes: graph.nodes, assets: graph.assets, anchors: graph.anchors }),
    );
  }

  for (const node of graph.nodes) {
    if (nodes.has(node.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-node-id',
        message: `节点 id 重复：${node.id}`,
        nodeId: node.id,
      });
      continue;
    }
    if (!(node.type in NODE_TYPE_META)) {
      issues.push({
        severity: 'error',
        code: 'unknown-node-type',
        message: `节点「${node.title}」的类型 "${node.type}" 不是 v5 支持的 9 种类型之一。`,
        nodeId: node.id,
        field: 'type',
      });
      continue;
    }
    nodes.set(node.id, node);

    if (!node.title.trim()) {
      issues.push({
        severity: 'error',
        code: 'empty-title',
        message: `节点 ${node.id} 的标题为空。`,
        nodeId: node.id,
        field: 'title',
      });
    }
    if (!isKnownKind(node.type, node.kind)) {
      issues.push({
        severity: 'warning',
        code: 'unknown-kind',
        message: `节点「${node.title}」的 kind="${node.kind}" 不在「${NODE_TYPE_META[node.type].label}」的分类里，已暂存但不会被识别。`,
        nodeId: node.id,
        field: 'kind',
      });
    }
    if (!Number.isFinite(node.order)) {
      issues.push({
        severity: 'error',
        code: 'invalid-order',
        message: `节点「${node.title}」的排序值不是数字。`,
        nodeId: node.id,
        field: 'order',
      });
    }
  }

  const keys = new Map<string, string>();
  for (const node of nodes.values()) {
    if (!node.key) continue;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(node.key)) {
      issues.push({
        severity: 'error',
        code: 'invalid-key',
        message: `节点「${node.title}」的术语键格式不合法：${node.key}`,
        nodeId: node.id,
        field: 'key',
      });
    }
    const owner = keys.get(node.key);
    if (owner) {
      issues.push({
        severity: 'error',
        code: 'duplicate-key',
        message: `术语键 ${node.key} 被多个节点占用（${owner} 与 ${node.id}）。`,
        nodeId: node.id,
        field: 'key',
      });
    } else {
      keys.set(node.key, node.id);
    }
  }

  for (const node of nodes.values()) {
    if (node.parentId === null) {
      if (node.type !== 'branch') {
        issues.push({
          severity: 'error',
          code: 'invalid-root-type',
          message: `根节点「${node.title}」只能是分支。`,
          nodeId: node.id,
          field: 'parentId',
        });
      }
      continue;
    }
    const parent = nodes.get(node.parentId);
    if (!parent) {
      issues.push({
        severity: 'error',
        code: 'missing-parent',
        message: `节点「${node.title}」的父节点 ${node.parentId} 不存在。`,
        nodeId: node.id,
        field: 'parentId',
      });
      continue;
    }
    if (!allowedChildTypes(parent.type).includes(node.type)) {
      issues.push({
        severity: 'error',
        code: 'invalid-child-type',
        message: `「${NODE_TYPE_META[parent.type].label}」下不能放「${NODE_TYPE_META[node.type].label}」（${node.title}）。`,
        nodeId: node.id,
        field: 'parentId',
      });
    }
  }

  for (const nodeId of parentChainHasCycle(nodes)) {
    issues.push({
      severity: 'error',
      code: 'cyclic-parent',
      message: `节点 ${nodeId} 的父链成环。`,
      nodeId,
      field: 'parentId',
    });
  }

  const edgeIds = new Set<string>();
  const edges = graph.edges;

  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-edge-id',
        message: `关系 id 重复：${edge.id}`,
        edgeId: edge.id,
      });
      continue;
    }
    edgeIds.add(edge.id);

    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);
    if (!fromNode || !toNode) {
      issues.push({
        severity: 'error',
        code: 'missing-endpoint',
        message: `关系 ${edge.id} 指向不存在的节点。`,
        edgeId: edge.id,
      });
      continue;
    }

    if (edge.from === edge.to) {
      issues.push({
        severity: 'error',
        code: 'self-loop',
        message: `关系 ${edge.id} 把「${fromNode.title}」连到了它自己。`,
        edgeId: edge.id,
      });
    }

    const spec = PREDICATE_SPECS[edge.predicate];
    if (!isEdgeAllowed(edge.predicate, fromNode, toNode)) {
      issues.push({
        severity: 'error',
        code: 'invalid-endpoint-type',
        message: `关系 ${edge.id}（${PREDICATE_HINT[edge.predicate]}）不能用在「${NODE_TYPE_META[fromNode.type].label} → ${NODE_TYPE_META[toNode.type].label}」之间${
          edge.predicate === 'supports' ? '；起点必须是实验或现象笔记' : ''
        }。`,
        edgeId: edge.id,
      });
    }

    const contextNode = edge.contextId ? nodes.get(edge.contextId) : undefined;
    if (edge.contextId && (!contextNode || !isContextNode(contextNode))) {
      issues.push({
        severity: 'error',
        code: 'invalid-context',
        message: `关系 ${edge.id} 的语境 ${edge.contextId} 不是语境节点（note, kind=context）。`,
        edgeId: edge.id,
        field: 'contextId',
      });
    }

    if (spec.symmetric) {
      const canonical = canonicalizePair(edge.predicate, edge.from, edge.to);
      if (canonical.from !== edge.from) {
        issues.push({
          severity: 'warning',
          code: 'non-canonical-symmetric',
          message: `对称关系 ${edge.id} 没有按规范方向存储，读写仍然正确，但建议整理。`,
          edgeId: edge.id,
        });
      }
    }
  }

  // 重复关系（同谓词 + 同端点 + 同语境 + 同前提），用哈希键避免 O(n²)
  const seenRelations = new Map<string, Edge>();
  for (const edge of edges) {
    const key = relationKey(edge);
    const other = seenRelations.get(key);
    if (other) {
      issues.push({
        severity: 'error',
        code: 'duplicate-edge',
        message: `关系 ${edge.id} 与 ${other.id} 完全相同。`,
        edgeId: edge.id,
      });
    } else {
      seenRelations.set(key, edge);
    }
  }

  // 只有学习前置关系要求无环
  const dependsEdges = edges.filter((edge) => edge.predicate === 'depends-on');
  if (dependsEdges.length > 0) {
    const adjacency = new Map<string, string[]>();
    for (const edge of dependsEdges) {
      const list = adjacency.get(edge.from);
      if (list) list.push(edge.to);
      else adjacency.set(edge.from, [edge.to]);
    }
    const state = new Map<string, 0 | 1 | 2>();
    const reported = new Set<string>();

    const visit = (start: string) => {
      const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
      state.set(start, 1);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const next = adjacency.get(frame.id)?.[frame.i];
        frame.i += 1;
        if (next === undefined) {
          state.set(frame.id, 2);
          stack.pop();
          continue;
        }
        const nextState = state.get(next);
        if (nextState === 1) {
          if (!reported.has(next)) {
            reported.add(next);
            issues.push({
              severity: 'error',
              code: 'prerequisite-cycle',
              message: `前置学习关系成环（涉及 ${next}）。`,
              nodeId: next,
              suggestion: '删除环上的一条依赖，这不代表数学矛盾。',
            });
          }
        } else if (nextState === undefined) {
          state.set(next, 1);
          stack.push({ id: next, i: 0 });
        }
      }
    };

    for (const id of adjacency.keys()) {
      if (state.get(id) === undefined) visit(id);
    }
  }

  // is-a / part-of 的环只提示，不当作学习前置那样拒绝
  for (const predicate of ['is-a', 'part-of'] as const) {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.predicate !== predicate) continue;
      const list = adjacency.get(edge.from);
      if (list) list.push(edge.to);
      else adjacency.set(edge.from, [edge.to]);
    }
    const state = new Map<string, 0 | 1 | 2>();
    let reported = false;
    const visit = (start: string) => {
      const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
      state.set(start, 1);
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const next = adjacency.get(frame.id)?.[frame.i];
        frame.i += 1;
        if (next === undefined) {
          state.set(frame.id, 2);
          stack.pop();
          continue;
        }
        const nextState = state.get(next);
        if (nextState === 1) {
          if (!reported) {
            reported = true;
            issues.push({
              severity: 'warning',
              code: 'semantic-cycle',
              message: `「${predicate === 'is-a' ? '属于' : '组成'}」关系里存在一个环，请人工确认是否符合教材原意。`,
            });
          }
        } else if (nextState === undefined) {
          state.set(next, 1);
          stack.push({ id: next, i: 0 });
        }
      }
    };
    for (const id of adjacency.keys()) {
      if (state.get(id) === undefined) visit(id);
    }
  }

  // 证明节点没有 proves 边时只是草稿，给出提示而不是拒绝
  for (const node of nodes.values()) {
    if (node.type !== 'proof') continue;
    if (!edges.some((edge) => edge.from === node.id && edge.predicate === 'proves')) {
      issues.push({
        severity: 'warning',
        code: 'proof-without-proves',
        message: `证明「${node.title}」还没有用 proves 指向任何命题。`,
        nodeId: node.id,
      });
    }
  }

  // ---- 推理步骤 ----
  const stepIds = new Set<string>();
  const steps = graph.steps ?? [];

  for (const step of steps) {
    if (stepIds.has(step.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-step-id',
        message: `推理步骤 id 重复：${step.id}`,
      });
      continue;
    }
    stepIds.add(step.id);

    if (step.premiseIds.length === 0) {
      issues.push({
        severity: 'error',
        code: 'empty-premises',
        message: `推理步骤 ${step.id} 没有前提。`,
      });
      continue;
    }

    for (const premiseId of step.premiseIds) {
      const premise = nodes.get(premiseId);
      if (!premise) {
        issues.push({
          severity: 'error',
          code: 'missing-premise',
          message: `推理步骤 ${step.id} 的前提 ${premiseId} 不存在。`,
        });
        continue;
      }
      if (premise.type !== STEP_STATEMENT_TYPE) {
        issues.push({
          severity: 'error',
          code: 'invalid-premise-type',
          message: `推理步骤 ${step.id} 把「${NODE_TYPE_META[premise.type].label}」当成前提（必须是 proposition）。`,
        });
      }
    }

    const conclusion = nodes.get(step.conclusionId);
    if (!conclusion) {
      issues.push({
        severity: 'error',
        code: 'missing-conclusion',
        message: `推理步骤 ${step.id} 的结论 ${step.conclusionId} 不存在。`,
      });
    } else if (conclusion.type !== STEP_STATEMENT_TYPE) {
      issues.push({
        severity: 'error',
        code: 'invalid-conclusion-type',
        message: `推理步骤 ${step.id} 的结论必须是 proposition。`,
      });
    }

    if (step.premiseIds.includes(step.conclusionId)) {
      issues.push({
        severity: 'error',
        code: 'self-derivation',
        message: `推理步骤 ${step.id} 的结论同时是它的前提。`,
      });
    }

    if (!step.rule.trim()) {
      issues.push({
        severity: 'error',
        code: 'empty-rule',
        message: `推理步骤 ${step.id} 没有写规则。`,
      });
    }

    const stepContext = step.contextId ? nodes.get(step.contextId) : undefined;
    if (step.contextId && (!stepContext || !isContextNode(stepContext))) {
      issues.push({
        severity: 'error',
        code: 'invalid-context',
        message: `推理步骤 ${step.id} 的语境 ${step.contextId} 不是语境节点（note, kind=context）。`,
      });
    }

    if (step.proofId && nodes.get(step.proofId)?.type !== 'proof') {
      issues.push({
        severity: 'error',
        code: 'invalid-proof',
        message: `推理步骤 ${step.id} 的所属证明 ${step.proofId} 不是证明节点。`,
      });
    }
  }

  const seenSteps = new Set<string>();
  for (const step of steps) {
    const key = [
      step.conclusionId,
      step.rule.trim(),
      step.contextId ?? '',
      [...step.premiseIds].sort().join(','),
    ].join('::');
    if (seenSteps.has(key)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-step',
        message: `推理步骤 ${step.id} 与已有步骤完全相同。`,
      });
    } else {
      seenSteps.add(key);
    }
  }

  return issues;
}
