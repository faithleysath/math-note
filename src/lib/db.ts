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
class MathNoteDB extends Dexie {
  nodes!: Table<Node, string>;
  edges!: Table<Edge, string>;
  steps!: Table<InferenceStep, string>;

  constructor() {
    // 只有一种数据格式（v6），这里不再维护历史版本或是迁移用的辅助表
    super('math-note-graph-v6');
    this.version(1).stores({
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
/**
 * 删除子树：删节点、删两端命中的边、删失效的推理步骤，
 * 并在**同一个事务**里写回被清理了引用（contextId / proofId）的关系。
 *
 * 拆成两个事务的话，第一步提交后第二步失败就会留下悬空引用。
 */
export async function deleteNodesCascade(
  ids: string[],
  edgeIds: string[],
  followUp: { putEdges?: Edge[]; putSteps?: InferenceStep[] } = {},
): Promise<void> {
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

    // 同事务写回清理过引用的关系
    if (followUp.putEdges?.length) await db.edges.bulkPut(followUp.putEdges);
    if (followUp.putSteps?.length) await db.steps.bulkPut(followUp.putSteps);
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
