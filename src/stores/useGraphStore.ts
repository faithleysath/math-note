import { create } from 'zustand';
import { toast } from 'sonner';
import * as db from '../lib/db';
import {
  ancestorIds,
  buildIndex,
  collectSubtree,
  computeInsertOrder,
  childIds,
  rebalancedOrders,
  siblingIds,
  type GraphIndex,
} from '../lib/graph';
import { canonicalizePair } from '../lib/predicates';
import type { AiOperation, Edge, GraphJSON, Node } from '../lib/schema';
import { parseGraph, serializeGraph } from '../lib/serialize';
import { simulateOperations, type DraftDiff } from '../lib/draft';
import {
  ValidationError,
  validateNewEdge,
  validateNewNode,
  validateNodePatch,
  validateGraphInvariants,
  sameRelationKey,
  findConflictHints,
  type NewEdgeInput,
  type NewNodeInput,
  type NodePatch,
} from '../lib/validate';

export type AppStatus = 'loading' | 'ready' | 'error';

export interface GraphState {
  index: GraphIndex;
  status: AppStatus;
  error: string | null;
  readOnly: boolean;
  sourceLabel: string;
  selectedId: string | null;
  expandedBranchId: string | null;
  expandedIds: Set<string>;
  editingId: string | null;
  mobileView: 'main' | 'left' | 'right';

  init: () => Promise<void>;
  select: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  setExpandedBranch: (id: string | null) => void;
  setMobileView: (view: 'main' | 'left' | 'right') => void;

  createNode: (input: NewNodeInput) => Promise<Node>;
  updateNode: (id: string, patch: NodePatch) => Promise<void>;
  deleteSubtree: (id: string) => Promise<number>;
  moveSibling: (id: string, direction: 'up' | 'down') => Promise<void>;

  createEdge: (input: NewEdgeInput) => Promise<Edge>;
  updateEdge: (
    id: string,
    patch: Partial<Pick<Edge, 'condition' | 'note' | 'status' | 'reviewState' | 'contextId' | 'assumptionIds'>>,
  ) => Promise<void>;
  deleteEdge: (id: string) => Promise<void>;

  exportGraph: () => GraphJSON;
  importGraph: (json: unknown) => Promise<void>;
  loadSnapshot: (json: unknown, label: string) => Promise<void>;
  clearAll: () => Promise<void>;
  applyAiOperations: (ops: AiOperation[]) => Promise<{ applied: number; errors: string[] }>;
  previewAiOperations: (ops: AiOperation[]) => {
    errors: string[];
    warnings: string[];
    diff: DraftDiff | null;
  };
  diagnose: () => { errors: string[]; warnings: string[] };
}

const emptyIndex = (): GraphIndex => buildIndex([], []);

function assertWritable(state: GraphState) {
  if (state.readOnly) {
    throw new ValidationError('readOnly', '当前是只读模式，不能修改。');
  }
}

