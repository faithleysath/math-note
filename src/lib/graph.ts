import {
  typeLabel,
  type Edge,
  type InferenceStep,
  type Node,
  type NodeType,
  type NumberSource,
  type Predicate,
} from './schema';
import type { NumberingMode } from './subjects';

/** 兄弟节点排序间隔 */
const ORDER_GAP = 1024;

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

export interface NumberDisplay {
  text: string;
  source: NumberSource;
}

/**
 * 节点实际显示的教材编号。
 *
 * - 原书编号永远优先，并标为 source；
 * - 数学配置沿用软件生成的编号；
 * - 其他理科默认只为章节、定义、题目生成编号，
 *   不伪造「定律 1.2.1」「实验 3.1」这类原书不存在的编号。
 */
export function numberDisplayFor(
  index: GraphIndex,
  node: Pick<Node, 'id' | 'type' | 'citation'>,
  mode: NumberingMode = 'generated',
): NumberDisplay {
  const original = node.citation?.originalNumber?.trim();
  if (original) return { text: original, source: 'source' };

  const generated = index.numbering.get(node.id);
  if (!generated) return { text: '', source: 'none' };
  if (mode === 'generated') return { text: generated, source: 'generated' };

  const allowed = node.type === 'section' || node.type === 'definition' || node.type === 'problem';
  return allowed ? { text: generated, source: 'generated' } : { text: '', source: 'none' };
}

// =============================================================================
// 树遍历
// =============================================================================

export function childIds(index: GraphIndex, parentId: string | null): string[] {
  return index.childrenOf.get(parentId) ?? [];
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

/** 该节点的所有兄弟（含自己），按 order */
export function siblingIds(index: GraphIndex, id: string): string[] {
  const parentId = index.nodes.get(id)?.parentId ?? null;
  return childIds(index, parentId);
}

// =============================================================================
// 排序（插入 / 移动）
// =============================================================================

interface InsertPosition {
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
// 路径查找
// =============================================================================
// 只用来做环检测（例如 depends-on 成环时报出完整路径），不做任何推理。

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

// =============================================================================
// 搜索
// =============================================================================

type SearchField = 'title' | 'key' | 'alias' | 'tag' | 'content';

interface SearchHit {
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
