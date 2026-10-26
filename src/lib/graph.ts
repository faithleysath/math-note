import {
  typeLabel,
  type Edge,
  type EdgeStatus,
  type InferenceStep,
  type Node,
  type NodeType,
  type Predicate,
} from './schema';
import { PREDICATE_SPECS, isLogicalPredicate } from './predicates';

/** 兄弟节点排序间隔 */
export const ORDER_GAP = 1024;

// =============================================================================
// 内存索引
// =============================================================================
// 持久化层只存 parentId + order 两个字段；children / 祖先 / 编号全部是派生数据，
// 每次图变更时整体重建（几千节点是毫秒级），永远不会出现「双真相」不一致。

export interface GraphIndex {
  nodes: Map<string, Node>;
  edges: Edge[];
  /** key 为 parentId，根节点用 null */
  childrenOf: Map<string | null, string[]>;
  edgesFrom: Map<string, Edge[]>;
  edgesTo: Map<string, Edge[]>;
  /** 顶层分支 id，按 order 排序 */
  roots: string[];
  /** id → 教科书编号（无编号的节点不在表里） */
  numbering: Map<string, string>;
  /** 推理步骤（超边） */
  steps: InferenceStep[];
  stepsByConclusion: Map<string, InferenceStep[]>;
  stepsByPremise: Map<string, InferenceStep[]>;
}

export function buildIndex(
  nodeIterable: Iterable<Node>,
  edges: Edge[],
  steps: InferenceStep[] = [],
): GraphIndex {
  const nodes = new Map<string, Node>();
  for (const node of nodeIterable) nodes.set(node.id, node);

  const childrenOf = new Map<string | null, string[]>();
  for (const node of nodes.values()) {
    const key = node.parentId;
    const list = childrenOf.get(key);
    if (list) list.push(node.id);
    else childrenOf.set(key, [node.id]);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => {
      const nodeA = nodes.get(a);
      const nodeB = nodes.get(b);
      const orderA = nodeA ? nodeA.order : 0;
      const orderB = nodeB ? nodeB.order : 0;
      return orderA - orderB || a.localeCompare(b);
    });
  }

  const edgesFrom = new Map<string, Edge[]>();
  const edgesTo = new Map<string, Edge[]>();
  for (const edge of edges) {
    const from = edgesFrom.get(edge.from);
    if (from) from.push(edge);
    else edgesFrom.set(edge.from, [edge]);
    const to = edgesTo.get(edge.to);
    if (to) to.push(edge);
    else edgesTo.set(edge.to, [edge]);
  }

  const roots = (childrenOf.get(null) ?? []).filter((id) => {
    const node = nodes.get(id);
    return node ? node.type === 'branch' : false;
  });

  const stepsByConclusion = new Map<string, InferenceStep[]>();
  const stepsByPremise = new Map<string, InferenceStep[]>();
  for (const step of steps) {
    const byConclusion = stepsByConclusion.get(step.conclusionId);
    if (byConclusion) byConclusion.push(step);
    else stepsByConclusion.set(step.conclusionId, [step]);

    for (const premiseId of step.premiseIds) {
      const byPremise = stepsByPremise.get(premiseId);
      if (byPremise) byPremise.push(step);
      else stepsByPremise.set(premiseId, [step]);
    }
  }

  return {
    nodes,
    edges,
    childrenOf,
    edgesFrom,
    edgesTo,
    roots,
    numbering: computeNumbering(nodes, childrenOf),
    steps,
    stepsByConclusion,
    stepsByPremise,
  };
}

// =============================================================================
// 教科书编号
// =============================================================================
// 编号是「路径」的纯函数，不是数组下标的函数。
// 第 a 章 / § a.b / 定理 a.b.c，与渲染顺序、当前展开哪个分支完全无关。

