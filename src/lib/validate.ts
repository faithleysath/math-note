import type { GraphIndex } from './graph';
import { ancestorIds, collectSubtree, findPath } from './graph';
import { PREDICATE_SPECS } from './predicates';
import {
  NODE_TYPE_META,
  allowedChildTypes,
  type AttemptMeta,
  type Citation,
  type Edge,
  type Node,
  type NodeType,
  type Predicate,
} from './schema';

export class ValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export interface NewNodeInput {
  type: NodeType;
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
  content?: string;
  solution?: string;
  key?: string | null;
  aliases?: string[];
  tags?: string[];
  citation?: Citation;
  attempt?: AttemptMeta;
  parentId?: string | null;
}

export interface NewEdgeInput {
  from: string;
  to: string;
  predicate: Predicate;
  condition?: string;
  note?: string;
  status?: Edge['status'];
  assertedBy?: Edge['assertedBy'];
  model?: string;
}

// =============================================================================
// 节点校验
// =============================================================================

function assertTitle(title: string) {
  if (!title.trim()) {
    throw new ValidationError('title', '标题不能为空。');
  }
}

function assertKeyUnique(index: GraphIndex, key: string, ignoreId?: string) {
  for (const node of index.nodes.values()) {
    if (node.key === key && node.id !== ignoreId) {
      throw new ValidationError('key', `术语键 "${key}" 已被「${node.title}」占用。`);
    }
  }
}

function assertParentUsable(index: GraphIndex, parentId: string | null, type: NodeType) {
  if (parentId === null) {
    if (!allowedChildTypes(null).includes(type)) {
      throw new ValidationError('parentId', '只有「分支」可以作为根节点。');
    }
    return;
  }
  const parent = index.nodes.get(parentId);
  if (!parent) {
    throw new ValidationError('parentId', '父节点不存在。');
  }
  if (parent.type === 'attempt') {
    throw new ValidationError('parentId', '「解题记录」下不能再挂子节点。');
  }
  const allowed = allowedChildTypes(parent.type);
  if (!allowed.includes(type)) {
    throw new ValidationError(
      'parentId',
      `「${NODE_TYPE_META[parent.type].label}」下不能放「${NODE_TYPE_META[type].label}」。`,
    );
  }
}

export function validateNewNode(index: GraphIndex, input: NewNodeInput): void {
  assertTitle(input.title);

  if (input.type === 'attempt') {
    const parent = input.parentId ? index.nodes.get(input.parentId) : undefined;
    if (!parent || (parent.type !== 'exercise' && parent.type !== 'example')) {
      throw new ValidationError('parentId', '「解题记录」只能挂在例题或练习下面。');
    }
  }

  assertParentUsable(index, input.parentId, input.type);

  if (input.key) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(input.key)) {
      throw new ValidationError('key', '术语键只能用小写字母、数字和连字符。');
    }
    assertKeyUnique(index, input.key);
  }

  if (input.type === 'branch' && input.parentId === null) {
    // 分支之间不重名，避免树上出现两个同名字段
    for (const node of index.nodes.values()) {
      if (node.type === 'branch' && node.title.trim() === input.title.trim()) {
        throw new ValidationError('title', `已存在同名分支「${input.title}」。`);
      }
    }
  }
}

export function validateNodePatch(index: GraphIndex, id: string, patch: NodePatch): void {
  const node = index.nodes.get(id);
  if (!node) throw new ValidationError('id', '节点不存在。');

  if (patch.title !== undefined) assertTitle(patch.title);

  if (patch.key) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(patch.key)) {
      throw new ValidationError('key', '术语键只能用小写字母、数字和连字符。');
    }
    assertKeyUnique(index, patch.key, id);
  }

  if (patch.parentId !== undefined && patch.parentId !== node.parentId) {
    validateCanReparent(index, id, patch.parentId);
  }
}

export function validateCanReparent(index: GraphIndex, id: string, newParentId: string | null): void {
  const node = index.nodes.get(id);
  if (!node) throw new ValidationError('id', '节点不存在。');

  if (newParentId === null) {
    if (node.type !== 'branch') {
      throw new ValidationError('parentId', '只有「分支」可以移动到根节点。');
    }
    return;
  }

  if (newParentId === id) {
    throw new ValidationError('parentId', '不能把节点移动到它自己下面。');
  }

  if (collectSubtree(index, id).includes(newParentId)) {
    throw new ValidationError('parentId', '不能把节点移动到它自己的子孙下面。');
  }

  assertParentUsable(index, newParentId, node.type);

  if (node.type === 'attempt') {
    const target = index.nodes.get(newParentId);
    if (!target || (target.type !== 'exercise' && target.type !== 'example')) {
      throw new ValidationError('parentId', '「解题记录」只能挂在例题或练习下面。');
    }
  }
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
};

