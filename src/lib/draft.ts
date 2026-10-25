import { buildIndex, collectSubtree, computeInsertOrder, ORDER_GAP, type GraphIndex } from './graph';
import { canonicalizePair } from './predicates';
import type { AiOperation, Edge, InferenceStep, Node } from './schema';
import {
  ValidationError,
  validateNewEdge,
  validateNewNode,
  validateNewStep,
  validateNodePatch,
} from './validate';

export interface DraftDiff {
  createdNodes: Node[];
  updatedNodes: Node[];
  deletedNodeIds: string[];
  createdEdges: Edge[];
  deletedEdgeIds: string[];
  createdSteps: InferenceStep[];
  deletedStepIds: string[];
  /** 事务提交后要执行的纯 UI 操作 */
  selects: string[];
}

export interface SimulationResult {
  diff: DraftDiff;
  nodes: Map<string, Node>;
  edges: Edge[];
  steps: InferenceStep[];
  errors: string[];
}

function diffOf(
  original: GraphIndex,
  nodes: Map<string, Node>,
  edges: Edge[],
  steps: InferenceStep[],
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
  const originalStepIds = new Set(original.steps.map((step) => step.id));
  const nextStepIds = new Set(steps.map((step) => step.id));

  return {
    createdNodes,
    updatedNodes,
    deletedNodeIds,
    createdEdges: edges.filter((edge) => !originalEdgeIds.has(edge.id)),
    deletedEdgeIds: original.edges.filter((edge) => !nextEdgeIds.has(edge.id)).map((edge) => edge.id),
    createdSteps: steps.filter((step) => !originalStepIds.has(step.id)),
    deletedStepIds: original.steps.filter((step) => !nextStepIds.has(step.id)).map((step) => step.id),
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
  const steps = [...original.steps];
  const refs = new Map<string, string>();
  const selects: string[] = [];
  const errors: string[] = [];

  const resolve = (value: string): string => {
    if (!value.startsWith('ref:')) return value;
    const resolved = refs.get(value.slice(4));
    if (!resolved) throw new ValidationError('ref', `找不到临时引用 ${value}。`);
    return resolved;
  };

  const draftIndex = (): GraphIndex => buildIndex(nodes.values(), edges, steps);

  for (const [position, op] of operations.entries()) {
    try {
      switch (op.op) {
        case 'create-node': {
          const parentId = resolve(op.parentId);
          const afterId = op.after ? resolve(op.after) : null;
          let index = draftIndex();
          validateNewNode(index, {
            type: op.type,
            kind: op.kind,
            title: op.title,
            parentId,
            content: op.content,
          });

          const placement = computeInsertOrder(index, parentId, afterId);
          const node: Node = {
            id: newId(),
            type: op.type,
            kind: op.kind,
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
            kind: op.kind,
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
          for (let i = steps.length - 1; i >= 0; i -= 1) {
            if (idSet.has(steps[i].conclusionId) || steps[i].premiseIds.some((id) => idSet.has(id))) {
              steps.splice(i, 1);
            }
          }
          // 清掉指向被删节点的语境 / 前提 / 所属证明，避免悬空引用
          for (let i = 0; i < edges.length; i += 1) {
            const edge = edges[i];
            let next = edge;
            if (edge.contextId && idSet.has(edge.contextId)) {
              next = { ...next, contextId: undefined, updatedAt: now };
            }
            if (edge.assumptionIds?.some((id) => idSet.has(id))) {
              const remaining = next.assumptionIds?.filter((id) => !idSet.has(id));
              next = {
                ...next,
                assumptionIds: remaining && remaining.length > 0 ? remaining : undefined,
                updatedAt: now,
              };
            }
            if (next !== edge) edges[i] = next;
          }
          for (let i = 0; i < steps.length; i += 1) {
            const step = steps[i];
            let next = step;
            if (step.contextId && idSet.has(step.contextId)) {
              next = { ...next, contextId: undefined, updatedAt: now };
            }
            if (step.proofId && idSet.has(step.proofId)) {
              next = { ...next, proofId: undefined, updatedAt: now };
            }
            if (next !== step) steps[i] = next;
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

        case 'create-step': {
          const premiseIds = op.premiseIds.map(resolve);
          const conclusionId = resolve(op.conclusionId);
          const index = draftIndex();
          validateNewStep(index, {
            premiseIds,
            conclusionId,
            rule: op.rule,
            contextId: op.contextId,
            proofId: op.proofId,
          });
          steps.push({
            id: newId(),
            premiseIds,
            conclusionId,
            rule: op.rule.trim(),
            contextId: op.contextId,
            proofId: op.proofId,
            status: 'asserted',
            reviewState: 'unreviewed',
            assertedBy: 'ai',
            createdAt: now,
            updatedAt: now,
          });
          break;
        }

        case 'delete-step': {
          const positionOfStep = steps.findIndex((step) => step.id === op.id);
          if (positionOfStep === -1) throw new ValidationError('id', '推理步骤不存在。');
          steps.splice(positionOfStep, 1);
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
        createdSteps: [],
        deletedStepIds: [],
        selects: [],
      },
      nodes: new Map(original.nodes),
      edges: original.edges,
      steps: original.steps,
      errors,
    };
  }

  return {
    diff: diffOf(original, nodes, edges, steps, selects),
    nodes,
    edges,
    steps,
    errors: [],
  };
}
