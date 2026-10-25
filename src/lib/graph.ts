import { NODE_TYPE_META, type Edge, type Node, type Predicate } from './schema';

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
}

export function buildIndex(nodeIterable: Iterable<Node>, edges: Edge[]): GraphIndex {
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

  return {
    nodes,
    edges,
    childrenOf,
    edgesFrom,
    edgesTo,
    roots,
    numbering: computeNumbering(nodes, childrenOf),
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

  const bump = (containerId: string, kind: string): number => {
    const key = `${containerId}|${kind}`;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  };

  interface Ctx {
    chapter?: number;
    section?: number;
    containerId: string;
  }

  const visit = (id: string, ctx: Ctx) => {
    const node = nodes.get(id);
    if (!node) return;
    let childCtx: Ctx = ctx;

    switch (node.type) {
      case 'branch': {
        childCtx = { containerId: id };
        break;
      }
      case 'chapter': {
        const n = bump(ctx.containerId, 'chapter');
        numbering.set(id, `第 ${n} 章`);
        childCtx = { chapter: n, containerId: id };
        break;
      }
      case 'section': {
        const n = bump(ctx.containerId, 'section');
        numbering.set(id, ctx.chapter != null ? `§ ${ctx.chapter}.${n}` : `§ ${n}`);
        childCtx = { chapter: ctx.chapter, section: n, containerId: id };
        break;
      }
      case 'definition':
      case 'theorem':
      case 'lemma':
      case 'corollary':
      case 'example':
      case 'exercise': {
        const n = bump(ctx.containerId, node.type);
        const prefix = [ctx.chapter, ctx.section]
          .filter((v): v is number => typeof v === 'number')
          .join('.');
        const label = NODE_TYPE_META[node.type].label;
        numbering.set(id, prefix ? `${label} ${prefix}.${n}` : `${label} ${n}`);
        break;
      }
      default:
        break;
    }

    for (const childId of childrenOf.get(id) ?? []) visit(childId, childCtx);
  };

  for (const rootId of childrenOf.get(null) ?? []) visit(rootId, { containerId: 'root' });
  return numbering;
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
// 图查询
// =============================================================================

/** 沿某个谓词可达的节点集合（不含自身） */
export function reachable(
  index: GraphIndex,
  startId: string,
  predicate: Predicate,
  direction: 'out' | 'in' = 'out',
): Set<string> {
  const result = new Set<string>();
  const queue = [startId];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const edges =
      direction === 'out' ? (index.edgesFrom.get(current) ?? []) : (index.edgesTo.get(current) ?? []);
    for (const edge of edges) {
      if (edge.predicate !== predicate) continue;
      const next = direction === 'out' ? edge.to : edge.from;
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

/**
 * 传递关系下的拓扑排序。
 *
 * 'from-first'：每条边 from 排在 to 前面（图论标准）。
 * 'to-first'  ：每条边 to 排在 from 前面。对 depends-on 来说，
 *               to 是前置知识，于是得到的就是学习顺序。
 */
export function topoSort(
  index: GraphIndex,
  predicate: Predicate,
  direction: 'from-first' | 'to-first' = 'from-first',
): { order: string[]; cyclic: string[] } {
  const involved = new Set<string>();
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const edge of index.edges) {
    if (edge.predicate !== predicate) continue;
    const before = direction === 'from-first' ? edge.from : edge.to;
    const after = direction === 'from-first' ? edge.to : edge.from;
    involved.add(before);
    involved.add(after);
    if (!adjacency.has(before)) adjacency.set(before, []);
    adjacency.get(before)!.push(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
    if (!indegree.has(before)) indegree.set(before, indegree.get(before) ?? 0);
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

  const cyclic = [...involved].filter((id) => !order.includes(id));
  return { order, cyclic };
}

/** 前置知识顺序：依赖在前，被依赖的放在后面 */
export function prerequisiteOrder(index: GraphIndex): { order: Node[]; cyclic: string[] } {
  const { order, cyclic } = topoSort(index, 'depends-on', 'to-first');
  return {
    order: order.map((id) => index.nodes.get(id)).filter((node): node is Node => Boolean(node)),
    cyclic,
  };
}

/** 对称传递谓词（iff）的等价类 */
export function equivalenceClasses(index: GraphIndex, predicate: Predicate): string[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
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
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const involved = new Set<string>();
  for (const edge of index.edges) {
    if (edge.predicate !== predicate) continue;
    if (!parent.has(edge.from)) parent.set(edge.from, edge.from);
    if (!parent.has(edge.to)) parent.set(edge.to, edge.to);
    involved.add(edge.from);
    involved.add(edge.to);
    union(edge.from, edge.to);
  }

  const groups = new Map<string, string[]>();
  for (const id of involved) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
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

export function searchNodes(index: GraphIndex, rawTerm: string, limit = 50): SearchHit[] {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return [];
  const hits: SearchHit[] = [];

  for (const node of index.nodes.values()) {
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