function computeNumbering(
  nodes: Map<string, Node>,
  childrenOf: Map<string | null, string[]>,
): Map<string, string> {
  const numbering = new Map<string, string>();
  const counters = new Map<string, number>();

  const bump = (containerId: string, key: string): number => {
    const counterKey = `${containerId}|${key}`;
    const next = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, next);
    return next;
  };

  interface Ctx {
    /** 祖先 section 的序号路径，例如 [1, 2] 表示 1.2 */
    path: number[];
    containerId: string;
  }

  const visit = (id: string, ctx: Ctx) => {
    const node = nodes.get(id);
    if (!node) return;
    let childCtx: Ctx = ctx;

    switch (node.type) {
      case 'branch': {
        childCtx = { path: [], containerId: id };
        break;
      }
      case 'section': {
        // section 可以任意嵌套：编号来自祖先 section 路径，不写死两层
        const position = bump(ctx.containerId, '__section');
        const path = [...ctx.path, position];
        const isChapter = node.kind === 'chapter' || (node.kind === undefined && path.length === 1);
        numbering.set(id, isChapter ? `第 ${position} 章` : path.join('.'));
        childCtx = { path, containerId: id };
        break;
      }
      case 'definition': {
        const position = bump(ctx.containerId, 'definition');
        numbering.set(id, prefixNumber('定义', ctx.path, position));
        break;
      }
      case 'proposition':
      case 'problem': {
        // 同一 kind 各自计数，保证迁移后「定理 1.1.2」这类编号不变
        const kind = node.kind ?? (node.type === 'proposition' ? 'theorem' : 'example');
        const position = bump(ctx.containerId, `${node.type}:${kind}`);
        numbering.set(id, prefixNumber(typeLabel(node), ctx.path, position));
        break;
      }
      default:
        break;
    }

    for (const childId of childrenOf.get(id) ?? []) visit(childId, childCtx);
  };

  for (const rootId of childrenOf.get(null) ?? []) visit(rootId, { path: [], containerId: 'root' });
  return numbering;
}

function prefixNumber(label: string, path: number[], position: number): string {
  const prefix = path.join('.');
  return prefix ? `${label} ${prefix}.${position}` : `${label} ${position}`;
}

// =============================================================================
// 树遍历
// =============================================================================

export function childIds(index: GraphIndex, parentId: string | null): string[] {
  return index.childrenOf.get(parentId) ?? [];
}

export function childNodes(index: GraphIndex, parentId: string | null): Node[] {
  return childIds(index, parentId)
    .map((id) => index.nodes.get(id))
    .filter((node): node is Node => Boolean(node));
}

/** 子树 id，DFS 前序，包含自身 */
export function collectSubtree(index: GraphIndex, id: string): string[] {
  const result: string[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    const children = childIds(index, current);
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
  return result;
}

/** 祖先链：从根到父节点 */
export function ancestorIds(index: GraphIndex, id: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>([id]);
  let current = index.nodes.get(id)?.parentId ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    result.push(current);
    current = index.nodes.get(current)?.parentId ?? null;
  }
  return result.reverse();
}

export function ancestorNodes(index: GraphIndex, id: string): Node[] {
  return ancestorIds(index, id)
    .map((ancestorId) => index.nodes.get(ancestorId))
    .filter((node): node is Node => Boolean(node));
}

export function depthOf(index: GraphIndex, id: string): number {
  return ancestorIds(index, id).length;
}

/** 该节点的所有兄弟（含自己），按 order */
export function siblingIds(index: GraphIndex, id: string): string[] {
  const parentId = index.nodes.get(id)?.parentId ?? null;
  return childIds(index, parentId);
}

// =============================================================================
// 排序（插入 / 移动）
// =============================================================================

export interface InsertPosition {
  order: number;
  /** true 表示间隙已用尽，调用方需要对这一组兄弟重排 */
  rebalance: boolean;
}

export function computeInsertOrder(
  index: GraphIndex,
  parentId: string | null,
  afterId?: string | null,
): InsertPosition {
  const siblings = childIds(index, parentId);
  if (siblings.length === 0) return { order: ORDER_GAP, rebalance: false };

  let position = siblings.length - 1;
  if (afterId) {
    const found = siblings.indexOf(afterId);
    if (found !== -1) position = found;
  }

  const prev = index.nodes.get(siblings[position]);
  if (!prev) return { order: ORDER_GAP * (siblings.length + 1), rebalance: false };

  const next = position + 1 < siblings.length ? index.nodes.get(siblings[position + 1]) : undefined;
  if (!next) return { order: prev.order + ORDER_GAP, rebalance: false };

  const gap = next.order - prev.order;
  if (gap < 2) {
    // 用小数占位，同时要求重排，避免出现相等 order
    return { order: prev.order + 0.5, rebalance: true };
  }
  return { order: (prev.order + next.order) / 2, rebalance: false };
}

/** 给一组兄弟重新分配等距 order */
export function rebalancedOrders(index: GraphIndex, parentId: string | null): Map<string, number> {
  const result = new Map<string, number>();
  childIds(index, parentId).forEach((id, i) => result.set(id, ORDER_GAP * (i + 1)));
  return result;
}

