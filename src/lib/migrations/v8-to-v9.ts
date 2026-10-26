import type { GraphJSON, GraphJSONV9 } from '../schema';

/**
 * v8 → v9 的无损迁移。
 *
 * v9 只是在 v8 之上加了 `anchors` / `assets` 两张表，节点、边、推理步骤的
 * 语义一个都没变，所以这里**只补三个字段**：
 *   schemaVersion: 9、anchors: []、assets: []
 * 不重新编号、不排序、不动书信息、不动 createdAt/updatedAt。
 *
 * 纯函数：不读写外部状态，也不修改入参。
 */
export function migrateV8ToV9(graph: GraphJSON): GraphJSONV9 {
  return {
    schemaVersion: 9,
    exportedAt: graph.exportedAt,
    book: graph.book,
    nodes: graph.nodes,
    edges: graph.edges,
    steps: graph.steps,
    anchors: [],
    assets: [],
  };
}
