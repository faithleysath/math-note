import Dexie, { type Table } from 'dexie';
import type { Edge, InferenceStep, Node } from './schema';

/**
 * 持久化层。
 *
 * 只用 parentId + order 两个字段表达层级，不再有 children 数组，
 * 所以任何一次写操作都只动一个节点，「父节点数组」和「子节点 parentId」
 * 不一致这类问题从结构上就不可能出现。
 *
 * 应用启动时一次性全量读入内存，之后所有遍历 / 编号 / 搜索都在内存里做，
 * 这里只是落盘。
 */
export class MathNoteDB extends Dexie {
  nodes!: Table<Node, string>;
  edges!: Table<Edge, string>;
  steps!: Table<InferenceStep, string>;

  constructor() {
    super('math-note-graph');
    this.version(1).stores({
      nodes: '&id, type, key, parentId',
      edges: '&id, from, to, predicate',
    });
    // v2：新增推理步骤（超边）表
    this.version(2).stores({
      nodes: '&id, type, key, parentId',
      edges: '&id, from, to, predicate',
      steps: '&id, conclusionId, *premiseIds',
    });
  }
}

export const db = new MathNoteDB();

export async function loadAll(): Promise<{
  nodes: Node[];
  edges: Edge[];
  steps: InferenceStep[];
}> {
  const [nodes, edges, steps] = await Promise.all([
    db.nodes.toArray(),
    db.edges.toArray(),
    db.steps.toArray(),
  ]);
  return { nodes, edges, steps };
}

export async function putNodes(nodes: Node[]): Promise<void> {
  if (nodes.length === 0) return;
  await db.nodes.bulkPut(nodes);
}

export async function putEdges(edges: Edge[]): Promise<void> {
  if (edges.length === 0) return;
  await db.edges.bulkPut(edges);
}

export async function removeNodes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.nodes.bulkDelete(ids);
}

export async function removeEdges(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.edges.bulkDelete(ids);
}

export async function putSteps(steps: InferenceStep[]): Promise<void> {
  if (steps.length === 0) return;
  await db.steps.bulkPut(steps);
}

export async function removeSteps(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.steps.bulkDelete(ids);
}

/** 级联删除：节点 + 它牵连的所有边，同一个事务里完成 */
export async function deleteNodesCascade(ids: string[], edgeIds: string[]): Promise<void> {
  const idSet = new Set(ids);
  await db.transaction('rw', db.nodes, db.edges, db.steps, async () => {
    await db.nodes.bulkDelete(ids);
    const todo = new Set(edgeIds);
    // 兜底：库里任何一端命中的边都删掉，防止调用方算漏
    await db.edges.each((edge) => {
      if (idSet.has(edge.from) || idSet.has(edge.to)) todo.add(edge.id);
    });
    await db.edges.bulkDelete([...todo]);

    // 推理步骤只要有一端被删掉就整体失效
    const stepIds: string[] = [];
    await db.steps.each((step) => {
      if (idSet.has(step.conclusionId) || step.premiseIds.some((premiseId) => idSet.has(premiseId))) {
        stepIds.push(step.id);
      }
    });
    await db.steps.bulkDelete(stepIds);
  });
}

export interface GraphBatch {
  putNodes?: Node[];
  deleteNodeIds?: string[];
  putEdges?: Edge[];
  deleteEdgeIds?: string[];
  putSteps?: InferenceStep[];
  deleteStepIds?: string[];
}

/**
 * 一批变更要么全部落盘，要么全部不落盘。
 * AI 批量写入 / 迁移 / 级联删除都走这里。
 */
export async function applyBatch(batch: GraphBatch): Promise<void> {
  await db.transaction('rw', db.nodes, db.edges, db.steps, async () => {
    if (batch.putNodes?.length) await db.nodes.bulkPut(batch.putNodes);
    if (batch.deleteNodeIds?.length) await db.nodes.bulkDelete(batch.deleteNodeIds);
    if (batch.putEdges?.length) await db.edges.bulkPut(batch.putEdges);
    if (batch.deleteEdgeIds?.length) await db.edges.bulkDelete(batch.deleteEdgeIds);
    if (batch.putSteps?.length) await db.steps.bulkPut(batch.putSteps);
    if (batch.deleteStepIds?.length) await db.steps.bulkDelete(batch.deleteStepIds);
  });
}

export async function replaceAll(data: {
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
}): Promise<void> {
  await db.transaction('rw', db.nodes, db.edges, db.steps, async () => {
    await db.nodes.clear();
    await db.edges.clear();
    await db.steps.clear();
    await db.nodes.bulkAdd(data.nodes);
    await db.edges.bulkAdd(data.edges);
    if (data.steps?.length) await db.steps.bulkAdd(data.steps);
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.nodes, db.edges, db.steps, async () => {
    await db.nodes.clear();
    await db.edges.clear();
    await db.steps.clear();
  });
}