// =============================================================================
// 图查询：结构遍历
// =============================================================================
// 结构遍历只看「物理上存了哪些边」，不判断数学真假，也不合并语境。
// 数学推理必须走下面的 inferLogicalRelations。

/** 纯结构可达性（导航用），不检查 status / condition / 语境 */
export function reachable(
  index: GraphIndex,
  startId: string,
  predicate: Predicate,
  direction: 'out' | 'in' = 'out',
): Set<string> {
  const symmetric = PREDICATE_SPECS[predicate].symmetric;
  const result = new Set<string>();
  const queue = [startId];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const edges = direction === 'out'
      ? (index.edgesFrom.get(current) ?? [])
      : (index.edgesTo.get(current) ?? []);
    const reverseEdges = symmetric
      ? (direction === 'out' ? (index.edgesTo.get(current) ?? []) : (index.edgesFrom.get(current) ?? []))
      : [];

    for (const edge of [...edges, ...reverseEdges]) {
      if (edge.predicate !== predicate) continue;
      const next = direction === 'out'
        ? (edge.from === current ? edge.to : edge.from)
        : (edge.to === current ? edge.from : edge.to);
      if (visited.has(next)) continue;
      visited.add(next);
      result.add(next);
      queue.push(next);
    }
  }
  return result;
}

export interface StructuralQueryOptions {
  /** 是否包含已推翻的边，导航视图默认包含（历史记录仍然可看） */
  includeDisproven?: boolean;
  /** 是否包含猜想 */
  includeConjectures?: boolean;
}

export function reachableStructural(
  index: GraphIndex,
  startId: string,
  predicate: Predicate,
  options: StructuralQueryOptions = {},
): Set<string> {
  const includeDisproven = options.includeDisproven ?? true;
  const includeConjectures = options.includeConjectures ?? true;
  const result = new Set<string>();
  const queue = [startId];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const edges = [
      ...(index.edgesFrom.get(current) ?? []),
      ...(PREDICATE_SPECS[predicate].symmetric ? (index.edgesTo.get(current) ?? []) : []),
    ];
    for (const edge of edges) {
      if (edge.predicate !== predicate) continue;
      if (!includeDisproven && edge.status === 'disproven') continue;
      if (!includeConjectures && edge.status === 'conjecture') continue;
      const next = edge.from === current ? edge.to : edge.from;
      if (visited.has(next)) continue;
      visited.add(next);
      result.add(next);
      queue.push(next);
    }
  }
  return result;
}

/** 查找 from → to 沿某谓词的路径，用于环检测报错 */
export function findPath(
  index: GraphIndex,
  fromId: string,
  toId: string,
  predicate: Predicate,
): string[] | null {
  const parent = new Map<string, string | null>([[fromId, null]]);
  const queue = [fromId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === toId) {
      const path: string[] = [];
      let cursor: string | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = parent.get(cursor) ?? null;
      }
      return path.reverse();
    }
    for (const edge of index.edgesFrom.get(current) ?? []) {
      if (edge.predicate !== predicate) continue;
      if (parent.has(edge.to)) continue;
      parent.set(edge.to, current);
      queue.push(edge.to);
    }
  }
  return null;
}

// =============================================================================
// 图查询：数学推理
// =============================================================================
// 只有 qualifies 的边才能参与推理：disproven 永不参与，conjecture 默认不参与，
// 指定语境时语境不同的边不参与；路径上的文字条件会被带出来，不会被抹掉。

export interface LogicalQueryOptions {
  includeConjectures?: boolean;
  /** 指定语境：只接受该语境的边；不指定表示不限定语境 */
  contextId?: string;
  maxDepth?: number;
  maxPaths?: number;
}

/**
 * 一条「可推导的候选关联」。
 * 只描述图上怎么走到这里、路上有哪些文字条件，不代表数学上已证明。
 */
export interface DerivedRelation {
  from: string;
  to: string;
  predicate: 'implies' | 'iff';
  /** 源边 id 的路径，便于解释 */
  edgePath: string[];
  /** 路径上累积的文字前提：必须原样展示，不能抹掉 */
  unresolvedConditions: string[];
  contextId?: string;
}

export function edgeStatus(edge: { status?: EdgeStatus }): EdgeStatus {
  return edge.status ?? 'asserted';
}

export function passesLogicalFilter(edge: Edge, options: LogicalQueryOptions = {}): boolean {
  if (isLogicalPredicate(edge.predicate) === false) return false;
  if (edgeStatus(edge) === 'disproven') return false;
  if (edgeStatus(edge) === 'conjecture' && !options.includeConjectures) return false;
  if (options.contextId !== undefined && edge.contextId !== options.contextId) return false;
  return true;
}