function typeNames(types: NodeType[]): string {
  return types.map((type) => NODE_TYPE_META[type].label).join('、');
}

export function validateNewEdge(index: GraphIndex, input: NewEdgeInput): void {
  const { from, to, predicate } = input;

  if (from === to) {
    throw new ValidationError('to', '不能把节点连到它自己。');
  }

  const fromNode = index.nodes.get(from);
  const toNode = index.nodes.get(to);
  if (!fromNode) throw new ValidationError('from', '起点节点不存在。');
  if (!toNode) throw new ValidationError('to', '终点节点不存在。');

  const spec = PREDICATE_SPECS[predicate];

  if (!spec.from.includes(fromNode.type) || !spec.to.includes(toNode.type)) {
    throw new ValidationError(
      'predicate',
      `「${PREDICATE_HINT[predicate]}」不能用在「${NODE_TYPE_META[fromNode.type].label} → ${
        NODE_TYPE_META[toNode.type].label
      }」之间。起点须为 ${typeNames(spec.from)}，终点须为 ${typeNames(spec.to)}。`,
    );
  }

  const duplicate = index.edges.find(
    (edge) => edge.from === from && edge.to === to && edge.predicate === predicate,
  );
  if (duplicate) {
    throw new ValidationError('predicate', '这条关系已经存在了。');
  }

  if (spec.symmetric) {
    const reverse = index.edges.find(
      (edge) => edge.from === to && edge.to === from && edge.predicate === predicate,
    );
    if (reverse) {
      throw new ValidationError('predicate', '这条关系已经存在了（等价关系只存一条）。');
    }
  }

  if (spec.transitive && spec.forbidCycle) {
    const path = findPath(index, to, from, predicate);
    if (path) {
      const titles = path.map((pathId) => index.nodes.get(pathId)?.title ?? pathId);
      throw new ValidationError(
        'predicate',
        `会形成循环依赖：${[fromNode.title, ...titles].join(' → ')}。`,
      );
    }
  }
}

/**
 * 被蕴含的冗余边：加了 iff 就删掉同向的 implies；
 * 加了 depends-on 就删掉同向的 cites。
 */
export function subsumedEdgeIds(index: GraphIndex, edge: Edge): string[] {
  const removed: string[] = [];
  for (const existing of index.edges) {
    if (existing.id === edge.id) continue;

    if (edge.predicate === 'iff' && existing.predicate === 'implies') {
      const same = existing.from === edge.from && existing.to === edge.to;
      const reverse = existing.from === edge.to && existing.to === edge.from;
      if (same || reverse) removed.push(existing.id);
    }

    if (edge.predicate === 'depends-on' && existing.predicate === 'cites') {
      if (existing.from === edge.from && existing.to === edge.to) removed.push(existing.id);
    }
  }
  return removed;
}

/** 依赖关系里出现「A 蕴含 B，但 A 是 B 的反例」这种自相矛盾时给出提示 */
export function findContradictions(index: GraphIndex): { implies: Edge; refutes: Edge }[] {
  const conflicts: { implies: Edge; refutes: Edge }[] = [];
  for (const implies of index.edges) {
    if (implies.predicate !== 'implies') continue;
    for (const refutes of index.edges) {
      if (refutes.predicate !== 'refutes') continue;
      if (refutes.from === implies.from && refutes.to === implies.to) {
        conflicts.push({ implies, refutes });
      }
    }
  }
  return conflicts;
}

export function subtreeSize(index: GraphIndex, id: string): number {
  return collectSubtree(index, id).length;
}

export function isAncestor(index: GraphIndex, ancestorId: string, descendantId: string): boolean {
  return ancestorIds(index, descendantId).includes(ancestorId);
}

export function nodeLabel(node: Node | undefined, fallback = '未知节点'): string {
  return node ? node.title || NODE_TYPE_META[node.type].label : fallback;
}
