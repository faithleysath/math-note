import { buildIndex, collectSubtree, computeInsertOrder, ORDER_GAP, type GraphIndex } from './graph';
import { canonicalizePair } from './predicates';
import type { AiOperation, Edge, Node } from './schema';
import { ValidationError, validateNewEdge, validateNewNode, validateNodePatch } from './validate';

export interface DraftDiff {
  createdNodes: Node[];
  updatedNodes: Node[];
  deletedNodeIds: string[];
  createdEdges: Edge[];
  deletedEdgeIds: string[];
  /** 事务提交后要执行的纯 UI 操作 */
  selects: string[];
}

export interface SimulationResult {
  diff: DraftDiff;
  nodes: Map<string, Node>;
  edges: Edge[];
  errors: string[];
}

function diffOf(
  original: GraphIndex,
  nodes: Map<string, Node>,
  edges: Edge[],
  selects: string[],
): DraftDiff {
  const createdNodes: Node[] = [];
  const updatedNodes: Node[] = [];

  for (const node of nodes.values()) {
    const before = original.nodes.get(node.id);
    if (!before) {
      createdNodes.push(node);
    } else if (JSON.stringify(before) !== JSON.stringify(node)) {
      updatedNodes.push(node);
    }
  }

  const deletedNodeIds = [...original.nodes.keys()].filter((id) => !nodes.has(id));
  const originalEdgeIds = new Set(original.edges.map((edge) => edge.id));
  const nextEdgeIds = new Set(edges.map((edge) => edge.id));

  return {
    createdNodes,
    updatedNodes,
    deletedNodeIds,
    createdEdges: edges.filter((edge) => !originalEdgeIds.has(edge.id)),
    deletedEdgeIds: original.edges.filter((edge) => !nextEdgeIds.has(edge.id)).map((edge) => edge.id),
    selects,
  };
}

/**
 * 在内存草稿上按顺序模拟一批操作。
 *
 * 任何一步不合法就整批失败：不留半成品，也不产生「已经写进库但后面报错」的状态。
 * 返回的 diff 交给调用方做预演展示和单事务提交。
 */
export function simulateOperations(
  original: GraphIndex,
  operations: AiOperation[],
  options: { now?: number; newId?: () => string } = {},
): SimulationResult {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const nodes = new Map(original.nodes);
  const edges = [...original.edges];
  const refs = new Map<string, string>();
  const selects: string[] = [];
  const errors: string[] = [];

  const resolve = (value: string): string => {
    if (!value.startsWith('ref:')) return value;
    const resolved = refs.get(value.slice(4));
    if (!resolved) throw new ValidationError('ref', `找不到临时引用 ${value}。`);
    return resolved;
  };

  const draftIndex = (): GraphIndex => buildIndex(nodes.values(), edges);

  for (const [position, op] of operations.entries()) {
    try {
      switch (op.op) {
        case 'create-node': {
          const parentId = resolve(op.parentId);
          const afterId = op.after ? resolve(op.after) : null;
          let index = draftIndex();
          validateNewNode(index, {
            type: op.type,
            title: op.title,
            parentId,
            content: op.content,
          });

          const placement = computeInsertOrder(index, parentId, afterId);
          const node: Node = {
            id: newId(),
            type: op.type,
            title: op.title.trim(),
            content: op.content ?? '',
            solution: op.solution,
            parentId,
            order: placement.order,
            aliases: op.aliases?.length ? op.aliases : undefined,
            tags: op.tags?.length ? op.tags : undefined,
            createdAt: now,
            updatedAt: now,
          };
          nodes.set(node.id, node);

          if (placement.rebalance) {
            index = draftIndex();
            const siblings = (index.childrenOf.get(parentId) ?? []).filter((id) => nodes.has(id));
            siblings.forEach((id, positionInGroup) => {
              const existing = nodes.get(id);
              if (!existing) return;
              nodes.set(id, { ...existing, order: ORDER_GAP * (positionInGroup + 1) });
            });
          }

          if (op.ref) refs.set(op.ref, node.id);
          break;
        }

        case 'update-node': {
          const id = resolve(op.id);
          const index = draftIndex();
          const existing = nodes.get(id);
          if (!existing) throw new ValidationError('id', '节点不存在。');
          const patch = {
            title: op.title,
            content: op.content,
            solution: op.solution,
            aliases: op.aliases,
            tags: op.tags,
          };
          validateNodePatch(index, id, patch);
          nodes.set(id, {
            ...existing,
            ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
            updatedAt: now,
          });
          break;
        }

        case 'delete-node': {
          const id = resolve(op.id);
          const index = draftIndex();
          const ids = collectSubtree(index, id);
          const idSet = new Set(ids);
          for (const nodeId of ids) nodes.delete(nodeId);
          for (let i = edges.length - 1; i >= 0; i -= 1) {
            if (idSet.has(edges[i].from) || idSet.has(edges[i].to)) edges.splice(i, 1);
          }
          break;
        }

        case 'create-edge': {
          const from = resolve(op.from);
          const to = resolve(op.to);
          const canonical = canonicalizePair(op.predicate, from, to);
          const index = draftIndex();
          validateNewEdge(index, {
            from: canonical.from,
            to: canonical.to,
            predicate: op.predicate,
            condition: op.condition,
            contextId: op.contextId,
            assumptionIds: op.assumptionIds,
          });
          edges.push({
            id: newId(),
            from: canonical.from,
            to: canonical.to,
            predicate: op.predicate,
            condition: op.condition || undefined,
            note: op.note || undefined,
            status: 'asserted',
            // AI 产出的数学关系一律未审核，提示词不能充当验证
            reviewState: 'unreviewed',
            contextId: op.contextId,
            assumptionIds: op.assumptionIds,
            assertedBy: 'ai',
            createdAt: now,
            updatedAt: now,
          });
          break;
        }

        case 'delete-edge': {
          const positionOfEdge = edges.findIndex((edge) => edge.id === op.id);
          if (positionOfEdge === -1) throw new ValidationError('id', '关系不存在。');
          edges.splice(positionOfEdge, 1);
          break;
        }

        case 'select': {
          selects.push(resolve(op.id));
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`第 ${position + 1} 个操作（${op.op}）失败：${message}`);
      // 一步失败就整批放弃，避免半成品
      break;
    }
  }

  if (errors.length > 0) {
    return {
      diff: {
        createdNodes: [],
        updatedNodes: [],
        deletedNodeIds: [],
        createdEdges: [],
        deletedEdgeIds: [],
        selects: [],
      },
      nodes: new Map(original.nodes),
      edges: original.edges,
      errors,
    };
  }

  return {
    diff: diffOf(original, nodes, edges, selects),
    nodes,
    edges,
    errors: [],
  };
}