function buildDerivedRelation(
  index: GraphIndex,
  edgeIds: string[],
  fromId: string,
  toId: string,
): DerivedRelation {
  const edges = edgeIds
    .map((id) => index.edges.find((edge) => edge.id === id))
    .filter((edge): edge is Edge => Boolean(edge));

  const conditions: string[] = [];
  const contexts = new Set<string | undefined>();
  for (const edge of edges) {
    if (edge.condition && edge.condition.trim()) conditions.push(edge.condition.trim());
    contexts.add(edge.contextId);
  }

  const singleContext = contexts.size === 1 ? [...contexts][0] : undefined;
  const contextId = singleContext && singleContext.length > 0 ? singleContext : undefined;
  const allPredicate = edges.every((edge) => edge.predicate === 'iff');

  return {
    from: fromId,
    to: toId,
    predicate: allPredicate ? 'iff' : 'implies',
    edgePath: edgeIds,
    unresolvedConditions: [...new Set(conditions)],
    contextId,
  };
}

/**
 * 从起点出发可以「推导」到的结论。
 * 只走 implies / iff，且每条边都要通过上下文与状态筛选。
 */
export function inferLogicalRelations(
  index: GraphIndex,
  startId: string,
  options: LogicalQueryOptions = {},
): DerivedRelation[] {
  const result: DerivedRelation[] = [];
  const visited = new Set<string>([startId]);
  // BFS 记录最短路径，天然给出「为什么能推到这里」的解释
  const queue: { id: string; path: string[] }[] = [{ id: startId, path: [] }];
  const maxDepth = options.maxDepth ?? 6;

  while (queue.length > 0) {
    const current = queue.shift() as { id: string; path: string[] };
    if (current.path.length >= maxDepth) continue;

    const edges = [
      ...(index.edgesFrom.get(current.id) ?? []),
      ...(index.edgesTo.get(current.id) ?? []).filter((edge) => PREDICATE_SPECS[edge.predicate].symmetric),
    ];

    for (const edge of edges) {
      if (!passesLogicalFilter(edge, options)) continue;
      const next = edge.from === current.id ? edge.to : edge.from;
      if (visited.has(next) || next === startId) continue;
      visited.add(next);
      const path = [...current.path, edge.id];
      result.push(buildDerivedRelation(index, path, startId, next));
      queue.push({ id: next, path });
    }
  }

  return result;
}

/** 枚举 from → to 的推理路径（最多 maxPaths 条，避免组合爆炸） */
export function findImplicationPaths(
  index: GraphIndex,
  fromId: string,
  toId: string,
  options: LogicalQueryOptions = {},
): DerivedRelation[] {
  const results: DerivedRelation[] = [];
  const maxDepth = options.maxDepth ?? 6;
  const maxPaths = options.maxPaths ?? 5;

  const walk = (currentId: string, path: string[], visited: Set<string>) => {
    if (results.length >= maxPaths) return;
    if (path.length >= maxDepth) return;
    if (currentId === toId && path.length > 0) {
      results.push(buildDerivedRelation(index, path, fromId, toId));
      return;
    }

    const edges = [
      ...(index.edgesFrom.get(currentId) ?? []),
      ...(index.edgesTo.get(currentId) ?? []).filter((edge) => PREDICATE_SPECS[edge.predicate].symmetric),
    ];

    for (const edge of edges) {
      if (!passesLogicalFilter(edge, options)) continue;
      const next = edge.from === currentId ? edge.to : edge.from;
      if (visited.has(next)) continue;
      visited.add(next);
      walk(next, [...path, edge.id], visited);
      visited.delete(next);
      if (results.length >= maxPaths) return;
    }
  };

  walk(fromId, [], new Set([fromId]));
  return results;
}

// =============================================================================
// 推理步骤（超边）
// =============================================================================
// 二元边是 OR：任一条成立就够。推理步骤是 AND：所有前提都成立才够。
// 这里用前向链式推导，天然处理「多个前提共同推出结论」。

export type DerivationVia =
  | { type: 'source' }
  | { type: 'edges'; from: string; edgeIds: string[] }
  | { type: 'step'; stepId: string; rule: string; premises: DerivationTrace[] };

export interface DerivationTrace {
  nodeId: string;
  via: DerivationVia;
  /** 这条推导路径上累积的文字前提，必须原样展示 */
  unresolvedConditions: string[];
  /** 所有环节提出的语境；混合或缺失时为 undefined */
  contexts: (string | undefined)[];
  contextId?: string;
  depth: number;
}

