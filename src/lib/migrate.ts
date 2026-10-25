import { ORDER_GAP } from './graph';
import type { Edge, Node } from './schema';

export interface MigrationReport {
  /** 由 solution 字段生成的证明数量 */
  proofsCreated: number;
  /** 迁移前已经存在的证明节点数量 */
  existingProofs: number;
}

const LEGACY_TAG = 'legacy-solution';
const PROOF_TITLE = '原有证明';

/**
 * v2 → v3：
 * 把定理/引理/推论上的非空 solution 复制成一个独立的「证明」节点，
 * 并建立 proof --proves--> 命题。
 *
 * 只复制、不删除：命题上的 solution 原样保留，随时可以回滚。
 * 例题/练习的 solution 是参考解答，不转成证明。
 */
export function migrateV2ToV3(graph: { nodes: Node[]; edges: Edge[] }): {
  graph: { nodes: Node[]; edges: Edge[] };
  report: MigrationReport;
} {
  const now = Date.now();
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  let proofsCreated = 0;

  const existingLegacy = new Set(
    nodes
      .filter((node) => node.type === 'proof' && (node.tags ?? []).includes(LEGACY_TAG))
      .map((node) => node.parentId ?? ''),
  );

  for (const statement of graph.nodes) {
    if (!['theorem', 'lemma', 'corollary'].includes(statement.type)) continue;
    const solution = statement.solution?.trim();
    if (!solution) continue;
    if (existingLegacy.has(statement.id)) continue;

    const siblingOrders = nodes
      .filter((node) => node.parentId === statement.id)
      .map((node) => node.order);
    const nextOrder = (siblingOrders.length > 0 ? Math.max(...siblingOrders) : 0) + ORDER_GAP;

    const proof: Node = {
      id: crypto.randomUUID(),
      type: 'proof',
      title: PROOF_TITLE,
      content: solution,
      parentId: statement.id,
      order: nextOrder,
      tags: [LEGACY_TAG],
      createdAt: now,
      updatedAt: now,
    };
    nodes.push(proof);

    const edge: Edge = {
      id: crypto.randomUUID(),
      from: proof.id,
      to: statement.id,
      predicate: 'proves',
      note: '由 solution 字段迁移',
      status: 'asserted',
      // 迁移来的内容没有经过任何审核
      reviewState: 'unreviewed',
      assertedBy: 'import',
      createdAt: now,
      updatedAt: now,
    };
    edges.push(edge);
    proofsCreated += 1;
  }

  return {
    graph: { nodes, edges },
    report: {
      proofsCreated,
      existingProofs: existingLegacy.size,
    },
  };
}
