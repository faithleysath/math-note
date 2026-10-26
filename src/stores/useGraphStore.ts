import { create } from 'zustand';
import { toast } from 'sonner';
import * as db from '../lib/db';
import { assetFileNames, MAX_ASSET_BYTES, sha256Hex } from '../lib/assets';
import { registerAssetCaption, registerAssetUrl, releaseAssetUrls } from '../lib/markdown';
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
import {
  isContextNode,
  type AssetMeta,
  type BookMeta,
  type Edge,
  type GraphJSONV9,
  type InferenceStep,
  type Node,
} from '../lib/schema';
import { parseGraph, serializeGraph } from '../lib/serialize';
import {
  ValidationError,
  validateBook,
  validateNewEdge,
  validateNewNode,
  validateNewStep,
  validateNodePatch,
  sameRelationKey,
  sameStepKey,
  type NewEdgeInput,
  type NewNodeInput,
  type NewStepInput,
  type NodePatch,
} from '../lib/validate';

type AppStatus = 'loading' | 'ready' | 'error';

/** loadAssetFiles 的结果：每种「没成功」的原因分开报，toast 才好写人话 */
export interface AssetLoadResult {
  /** 哈希对得上、已经写进 IndexedDB 的文件数 */
  matched: number;
  /** 文件名匹配上了，但内容哈希不符 */
  badHash: string[];
  /** 文件名不属于本书的任何资源 */
  unknown: string[];
  /** 超过 MAX_ASSET_BYTES 被跳过的文件 */
  tooLarge: string[];
}

interface GraphState {
  index: GraphIndex;
  book: BookMeta | null;
  status: AppStatus;
  error: string | null;
  selectedId: string | null;
  expandedBranchId: string | null;
  expandedIds: Set<string>;
  editingId: string | null;
  mobileView: 'main' | 'left' | 'right';
  /** assets 表里的元信息条数（不管有没有二进制） */
  assetCount: number;
  /** 有元信息但还没载入二进制、也就是渲染不出来的资源 id */
  missingAssetIds: string[];
  /** 资源 URL 登记 / 释放的版本号；正文靠它触发重渲染 */
  assetsRevision: number;

  init: () => Promise<void>;
  createBook: (book: BookMeta) => Promise<BookMeta>;
  updateBook: (book: BookMeta) => Promise<BookMeta>;
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
    patch: Partial<Pick<Edge, 'condition' | 'note' | 'contextId'>>,
  ) => Promise<void>;
  deleteEdge: (id: string) => Promise<void>;

  createStep: (input: NewStepInput) => Promise<InferenceStep>;
  updateStep: (
    id: string,
    patch: Partial<Pick<InferenceStep, 'rule' | 'note' | 'contextId' | 'proofId'>>,
  ) => Promise<void>;
  deleteStep: (id: string) => Promise<void>;

  exportGraph: () => GraphJSONV9;
  importGraph: (json: unknown) => Promise<void>;
  loadAssetFiles: (files: File[]) => Promise<AssetLoadResult>;
  clearAll: () => Promise<void>;
}

const emptyIndex = (): GraphIndex => buildIndex([], [], []);