/** 所有环节的语境必须唯一且明确，才算有语境 */
function sharedContext(contexts: (string | undefined)[]): string | undefined {
  if (contexts.length === 0) return undefined;
  const defined = contexts.filter((context): context is string => Boolean(context));
  if (defined.length !== contexts.length) return undefined;
  const unique = new Set(defined);
  return unique.size === 1 ? [...unique][0] : undefined;
}

export function passesStepFilter(step: InferenceStep, options: LogicalQueryOptions = {}): boolean {
  if (edgeStatus(step) === 'disproven') return false;
  if (edgeStatus(step) === 'conjecture' && !options.includeConjectures) return false;
  if (options.contextId !== undefined && step.contextId !== options.contextId) return false;
  return true;
}

function finalizeTrace(base: Omit<DerivationTrace, 'contextId'>): DerivationTrace {
  return { ...base, contextId: sharedContext(base.contexts) };
}

function sourceTrace(nodeId: string): DerivationTrace {
  return finalizeTrace({
    nodeId,
    via: { type: 'source' },
    unresolvedConditions: [],
    contexts: [],
    depth: 0,
  });
}

function extendByEdge(trace: DerivationTrace, edge: Edge, nextId: string): DerivationTrace {
  const conditions = [...trace.unresolvedConditions];
  if (edge.condition?.trim()) conditions.push(edge.condition.trim());

  return finalizeTrace({
    nodeId: nextId,
    via: { type: 'edges', from: trace.nodeId, edgeIds: [edge.id] },
    unresolvedConditions: conditions,
    contexts: [...trace.contexts, edge.contextId],
    depth: trace.depth + 1,
  });
}

function extendByStep(step: InferenceStep, premises: DerivationTrace[]): DerivationTrace {
  const conditions = premises.flatMap((premise) => premise.unresolvedConditions);

  return finalizeTrace({
    nodeId: step.conclusionId,
    via: { type: 'step', stepId: step.id, rule: step.rule, premises },
    unresolvedConditions: [...new Set(conditions)],
    contexts: [...premises.flatMap((premise) => premise.contexts), step.contextId],
    depth: Math.max(...premises.map((premise) => premise.depth), 0) + 1,
  });
}

/** 未决条件少的优先，其次路径短的优先；不比较真假或审核级别 */
function isBetterTrace(candidate: DerivationTrace, existing: DerivationTrace): boolean {
  const candidateConditions = new Set(candidate.unresolvedConditions).size;
  const existingConditions = new Set(existing.unresolvedConditions).size;
  if (candidateConditions !== existingConditions) return candidateConditions < existingConditions;
  return candidate.depth < existing.depth;
}

/**
 * 从起点出发能推出的所有结论（含推理步骤的多前提推导）。
 *
 * 前向链式：先跑蕴含/等价边，再看哪些步骤的所有前提都已成立。
 * 输出只是「可推导的候选关联」，每一步都带着路径上的文字条件与语境。
 */
export function deriveWithSteps(
  index: GraphIndex,
  startId: string,
  options: LogicalQueryOptions = {},
): DerivationTrace[] {
  const known = new Map<string, DerivationTrace>();
  known.set(startId, sourceTrace(startId));

  const maxRounds = index.nodes.size + index.steps.length + 8;

  for (let round = 0; round < maxRounds; round += 1) {
    let changed = false;

    // 1) 蕴含 / 等价边
    for (const trace of [...known.values()]) {
      const outgoing = [
        ...(index.edgesFrom.get(trace.nodeId) ?? []),
        ...(index.edgesTo.get(trace.nodeId) ?? []).filter(
          (edge) => PREDICATE_SPECS[edge.predicate].symmetric,
        ),
      ];
      for (const edge of outgoing) {
        if (!passesLogicalFilter(edge, options)) continue;
        const next = edge.from === trace.nodeId ? edge.to : edge.from;
        const candidate = extendByEdge(trace, edge, next);
        const existing = known.get(next);
        if (!existing || isBetterTrace(candidate, existing)) {
          known.set(next, candidate);
          changed = true;
        }
      }
    }

    // 2) 推理步骤：所有前提都成立时，结论成立
    for (const step of index.steps) {
      if (!passesStepFilter(step, options)) continue;
      const premises = step.premiseIds.map((premiseId) => known.get(premiseId));
      if (premises.some((premise) => premise === undefined)) continue;
      const candidate = extendByStep(step, premises as DerivationTrace[]);
      const existing = known.get(step.conclusionId);
      if (!existing || isBetterTrace(candidate, existing)) {
        known.set(step.conclusionId, candidate);
        changed = true;
      }
    }

    if (!changed) break;
  }

  known.delete(startId);
  return [...known.values()].sort(
    (a, b) =>
      new Set(a.unresolvedConditions).size - new Set(b.unresolvedConditions).size ||
      a.depth - b.depth,
  );
}