function describeError(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useGraphStore = create<GraphState>()((set, get) => {
  const commit = (nodes: Iterable<Node>, edges: Edge[]) => {
    set({ index: buildIndex(nodes, edges) });
  };

  const commitNodes = (nodes: Map<string, Node>) => {
    commit(nodes.values(), get().index.edges);
  };

  return {
    index: emptyIndex(),
    status: 'loading',
    error: null,
    readOnly: false,
    sourceLabel: '本地',
    selectedId: null,
    expandedBranchId: null,
    expandedIds: new Set(),
    editingId: null,
    mobileView: 'main',

    init: async () => {
      try {
        const data = await db.loadAll();
        const index = buildIndex(data.nodes, data.edges);
        const firstBranch = index.roots[0] ?? null;
        set({
          index,
          status: 'ready',
          error: null,
          readOnly: false,
          sourceLabel: '本地',
          expandedBranchId: firstBranch,
          expandedIds: new Set(firstBranch ? [firstBranch] : []),
          selectedId: firstBranch,
        });
      } catch (error) {
        set({ status: 'error', error: describeError(error) });
      }
    },

    select: (id) => {
      if (!id) {
        set({ selectedId: null });
        return;
      }
      // 选中时自动展开它的祖先链，和原版行为保持一致
      const next = new Set(get().expandedIds);
      for (const ancestorId of ancestorIds(get().index, id)) next.add(ancestorId);
      set({ selectedId: id, expandedIds: next });
    },

    setMobileView: (view) => set({ mobileView: view }),

    setEditing: (id) => set({ editingId: id }),

    toggleExpanded: (id) => {
      const next = new Set(get().expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      set({ expandedIds: next });
    },

    setExpandedBranch: (id) => {
      const next = new Set(get().expandedIds);
      if (id) next.add(id);
      set({ expandedBranchId: id, expandedIds: next });
    },

    // -------------------------------------------------------------------------
    // 节点写入
    // -------------------------------------------------------------------------
    createNode: async (input) => {
      const state = get();
      assertWritable(state);
      validateNewNode(state.index, input);

      const now = Date.now();
      const position = computeInsertOrder(state.index, input.parentId, input.afterId);
      const node: Node = {
        id: crypto.randomUUID(),
        type: input.type,
        title: input.title.trim(),
        content: input.content ?? '',
        solution: input.solution,
        parentId: input.parentId,
        order: position.order,
        key: input.key || undefined,
        aliases: input.aliases?.length ? input.aliases : undefined,
        tags: input.tags?.length ? input.tags : undefined,
        citation: input.citation,
        attempt: input.attempt,
        createdAt: now,
        updatedAt: now,
      };

      const nodes = new Map(state.index.nodes);
      nodes.set(node.id, node);

      let toPersist: Node[] = [node];
      if (position.rebalance) {
        // 间隙用尽：把这一组兄弟重新等距排布（含新节点）
        const probe = buildIndex(nodes.values(), state.index.edges);
        const orders = rebalancedOrders(probe, input.parentId);
        const updated: Node[] = [];
        for (const [id, order] of orders) {
          const existing = nodes.get(id);
          if (!existing) continue;
          const next = { ...existing, order, updatedAt: now };
          nodes.set(id, next);
          updated.push(next);
        }
        toPersist = updated;
      }

      await db.putNodes(toPersist);
      set({
        index: buildIndex(nodes.values(), state.index.edges),
        editingId: node.id,
        selectedId: node.id,
      });
      return node;
    },

    updateNode: async (id, patch) => {
      const state = get();
      assertWritable(state);
      validateNodePatch(state.index, id, patch);

      const existing = state.index.nodes.get(id);
      if (!existing) throw new ValidationError('id', '节点不存在。');

      const now = Date.now();
      const apply = (node: Node): Node => ({
        ...node,
        title: patch.title !== undefined ? patch.title.trim() : node.title,
        content: patch.content !== undefined ? patch.content : node.content,
        solution: patch.solution !== undefined ? patch.solution : node.solution,
        key: patch.key !== undefined ? (patch.key === null ? undefined : patch.key) : node.key,
        aliases: patch.aliases !== undefined ? patch.aliases : node.aliases,
        tags: patch.tags !== undefined ? patch.tags : node.tags,
        citation: patch.citation !== undefined ? patch.citation : node.citation,
        attempt: patch.attempt !== undefined ? patch.attempt : node.attempt,
        updatedAt: now,
      });

      const nodes = new Map(state.index.nodes);

      if (patch.parentId !== undefined && patch.parentId !== existing.parentId) {
        // 移动节点：给它排在目标父节点末尾
        const position = computeInsertOrder(state.index, patch.parentId, null);
        nodes.set(id, { ...apply(existing), parentId: patch.parentId, order: position.order });
        const moved = nodes.get(id) as Node;
        await db.putNodes([moved]);
        commitNodes(nodes);
        return;
      }

      const next = apply(existing);
      nodes.set(id, next);
      await db.putNodes([next]);
      commitNodes(nodes);
    },

    deleteSubtree: async (id) => {
      const state = get();
      assertWritable(state);

      const ids = collectSubtree(state.index, id);
      const idSet = new Set(ids);
      const edgeIds = state.index.edges
        .filter((edge) => idSet.has(edge.from) || idSet.has(edge.to))
        .map((edge) => edge.id);

      await db.deleteNodesCascade(ids, edgeIds);

      const nodes = new Map(state.index.nodes);
      for (const nodeId of ids) nodes.delete(nodeId);
      const edges = state.index.edges.filter((edge) => !idSet.has(edge.from) && !idSet.has(edge.to));

      const expanded = new Set(get().expandedIds);
      for (const nodeId of ids) expanded.delete(nodeId);

      const nextIndex = buildIndex(nodes.values(), edges);
      const selectedId = get().selectedId;
      set({
        index: nextIndex,
        expandedIds: expanded,
        selectedId: selectedId && idSet.has(selectedId) ? null : selectedId,
        editingId: null,
        expandedBranchId:
          get().expandedBranchId && idSet.has(get().expandedBranchId as string)
            ? (nextIndex.roots[0] ?? null)
            : get().expandedBranchId,
      });
      return ids.length;
    },

    moveSibling: async (id, direction) => {
      const state = get();
      assertWritable(state);

      const siblings = siblingIds(state.index, id);
      const position = siblings.indexOf(id);
      if (position === -1) return;
      const target = direction === 'up' ? position - 1 : position + 1;
      if (target < 0 || target >= siblings.length) return;

      const node = state.index.nodes.get(id);
      const neighbor = state.index.nodes.get(siblings[target]);
      if (!node || !neighbor) return;

      const parentId = node.parentId;
      const nodes = new Map(state.index.nodes);

      if (node.order === neighbor.order) {
        // order 相同（历史上用小数插过）→ 先整组重排
        const orders = rebalancedOrders(state.index, parentId);
        const now = Date.now();
        const updated: Node[] = [];
        for (const [nodeId, order] of orders) {
          const existing = nodes.get(nodeId);
          if (!existing) continue;
          const next = { ...existing, order, updatedAt: now };
          nodes.set(nodeId, next);
          updated.push(next);
        }
        await db.putNodes(updated);
        commitNodes(nodes);
        await get().moveSibling(id, direction);
        return;
      }

      const now = Date.now();
      const swapped = { ...node, order: neighbor.order, updatedAt: now };
      const swappedNeighbor = { ...neighbor, order: node.order, updatedAt: now };
      nodes.set(node.id, swapped);
      nodes.set(neighbor.id, swappedNeighbor);
      await db.putNodes([swapped, swappedNeighbor]);
      commitNodes(nodes);
    },

    // -------------------------------------------------------------------------
    // 边写入
    // -------------------------------------------------------------------------
    createEdge: async (input) => {
      const state = get();
      assertWritable(state);

      const canonical = canonicalizePair(input.predicate, input.from, input.to);
      // 不再自动删除任何旧关系：不同前提/语境的断言必须共存
      const { warnings } = validateNewEdge(state.index, { ...input, ...canonical });

      const now = Date.now();
      const edge: Edge = {
        id: crypto.randomUUID(),
        from: canonical.from,
        to: canonical.to,
        predicate: input.predicate,
        condition: input.condition || undefined,
        note: input.note || undefined,
        status: input.status ?? 'asserted',
        // 人工录入也只是「未审核」，不能自动升级成已检查
        reviewState: input.reviewState ?? 'unreviewed',
        contextId: input.contextId || undefined,
        assumptionIds: input.assumptionIds?.length ? input.assumptionIds : undefined,
        assertedBy: input.assertedBy ?? 'manual',
        model: input.model,
        createdAt: now,
        updatedAt: now,
      };

      await db.putEdges([edge]);
      set({ index: buildIndex(state.index.nodes.values(), [...state.index.edges, edge]) });

      if (warnings.length > 0) {
        toast.warning(warnings[0].message);
      }
      return edge;
    },

    updateEdge: async (id, patch) => {
      const state = get();
      assertWritable(state);
      const existing = state.index.edges.find((edge) => edge.id === id);
      if (!existing) throw new ValidationError('id', '关系不存在。');

      const next: Edge = { ...existing, ...patch, updatedAt: Date.now() };

      // 改了前提/语境之后不能和别的边变成同一条
      const duplicate = state.index.edges.find(
        (edge) => edge.id !== id && sameRelationKey(edge, next),
      );
      if (duplicate) {
        throw new ValidationError('predicate', '这个条件下已经有一条相同的关系了。');
      }

      await db.putEdges([next]);
      const edges = state.index.edges.map((edge) => (edge.id === id ? next : edge));
      set({ index: buildIndex(state.index.nodes.values(), edges) });
    },

    deleteEdge: async (id) => {
      const state = get();
      assertWritable(state);
      await db.removeEdges([id]);
      const edges = state.index.edges.filter((edge) => edge.id !== id);
      set({ index: buildIndex(state.index.nodes.values(), edges) });
    },

    // -------------------------------------------------------------------------
    // 导入 / 导出 / 快照
    // -------------------------------------------------------------------------
    exportGraph: () => serializeGraph([...get().index.nodes.values()], get().index.edges),

    importGraph: async (json) => {
      const parsed = parseGraph(json);
      await db.replaceAll({ nodes: parsed.nodes, edges: parsed.edges });
      const index = buildIndex(parsed.nodes, parsed.edges);
      set({
        index,
        status: 'ready',
        error: null,
        readOnly: false,
        sourceLabel: '本地',
        selectedId: index.roots[0] ?? null,
        expandedBranchId: index.roots[0] ?? null,
        expandedIds: new Set(index.roots.slice(0, 1)),
        editingId: null,
      });
      if (parsed.migration) {
        toast.success(
          `已从旧格式迁移：生成 ${parsed.migration.proofsCreated} 个证明节点（原有 solution 内容保留）。`,
        );
      }
    },

    loadSnapshot: async (json, label) => {
      const parsed = parseGraph(json);
      const index = buildIndex(parsed.nodes, parsed.edges);
      set({
        index,
        status: 'ready',
        error: null,
        readOnly: true,
        sourceLabel: label,
        selectedId: index.roots[0] ?? null,
        expandedBranchId: index.roots[0] ?? null,
        expandedIds: new Set(index.roots.slice(0, 1)),
        editingId: null,
      });
    },

    clearAll: async () => {
      await db.clearAll();
      set({
        index: emptyIndex(),
        selectedId: null,
        expandedBranchId: null,
        expandedIds: new Set(),
        editingId: null,
      });
    },

    // -------------------------------------------------------------------------
    // AI 批量操作
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // AI 批量操作：先整批模拟，再一次性事务提交
    // -------------------------------------------------------------------------
    previewAiOperations: (ops) => {
      const state = get();
      const simulation = simulateOperations(state.index, ops);
      if (simulation.errors.length > 0) {
        return { errors: simulation.errors, warnings: [], diff: null };
      }
      const issues = validateGraphInvariants({
        nodes: [...simulation.nodes.values()],
        edges: simulation.edges,
      });
      const errors = issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
      const warnings = issues
        .filter((issue) => issue.severity === 'warning')
        .map((issue) => issue.message);
      return {
        errors,
        warnings,
        diff: errors.length > 0 ? null : simulation.diff,
      };
    },

    applyAiOperations: async (ops) => {
      const state = get();
      try {
        assertWritable(state);
      } catch (error) {
        return { applied: 0, errors: [describeError(error)] };
      }

      const simulation = simulateOperations(state.index, ops);
      if (simulation.errors.length > 0) {
        toast.error(simulation.errors[0]);
        return { applied: 0, errors: simulation.errors };
      }

      const issues = validateGraphInvariants({
        nodes: [...simulation.nodes.values()],
        edges: simulation.edges,
      });
      const errors = issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        toast.error(errors[0].message);
        return { applied: 0, errors: errors.map((issue) => issue.message) };
      }

      const { diff } = simulation;
      try {
        // 单事务：任何一步失败都整体回滚，不留半成品
        await db.applyBatch({
          putNodes: [...diff.createdNodes, ...diff.updatedNodes],
          deleteNodeIds: diff.deletedNodeIds,
          putEdges: diff.createdEdges,
          deleteEdgeIds: diff.deletedEdgeIds,
        });
      } catch (error) {
        const message = describeError(error);
        toast.error(`写入失败，未做任何修改：${message}`);
        return { applied: 0, errors: [message] };
      }

      set({ index: buildIndex(simulation.nodes.values(), simulation.edges) });

      // select 是纯 UI 操作，事务成功之后才应用
      const lastSelect = diff.selects.at(-1);
      if (lastSelect && simulation.nodes.has(lastSelect)) {
        get().select(lastSelect);
      }

      toast.success(`AI 的 ${ops.length} 个操作已全部提交。`);
      return { applied: ops.length, errors: [] };
    },

    diagnose: () => {
      const state = get();
      const issues = validateGraphInvariants({
        nodes: [...state.index.nodes.values()],
        edges: state.index.edges,
      });
      const hints = findConflictHints(state.index);
      return {
        errors: issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message),
        warnings: [
          ...issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message),
          ...hints.map((hint) => hint.message),
        ],
      };
    },
  };
});

// =============================================================================
// 辅助
// =============================================================================

export function selectedNode(state: GraphState): Node | null {
  return state.selectedId ? (state.index.nodes.get(state.selectedId) ?? null) : null;
}

export function branchNodes(state: GraphState): Node[] {
  return state.index.roots
    .map((id) => state.index.nodes.get(id))
    .filter((node): node is Node => Boolean(node));
}

export function childrenOf(state: GraphState, parentId: string | null): Node[] {
  return childIds(state.index, parentId)
    .map((id) => state.index.nodes.get(id))
    .filter((node): node is Node => Boolean(node));
}