function describeError(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 当前教材的资源元信息。
 * exportGraph 是同步的，没法临时查库，所以这里留一份；换教材 / 清空时同步更新。
 */
let assetMetas: AssetMeta[] = [];

/**
 * 释放旧 Blob URL，再给库里所有带二进制的资源建一份新的，
 * 返回「有元信息但没二进制」的 id 列表。换教材时必须先释放，否则 Blob URL 会泄漏。
 * 图注一并登记：没二进制的图也要能显示 caption（见 rehypeAssetScheme）。
 */
async function refreshAssetUrls(metas: AssetMeta[]): Promise<string[]> {
  releaseAssetUrls();
  for (const meta of metas) registerAssetCaption(meta.id, meta.caption);
  const withBinary = new Set<string>();
  for (const record of await db.assetsWithBinary()) {
    registerAssetUrl(record.id, URL.createObjectURL(record.data));
    withBinary.add(record.id);
  }
  return metas.filter((meta) => !withBinary.has(meta.id)).map((meta) => meta.id);
}

// React StrictMode 会重复触发 effect，init 必须只跑一次。
let initStarted = false;

export const useGraphStore = create<GraphState>()((set, get) => {
  const commit = (nodes: Iterable<Node>, edges: Edge[], steps: InferenceStep[]) => {
    set({ index: buildIndex(nodes, edges, steps) });
  };

  const commitNodes = (nodes: Map<string, Node>) => {
    commit(nodes.values(), get().index.edges, get().index.steps);
  };

  return {
    index: emptyIndex(),
    book: null,
    status: 'loading',
    error: null,
    selectedId: null,
    expandedBranchId: null,
    expandedIds: new Set(),
    editingId: null,
    mobileView: 'main',
    assetCount: 0,
    missingAssetIds: [],
    assetsRevision: 0,

    init: async () => {
      if (initStarted) return;
      initStarted = true;
      try {
        const data = await db.loadAll();
        const index = buildIndex(data.nodes, data.edges, data.steps);
        const firstBranch = index.roots[0] ?? null;
        assetMetas = data.assets;
        const missingAssetIds = await refreshAssetUrls(data.assets);
        set({
          index,
          book: data.book,
          status: 'ready',
          error: null,
          expandedBranchId: firstBranch,
          expandedIds: new Set(firstBranch ? [firstBranch] : []),
          selectedId: firstBranch,
          assetCount: data.assets.length,
          missingAssetIds,
          assetsRevision: get().assetsRevision + 1,
        });
      } catch (error) {
        initStarted = false;
        set({ status: 'error', error: describeError(error) });
      }
    },

    createBook: async (input) => {
      validateBook(input);
      const book: BookMeta = {
        subject: input.subject,
        stage: input.stage,
        title: input.title.trim(),
        edition: input.edition?.trim() || undefined,
      };
      const now = Date.now();
      const root: Node = {
        id: crypto.randomUUID(),
        type: 'branch',
        title: book.title,
        content: '',
        parentId: null,
        order: 1024,
        createdAt: now,
        updatedAt: now,
      };
      await db.replaceAll({ book, nodes: [root], edges: [], steps: [] });
      assetMetas = [];
      releaseAssetUrls();
      set({
        index: buildIndex([root], [], []),
        book,
        status: 'ready',
        error: null,
        selectedId: root.id,
        expandedBranchId: root.id,
        expandedIds: new Set([root.id]),
        editingId: null,
        assetCount: 0,
        missingAssetIds: [],
        assetsRevision: get().assetsRevision + 1,
      });
      return book;
    },

    updateBook: async (input) => {
      const state = get();
      const current = state.book;
      if (!current) {
        throw new ValidationError('book', '当前还没有教材，无法编辑教材信息。');
      }
      validateBook(input);

      const book: BookMeta = {
        subject: input.subject,
        stage: input.stage,
        title: input.title.trim(),
        edition: input.edition?.trim() || undefined,
      };

      const now = Date.now();
      const nodesToPut: Node[] = [];
      const nodes = new Map(state.index.nodes);

      // 新建教材时根分支就是书名；只有一个根分支且仍叫旧书名时，一起改名。
      if (state.index.roots.length === 1) {
        const root = state.index.nodes.get(state.index.roots[0]);
        if (root?.type === 'branch' && root.title === current.title && root.title !== book.title) {
          const nextRoot = { ...root, title: book.title, updatedAt: now };
          nodes.set(root.id, nextRoot);
          nodesToPut.push(nextRoot);
        }
      }

      await db.updateBook(book, nodesToPut);
      set({
        book,
        index: buildIndex(nodes.values(), state.index.edges, state.index.steps),
      });
      return book;
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
      if (!state.book) {
        throw new ValidationError('book', '请先新建或导入教材，再添加内容。');
      }
      validateNewNode(state.index, input);

      const now = Date.now();
      const position = computeInsertOrder(state.index, input.parentId, input.afterId);
      const node: Node = {
        id: crypto.randomUUID(),
        type: input.type,
        kind: input.kind || undefined,
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
        const probe = buildIndex(nodes.values(), state.index.edges, state.index.steps);
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
        index: buildIndex(nodes.values(), state.index.edges, state.index.steps),
        editingId: node.id,
        selectedId: node.id,
      });
      return node;
    },

    updateNode: async (id, patch) => {
      const state = get();
      validateNodePatch(state.index, id, patch);

      const existing = state.index.nodes.get(id);
      if (!existing) throw new ValidationError('id', '节点不存在。');

      const now = Date.now();
      const apply = (node: Node): Node => ({
        ...node,
        title: patch.title !== undefined ? patch.title.trim() : node.title,
        kind: patch.kind !== undefined ? (patch.kind || undefined) : node.kind,
        content: patch.content !== undefined ? patch.content : node.content,
        solution: patch.solution !== undefined ? patch.solution : node.solution,
        key: patch.key !== undefined ? (patch.key === null ? undefined : patch.key) : node.key,
        aliases: patch.aliases !== undefined ? patch.aliases : node.aliases,
        tags: patch.tags !== undefined ? patch.tags : node.tags,
        citation: patch.citation !== undefined ? (patch.citation ?? undefined) : node.citation,
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

      const ids = collectSubtree(state.index, id);
      const idSet = new Set(ids);
      const edgeIds = state.index.edges
        .filter((edge) => idSet.has(edge.from) || idSet.has(edge.to))
        .map((edge) => edge.id);

      const nodes = new Map(state.index.nodes);
      for (const nodeId of ids) nodes.delete(nodeId);
      const edges = state.index.edges.filter((edge) => !idSet.has(edge.from) && !idSet.has(edge.to));
      const steps = state.index.steps.filter(
        (step) => !idSet.has(step.conclusionId) && !step.premiseIds.some((id) => idSet.has(id)),
      );

      // 引用被删节点的地方不能留悬空指针：清掉语境、前提、所属证明
      const now = Date.now();
      const changedEdges: Edge[] = [];
      const patchedEdges = edges.map((edge) => {
        let next = edge;
        if (edge.contextId && idSet.has(edge.contextId)) {
          next = { ...next, contextId: undefined, updatedAt: now };
        }
        if (next !== edge) changedEdges.push(next);
        return next;
      });

      const changedSteps: InferenceStep[] = [];
      const patchedSteps = steps.map((step) => {
        let next = step;
        if (step.contextId && idSet.has(step.contextId)) {
          next = { ...next, contextId: undefined, updatedAt: now };
        }
        if (step.proofId && idSet.has(step.proofId)) {
          next = { ...next, proofId: undefined, updatedAt: now };
        }
        if (next !== step) changedSteps.push(next);
        return next;
      });

      // 删除 + 引用清理放在同一个事务里
      await db.deleteNodesCascade(ids, edgeIds, {
        putEdges: changedEdges,
        putSteps: changedSteps,
      });

      const expanded = new Set(get().expandedIds);
      for (const nodeId of ids) expanded.delete(nodeId);

      const nextIndex = buildIndex(nodes.values(), patchedEdges, patchedSteps);
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
        contextId: input.contextId || undefined,
        assertedBy: input.assertedBy ?? 'manual',
        createdAt: now,
        updatedAt: now,
      };

      await db.putEdges([edge]);
      set({
        index: buildIndex(state.index.nodes.values(), [...state.index.edges, edge], state.index.steps),
      });

      if (warnings.length > 0) {
        toast.warning(warnings[0].message);
      }
      return edge;
    },

    updateEdge: async (id, patch) => {
      const state = get();
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
      set({ index: buildIndex(state.index.nodes.values(), edges, state.index.steps) });
    },

    deleteEdge: async (id) => {
      const state = get();
      await db.removeEdges([id]);
      const edges = state.index.edges.filter((edge) => edge.id !== id);
      set({ index: buildIndex(state.index.nodes.values(), edges, state.index.steps) });
    },

    // -------------------------------------------------------------------------
    // 推理步骤（超边）
    // -------------------------------------------------------------------------
    createStep: async (input) => {
      const state = get();
      validateNewStep(state.index, input);

      const now = Date.now();
      const step: InferenceStep = {
        id: crypto.randomUUID(),
        premiseIds: [...input.premiseIds],
        conclusionId: input.conclusionId,
        rule: input.rule.trim(),
        contextId: input.contextId || undefined,
        proofId: input.proofId || undefined,
        note: input.note || undefined,
        assertedBy: input.assertedBy ?? 'manual',
        createdAt: now,
        updatedAt: now,
      };

      await db.putSteps([step]);
      set({
        index: buildIndex(
          state.index.nodes.values(),
          state.index.edges,
          [...state.index.steps, step],
        ),
      });
      return step;
    },

    updateStep: async (id, patch) => {
      const state = get();
      const existing = state.index.steps.find((step) => step.id === id);
      if (!existing) throw new ValidationError('id', '推理步骤不存在。');

      const next: InferenceStep = { ...existing, ...patch, updatedAt: Date.now() };

      if (patch.contextId) {
        const context = state.index.nodes.get(patch.contextId);
        if (!context || !isContextNode(context)) {
          throw new ValidationError('contextId', '语境必须指向一个「语境」节点。');
        }
      }
      if (patch.proofId) {
        if (state.index.nodes.get(patch.proofId)?.type !== 'proof') {
          throw new ValidationError('proofId', '所属证明必须指向一个「证明」节点。');
        }
      }
      const duplicate = state.index.steps.find(
        (step) => step.id !== id && sameStepKey(step, next),
      );
      if (duplicate) throw new ValidationError('rule', '这个推理步骤已经存在了。');

      await db.putSteps([next]);
      const steps = state.index.steps.map((step) => (step.id === id ? next : step));
      set({
        index: buildIndex(state.index.nodes.values(), state.index.edges, steps),
      });
    },

    deleteStep: async (id) => {
      const state = get();
      await db.removeSteps([id]);
      const steps = state.index.steps.filter((step) => step.id !== id);
      set({
        index: buildIndex(state.index.nodes.values(), state.index.edges, steps),
      });
    },

    // -------------------------------------------------------------------------
    // 导入 / 导出
    // -------------------------------------------------------------------------
    exportGraph: () => {
      const book = get().book;
      if (!book) {
        throw new ValidationError('book', '请先新建或导入一本教材，再导出。');
      }
      return serializeGraph(
        book,
        [...get().index.nodes.values()],
        get().index.edges,
        get().index.steps,
        { assets: [...assetMetas] },
      );
    },

    importGraph: async (json) => {
      const parsed = parseGraph(json);
      // 二进制在 JSON 里不存在，这里只落元信息；用户之后用 loadAssetFiles 补图
      await db.replaceAll({
        book: parsed.book,
        nodes: parsed.nodes,
        edges: parsed.edges,
        steps: parsed.steps,
        assets: parsed.assets,
      });
      assetMetas = parsed.assets;
      const missingAssetIds = await refreshAssetUrls(parsed.assets);
      const index = buildIndex(parsed.nodes, parsed.edges, parsed.steps);
      set({
        index,
        book: parsed.book,
        status: 'ready',
        error: null,
        selectedId: index.roots[0] ?? null,
        expandedBranchId: index.roots[0] ?? null,
        expandedIds: new Set(index.roots.slice(0, 1)),
        editingId: null,
        assetCount: parsed.assets.length,
        missingAssetIds,
        assetsRevision: get().assetsRevision + 1,
      });
    },

    /**
     * 载入本地图片：文件名对得上 → 算 SHA-256 → 只写哈希一致的。
     * 不会新建资源行（putAssetBinaries 找不到行会报错），对不上的一律不落库。
     */
    loadAssetFiles: async (files) => {
      const result: AssetLoadResult = { matched: 0, badHash: [], unknown: [], tooLarge: [] };
      const metas = await db.loadAssetMetas();
      assetMetas = metas;

      // 文件名 → 候选资源。同名资源不止一个时靠哈希挑，不猜。
      const byName = new Map<string, AssetMeta[]>();
      for (const meta of metas) {
        for (const name of assetFileNames(meta)) {
          const candidates = byName.get(name);
          if (candidates) {
            if (!candidates.includes(meta)) candidates.push(meta);
          } else {
            byName.set(name, [meta]);
          }
        }
      }

      const missingBefore = new Set(await db.assetsWithoutBinary());
      const writes: { id: string; data: Blob }[] = [];

      for (const file of files) {
        if (file.size > MAX_ASSET_BYTES) {
          result.tooLarge.push(file.name);
          continue;
        }
        const candidates = byName.get(file.name);
        if (!candidates?.length) {
          result.unknown.push(file.name);
          continue;
        }

        const bytes = await file.arrayBuffer();
        const digest = await sha256Hex(bytes);
        const hit = candidates.find((meta) => meta.sha256 === digest);
        if (!hit) {
          result.badHash.push(file.name);
          continue;
        }

        // 同一张图被选了两遍时只写一次
        if (writes.every((item) => item.id !== hit.id)) {
          writes.push({ id: hit.id, data: new Blob([bytes], { type: hit.mimeType }) });
        }
        result.matched += 1;
      }

      if (writes.length > 0) {
        await db.putAssetBinaries(writes);
        for (const item of writes) {
          // 本来就有图的不重建 URL，否则旧 Blob URL 会被覆盖掉、泄漏
          if (missingBefore.has(item.id)) {
            registerAssetUrl(item.id, URL.createObjectURL(item.data));
          }
        }
      }

      set({
        assetCount: metas.length,
        missingAssetIds: await db.assetsWithoutBinary(),
        assetsRevision: get().assetsRevision + 1,
      });
      return result;
    },

    clearAll: async () => {
      await db.clearAll();
      assetMetas = [];
      releaseAssetUrls();
      set({
        index: emptyIndex(),
        book: null,
        selectedId: null,
        expandedBranchId: null,
        expandedIds: new Set(),
        editingId: null,
        assetCount: 0,
        missingAssetIds: [],
        assetsRevision: get().assetsRevision + 1,
      });
    },

  };
});

// =============================================================================
// 辅助
// =============================================================================

export function selectedNode(state: GraphState): Node | null {
  return state.selectedId ? (state.index.nodes.get(state.selectedId) ?? null) : null;
}

export function childrenOf(state: GraphState, parentId: string | null): Node[] {
  return childIds(state.index, parentId)
    .map((id) => state.index.nodes.get(id))
    .filter((node): node is Node => Boolean(node));
}