// =============================================================================
// covers：知识点 ↔ 题目
// =============================================================================

/** 考查某个知识点的全部题目（problem --covers--> 本节点） */
export function coveringProblems(index: GraphIndex, nodeId: string): Node[] {
  const seen = new Set<string>();
  const result: Node[] = [];
  for (const edge of index.edgesTo.get(nodeId) ?? []) {
    if (edge.predicate !== 'covers') continue;
    if (seen.has(edge.from)) continue;
    const problem = index.nodes.get(edge.from);
    if (problem?.type !== 'problem') continue;
    seen.add(edge.from);
    result.push(problem);
  }
  return result;
}

/** 某个题目考查的全部知识点（本节点 --covers--> 目标） */
export function coveredKnowledge(index: GraphIndex, problemId: string): Node[] {
  const seen = new Set<string>();
  const result: Node[] = [];
  for (const edge of index.edgesFrom.get(problemId) ?? []) {
    if (edge.predicate !== 'covers') continue;
    if (seen.has(edge.to)) continue;
    const target = index.nodes.get(edge.to);
    if (!target) continue;
    seen.add(edge.to);
    result.push(target);
  }
  return result;
}

/** 涉及某个节点的推理步骤 */
export function stepsForNode(
  index: GraphIndex,
  nodeId: string,
): { asConclusion: InferenceStep[]; asPremise: InferenceStep[] } {
  return {
    asConclusion: index.stepsByConclusion.get(nodeId) ?? [],
    asPremise: index.stepsByPremise.get(nodeId) ?? [],
  };
}

/** 用一句话解释这条推导是怎么来的 */
export function explainTrace(index: GraphIndex, trace: DerivationTrace): string {
  if (trace.via.type === 'source') return '起点';
  if (trace.via.type === 'edges') {
    const fromTitle = index.nodes.get(trace.via.from)?.title ?? trace.via.from;
    return `由「${fromTitle}」沿蕴含关系推出`;
  }
  const names = trace.via.premises
    .map((premise) => index.nodes.get(premise.nodeId)?.title ?? premise.nodeId)
    .join('、');
  return `按规则「${trace.via.rule}」推出（前提：${names}）`;
}

// =============================================================================
// 等价类
// =============================================================================

export interface EquivalenceClass {
  /** 同一语境下的等价类；undefined 表示语境未知 */
  contextId?: string;
  members: string[];
  /**
   * false = 已确认的等价（无前提、语境明确、断言成立、通过所选审核标准）
   * true  = 条件等价候选，不能当作无条件等价使用
   */
  conditional: boolean;
  /** 合并这一类用到的条件文本（已确认的类为空） */
  conditions: string[];
}

export interface EquivalenceOptions extends LogicalQueryOptions {
  /** 是否把条件等价候选也返回（默认只返回已确认的等价类） */
  includeConditional?: boolean;
}

