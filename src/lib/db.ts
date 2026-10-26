import Dexie, { type Table } from 'dexie';
import type { AssetMeta, BookMetaV9, Edge, InferenceStep, Node } from './schema';

/**
 * 持久化层。
 *
 * 只用 parentId + order 两个字段表达层级，不再有 children 数组，
 * 所以任何一次写操作都只动一个节点，「父节点数组」和「子节点 parentId」
 * 不一致这类问题从结构上就不可能出现。
 *
 * 应用启动时一次性全量读入内存，之后所有遍历 / 编号 / 搜索都在内存里做，
 * 这里只是落盘。v8 起多一张单行 meta 表保存 book；
 * 导入/新建时 book + nodes + edges + steps（v9 起还有 assets）在同一个事务里替换。
 *
 * v9 只加了一张 assets 表（asset:// 引用的本地媒体），
 * 库名保持 textbook-graph-v8 不变，避免老用户的库变成另一个库。
 */
class MathNoteDB extends Dexie {
  nodes!: Table<Node, string>;
  edges!: Table<Edge, string>;
  steps!: Table<InferenceStep, string>;
  meta!: Table<BookRecord, string>;
  assets!: Table<AssetRecord, string>;

  constructor() {
    super('textbook-graph-v8');
    this.version(1).stores({
      nodes: '&id, type, key, parentId',
      edges: '&id, from, to, predicate',
      steps: '&id, conclusionId, *premiseIds',
      meta: '&id',
    });
    // v9：媒体资源元信息 + blob 存在同一张表，按 id 主键
    this.version(2).stores({
      nodes: '&id, type, key, parentId',
      edges: '&id, from, to, predicate',
      steps: '&id, conclusionId, *premiseIds',
      meta: '&id',
      assets: '&id',
    });
  }
}

export interface BookRecord extends BookMetaV9 {
  id: 'active';
}

/**
 * assets 表的一行：元信息 + 可选二进制。
 *
 * JSON 导入后只有元信息没有二进制（这是真实状态，不能用空 Blob 假装有），
 * 用户载入本地图片文件夹后由 putAssetBinaries 补上 data。
 */
export type AssetRecord = AssetMeta & { data?: Blob };

/** 有二进制的那种行 */
type AssetRecordWithBlob = AssetRecord & { data: Blob };

/** 不用 instanceof Blob：结构化克隆回来的可能不是同一个构造器实例 */
function hasBinary(record: AssetRecord): record is AssetRecordWithBlob {
  return record.data != null && typeof record.data.size === 'number';
}

export const db = new MathNoteDB();

/** 去掉 blob，只留可以写进 JSON 的元信息 */
function toAssetMeta(record: AssetRecord): AssetMeta {
  return {
    id: record.id,
    path: record.path,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    sha256: record.sha256,
    alt: record.alt,
    originalName: record.originalName,
  };
}

function toBookMeta(record: BookRecord): BookMetaV9 {
  const book: BookMetaV9 & { id?: string } = { ...record };
  delete book.id;
  return book;
}

export async function loadAll(): Promise<{
  book: BookMetaV9 | null;
  nodes: Node[];
  edges: Edge[];
  steps: InferenceStep[];
  /** v9：只返回元信息，blob 用 getAssetBlob 单独取 */
  assets: AssetMeta[];
}> {
  const [bookRecord, nodes, edges, steps, assets] = await Promise.all([
    db.meta.get('active'),
    db.nodes.toArray(),
    db.edges.toArray(),
    db.steps.toArray(),
    loadAssetMetas(),
  ]);
  return {
    book: bookRecord ? toBookMeta(bookRecord) : null,
    nodes,
    edges,
    steps,
    assets,
  };
}

/** 只读 assets 表的元信息（文件名匹配、导出时用） */
export async function loadAssetMetas(): Promise<AssetMeta[]> {
  const records = await db.assets.toArray();
  return records.map(toAssetMeta);
}

/** 读一个资源的二进制；不存在返回 null */
export async function getAssetBlob(id: string): Promise<Blob | null> {
  const record = await db.assets.get(id);
  return record?.data ?? null;
}

/** 所有带二进制的资源（启动 / 换教材时一次性建 Blob URL） */
export async function assetsWithBinary(): Promise<{ id: string; data: Blob }[]> {
  const records = await db.assets.toArray();
  return records.filter(hasBinary).map((record) => ({ id: record.id, data: record.data }));
}

/** 有元信息但没有二进制的资源 id（界面上显示「缺图」的那些） */
export async function assetsWithoutBinary(): Promise<string[]> {
  const records = await db.assets.toArray();
  return records.filter((record) => !hasBinary(record)).map((record) => record.id);
}

/**
 * 只给**已有**资源行补二进制。
 *
 * 行不存在直接报错，不静默新建：文件名匹配万一错了，也不该凭空造出一个资源。
 */
export async function putAssetBinaries(items: { id: string; data: Blob }[]): Promise<void> {
  if (items.length === 0) return;
  await db.transaction('rw', db.assets, async () => {
    for (const item of items) {
      const existing = await db.assets.get(item.id);
      if (!existing) throw new Error(`资源 ${item.id} 不在当前教材里，不能写入二进制。`);
      await db.assets.put({ ...existing, data: item.data });
    }
  });
}

export async function putAssets(assets: AssetRecord[]): Promise<void> {
  if (assets.length === 0) return;
  await db.assets.bulkPut(assets);
}

export async function removeAssets(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.assets.bulkDelete(ids);
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

/** 修改教材信息；如需同步改根分支标题，和 meta 放在同一个事务里 */
export async function updateBook(book: BookMetaV9, nodesToPut: Node[] = []): Promise<void> {
  await db.transaction('rw', db.meta, db.nodes, async () => {
    await db.meta.put({ id: 'active', ...book });
    if (nodesToPut.length > 0) await db.nodes.bulkPut(nodesToPut);
  });
}

/** 整库替换：book 与图数据必须在同一个事务里落盘，避免书名与内容短暂不一致 */
export async function replaceAll(data: {
  book: BookMetaV9;
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
  assets?: AssetRecord[];
}): Promise<void> {
  await db.transaction('rw', db.meta, db.nodes, db.edges, db.steps, db.assets, async () => {
    await db.meta.clear();
    await db.nodes.clear();
    await db.edges.clear();
    await db.steps.clear();
    await db.assets.clear();
    await db.meta.put({ id: 'active', ...data.book });
    await db.nodes.bulkAdd(data.nodes);
    await db.edges.bulkAdd(data.edges);
    if (data.steps?.length) await db.steps.bulkAdd(data.steps);
    if (data.assets?.length) await db.assets.bulkAdd(data.assets);
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.meta, db.nodes, db.edges, db.steps, db.assets, async () => {
    await db.meta.clear();
    await db.nodes.clear();
    await db.edges.clear();
    await db.steps.clear();
    await db.assets.clear();
  });
}