function normalizeConditionText(condition?: string): string {
  return (condition ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * iff 连通分量。
 *
 * 只有「无前提 + 语境明确 + 断言成立 + 已审核」的边才合并成已确认等价类；
 * 带前提的边按「语境 + 前提」分组，作为条件等价候选返回。
 * 不同语境的等价关系永远不会并在一起。
 */
export function equivalenceClasses(
  index: GraphIndex,
  predicate: Predicate = 'iff',
  options: EquivalenceOptions = {},
): EquivalenceClass[] {
  const buckets = new Map<string, { contextId?: string; conditions: string[]; conditional: boolean; parent: Map<string, string> }>();

  const bucketOf = (
    contextId: string | undefined,
    conditions: string[],
    conditional: boolean,
  ) => {
    const key = `${conditional ? 'x' : 'c'}|${contextId ?? '__unknown__'}|${conditions.join(' && ')}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { contextId, conditions, conditional, parent: new Map() };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  const find = (parent: Map<string, string>, id: string): string => {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root) as string;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  for (const edge of index.edges) {
    if (edge.predicate !== predicate) continue;
    if (!passesLogicalFilter(edge, options)) continue;

    const conditions = normalizeConditionText(edge.condition);
    // 带文字前提或语境未说明的，只能算候选分组，不能当成同语境等价
    const conditional = conditions.length > 0 || edge.contextId === undefined;

    if (conditional && !options.includeConditional) continue;

    const conditionList = conditions ? [conditions] : [];
    const bucket = bucketOf(edge.contextId, conditionList, conditional);
    const parent = bucket.parent;
    if (!parent.has(edge.from)) parent.set(edge.from, edge.from);
    if (!parent.has(edge.to)) parent.set(edge.to, edge.to);
    const rootA = find(parent, edge.from);
    const rootB = find(parent, edge.to);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  const classes: EquivalenceClass[] = [];
  for (const bucket of buckets.values()) {
    const groups = new Map<string, string[]>();
    for (const id of bucket.parent.keys()) {
      const root = find(bucket.parent, id);
      const group = groups.get(root);
      if (group) group.push(id);
      else groups.set(root, [id]);
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      classes.push({
        contextId: bucket.contextId,
        members,
        conditional: bucket.conditional,
        conditions: bucket.conditions,
      });
    }
  }

  // 已确认的排前面，同类的按人数多的排前面
  return classes.sort(
    (a, b) => Number(a.conditional) - Number(b.conditional) || b.members.length - a.members.length,
  );
}

// =============================================================================
// 排序与环诊断
// =============================================================================

/** Tarjan SCC：返回真正的环上节点（自环或分量大小 > 1） */
export function cycleNodes(index: GraphIndex, predicate: Predicate): Set<string> {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const edge of index.edges) {
    if (edge.predicate !== predicate) continue;
    nodes.add(edge.from);
    nodes.add(edge.to);
    if (edge.from === edge.to) {
      // 自环单独记录
      nodes.add(edge.from);
    }
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
    else adjacency.set(edge.from, [edge.to]);
  }

  const indexOf = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result = new Set<string>();
  let counter = 0;

  const strongConnect = (start: string) => {
    // 迭代版 Tarjan，避免深图递归爆栈
    const work: { node: string; edgeIndex: number }[] = [{ node: start, edgeIndex: 0 }];
    indexOf.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const edges = adjacency.get(frame.node) ?? [];

      if (frame.edgeIndex < edges.length) {
        const next = edges[frame.edgeIndex];
        frame.edgeIndex += 1;
        if (next === frame.node) {
          result.add(next);
          continue;
        }
        if (!indexOf.has(next)) {
          indexOf.set(next, counter);
          low.set(next, counter);
          counter += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, edgeIndex: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node) as number, indexOf.get(next) as number));
        }
        continue;
      }

      work.pop();
      const parentFrame = work[work.length - 1];
      if (parentFrame) {
        low.set(parentFrame.node, Math.min(low.get(parentFrame.node) as number, low.get(frame.node) as number));
      }

      if (low.get(frame.node) === indexOf.get(frame.node)) {
        const component: string[] = [];
        let popped: string;
        do {
          popped = stack.pop() as string;
          onStack.delete(popped);
          component.push(popped);
        } while (popped !== frame.node);
        if (component.length > 1) {
          for (const id of component) result.add(id);
        }
      }
    }
  };

  for (const node of nodes) {
    if (!indexOf.has(node)) strongConnect(node);
  }

  return result;
}

export interface TopoResult {
  order: string[];
  /** 真正在环上的节点 */
  cyclic: string[];
  /** 不在环上、但被环阻塞无法排序的节点 */
  blocked: string[];
}

/**
 * 传递关系下的拓扑排序。
 *
 * 'from-first'：每条边 from 排在 to 前面（图论标准）。
 * 'to-first'  ：每条边 to 排在 from 前面。对 depends-on 来说，
 *               to 是前置知识，于是得到的就是学习顺序。
 *
 * candidateIds 让没有依赖边的孤立知识点也能排进结果。
 */
export function topoSort(
  index: GraphIndex,
  predicate: Predicate,
  direction: 'from-first' | 'to-first' = 'from-first',
  options: { candidateIds?: string[] } = {},
): TopoResult {
  const involved = new Set<string>(options.candidateIds ?? []);
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  const ensure = (id: string) => {
    involved.add(id);
    if (!indegree.has(id)) indegree.set(id, 0);
    if (!adjacency.has(id)) adjacency.set(id, []);
  };

  for (const candidateId of options.candidateIds ?? []) ensure(candidateId);

  for (const edge of index.edges) {
    if (edge.predicate !== predicate) continue;
    const before = direction === 'from-first' ? edge.from : edge.to;
    const after = direction === 'from-first' ? edge.to : edge.from;
    ensure(before);
    ensure(after);
    adjacency.get(before)!.push(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  }

  const queue = [...involved].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const remaining = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  const inCycle = cycleNodes(index, predicate);
  const ordered = new Set(order);
  const cyclic = [...involved].filter((id) => inCycle.has(id));
  const blocked = [...involved].filter((id) => !ordered.has(id) && !inCycle.has(id));

  return { order, cyclic, blocked };
}

/** 前置知识顺序：依赖在前，被依赖的放在后面 */
export function prerequisiteOrder(
  index: GraphIndex,
  options: { candidateIds?: string[] } = {},
): { order: Node[]; cyclic: string[]; blocked: string[] } {
  const { order, cyclic, blocked } = topoSort(index, 'depends-on', 'to-first', options);
  return {
    order: order.map((id) => index.nodes.get(id)).filter((node): node is Node => Boolean(node)),
    cyclic,
    blocked,
  };
}

// =============================================================================
// 搜索
// =============================================================================

export type SearchField = 'title' | 'key' | 'alias' | 'tag' | 'content';

export interface SearchHit {
  node: Node;
  score: number;
  field: SearchField;
  snippet?: string;
}

const FIELD_WEIGHT: Record<SearchField, number> = {
  key: 100,
  title: 80,
  alias: 60,
  tag: 40,
  content: 20,
};

export interface SearchFilter {
  type?: NodeType;
  kind?: string;
}

function matchesFilter(node: Node, filter?: SearchFilter): boolean {
  if (!filter) return true;
  if (filter.type && node.type !== filter.type) return false;
  if (filter.kind && node.kind !== filter.kind) return false;
  return true;
}

/** 只按类型/细分筛选，不做关键词匹配（筛选器单独使用时的浏览模式） */
export function nodesMatching(index: GraphIndex, filter?: SearchFilter, limit = 30): Node[] {
  const result: Node[] = [];
  for (const node of index.nodes.values()) {
    if (!matchesFilter(node, filter)) continue;
    result.push(node);
    if (result.length >= limit * 4) break;
  }
  return result
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    .slice(0, limit);
}

export function searchNodes(
  index: GraphIndex,
  rawTerm: string,
  limit = 50,
  filter?: SearchFilter,
): SearchHit[] {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return [];
  const hits: SearchHit[] = [];

  for (const node of index.nodes.values()) {
    if (!matchesFilter(node, filter)) continue;
    const candidates: [SearchField, string | undefined][] = [
      ['key', node.key],
      ['title', node.title],
      ['alias', node.aliases?.join(' ')],
      ['tag', node.tags?.join(' ')],
      ['content', node.content],
    ];

    let best: SearchHit | null = null;
    for (const [field, value] of candidates) {
      if (!value) continue;
      const haystack = value.toLowerCase();
      const at = haystack.indexOf(term);
      if (at === -1) continue;
      let score = FIELD_WEIGHT[field];
      if (field === 'title' || field === 'key') {
        if (haystack === term) score += 40;
        else if (at === 0) score += 20;
      }
      const snippet =
        field === 'content'
          ? value.slice(Math.max(0, at - 20), Math.min(value.length, at + term.length + 40))
          : undefined;
      if (!best || score > best.score) best = { node, score, field, snippet };
    }

    if (best) hits.push(best);
  }

  return hits
    .sort((a, b) => b.score - a.score || a.node.title.length - b.node.title.length)
    .slice(0, limit);
}

/** 面包屑标题链 */
export function breadcrumb(index: GraphIndex, id: string): string[] {
  const titles = ancestorNodes(index, id).map((node) => node.title);
  const self = index.nodes.get(id);
  if (self) titles.push(self.title);
  return titles;
}

/** 便于测试与调试：把树打印成缩进文本 */
export function dumpTree(index: GraphIndex, parentId: string | null = null, level = 0): string {
  const lines: string[] = [];
  for (const id of childIds(index, parentId)) {
    const node = index.nodes.get(id);
    if (!node) continue;
    const number = index.numbering.get(id);
    lines.push(`${'  '.repeat(level)}${node.type} ${number ? `[${number}] ` : ''}${node.title}`);
    lines.push(...dumpTree(index, id, level + 1).split('\n').filter(Boolean));
  }
  return lines.join('\n');
}

export function isDescendantOf(index: GraphIndex, candidateId: string, ancestorId: string): boolean {
  return ancestorIds(index, candidateId).includes(ancestorId);
}

