import { ORDER_GAP } from './graph';
import { isDirectionAllowed } from './predicates';
import type { AnyNode, Edge, InferenceStep, Node, NodeType } from './schema';

// =============================================================================
// 迁移
// =============================================================================
// v2 → v3：solution 复制成独立 proof 节点（保留原字段）
// v4 → v5：14 种节点类型收敛成 9 种 + kind；context → note(kind=context)；
//          concept → note(kind=topic) 并进入人工审核清单；defines 边降级为 cites。

export interface MigrationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  stepId?: string;
}

export interface MigrationReport {
  from: number;
  to: 5;
  countsBefore: { nodes: number; edges: number; steps: number };
  countsAfter: { nodes: number; edges: number; steps: number };
  /** 迁移后每种节点类型（含 kind）的数量 */
  typeCounts: Record<string, number>;
  /** v2 的 solution 复制出来的证明数量 */
  proofsCreated: number;
  warnings: string[];
  needsManualReview: MigrationIssue[];
  /** 迁移过程中被改写的边数量 */
  rewrittenEdges: number;
  /** 无法保留、必须丢弃的边（正常应为 0） */
  droppedEdges: number;
  /** 结论/前提不再是命题、无法保留的推理步骤 */
  droppedSteps: number;
  /** 引用不到目标的条目（正常应为 0） */
  unresolvedReferences: number;
}

export function emptyReport(from: number): MigrationReport {
  return {
    from,
    to: 5,
    countsBefore: { nodes: 0, edges: 0, steps: 0 },
    countsAfter: { nodes: 0, edges: 0, steps: 0 },
    typeCounts: {},
    proofsCreated: 0,
    warnings: [],
    needsManualReview: [],
    rewrittenEdges: 0,
    droppedEdges: 0,
    droppedSteps: 0,
    unresolvedReferences: 0,
  };
}

const LEGACY_TAG = 'legacy-solution';
const PROOF_TITLE = '原有证明';

/**
 * v2/v3 → v4：把定理/引理/推论上的非空 solution 复制成独立证明节点。
 * 只复制、不删除，原字段保留可回滚。
 */
export function migrateSolutionToProof(graph: { nodes: AnyNode[]; edges: Edge[] }): {
  graph: { nodes: AnyNode[]; edges: Edge[] };
  proofsCreated: number;
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

    const proof: AnyNode = {
      id: deterministicId(`proof:${statement.id}`),
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
    edges.push({
      id: deterministicId(`proves:${statement.id}`),
      from: proof.id,
      to: statement.id,
      predicate: 'proves',
      note: '由 solution 字段迁移',
      status: 'asserted',
      reviewState: 'unreviewed',
      assertedBy: 'import',
      createdAt: now,
      updatedAt: now,
    });
    proofsCreated += 1;
  }

  return { graph: { nodes, edges }, proofsCreated };
}

/**
 * 稳定、可重现的 id：同一个输入永远得到同一个 id，
 * 保证「重复导入同一份备份」不会生成额外节点。
 */
function deterministicId(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `${hex}-${seed.length.toString(16).padStart(4, '0')}-5mig-0000-000000000000`;
}

interface LegacyType {
  type: NodeType;
  kind?: string;
}

/** v4 的 14 种类型 → v5 的 9 种类型 + kind */
const LEGACY_TYPE_MAP: Record<string, LegacyType> = {
  branch: { type: 'branch' },
  chapter: { type: 'section', kind: 'chapter' },
  section: { type: 'section', kind: 'section' },
  definition: { type: 'definition' },
  theorem: { type: 'proposition', kind: 'theorem' },
  lemma: { type: 'proposition', kind: 'lemma' },
  corollary: { type: 'proposition', kind: 'corollary' },
  example: { type: 'problem', kind: 'example' },
  exercise: { type: 'problem', kind: 'exercise' },
  note: { type: 'note' },
  attempt: { type: 'attempt' },
  proof: { type: 'proof' },
  counterexample: { type: 'counterexample' },
  // context 必须保留原 id，否则所有 contextId 引用都会断
  context: { type: 'note', kind: 'context' },
  // concept 一律先降级成主题笔记，绝不按标题自动合并
  concept: { type: 'note', kind: 'topic' },
};


function mapType(node: AnyNode): LegacyType {
  // v4 的 section 与 v5 同名但不是同一含义：v4 的 section 一定是 kind=section
  if (node.type === 'section' && node.kind === undefined) {
    return { type: 'section', kind: 'section' };
  }
  const mapped = LEGACY_TYPE_MAP[node.type as string];
  return mapped ?? { type: node.type as NodeType, kind: node.kind };
}

/**
 * v4 → v5。
 *
 * 保守原则：
 * - 节点 ID 全部保留；
 * - concept 不合并、不猜测定义，一律降级为 note(topic) 并进人工审核清单；
 * - defines 边降级为 cites（带迁移备注），不静默删除；
 * - 端点类型不再合法的边同样降级为 cites，仍不合法才丢弃并计数。
 */
export function migrateToV5(
  graph: { nodes: AnyNode[]; edges: Edge[]; steps: InferenceStep[] },
  fromVersion: number,
): { graph: { nodes: Node[]; edges: Edge[]; steps: InferenceStep[] }; report: MigrationReport } {
  const report = emptyReport(fromVersion);
  report.countsBefore = {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    steps: graph.steps.length,
  };

  const conceptIds = new Set<string>();
  const contextIds = new Set<string>();

  const nodes: Node[] = graph.nodes.map((node) => {
    const mapped = mapType(node);
    if (node.type === 'concept') {
      conceptIds.add(node.id);
      report.needsManualReview.push({
        code: 'concept-downgraded',
        nodeId: node.id,
        message: `概念「${node.title}」已转换为 note(topic)。如果内容本身是明确的数学定义，请在界面上把它改成 definition；不会按标题自动合并。`,
      });
    }
    if (node.type === 'context') {
      contextIds.add(node.id);
    }

    const citation = node.citation
      ? {
          source: node.citation.source ?? (node.citation as { book?: string }).book,
          page: node.citation.page,
          originalNumber:
            node.citation.originalNumber ?? (node.citation as { theoremNo?: string }).theoremNo,
        }
      : undefined;

    return {
      ...node,
      type: mapped.type,
      kind: mapped.kind ?? node.kind,
      citation,
    } as Node;
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const typeOf = (id: string) => nodeById.get(id)?.type;
  const kindOf = (id: string) => nodeById.get(id)?.kind;

  const isValidPair = (predicate: Edge['predicate'], fromId: string, toId: string): boolean => {
    const fromNode = nodeById.get(fromId);
    const toNode = nodeById.get(toId);
    if (!fromNode || !toNode) return false;
    if (isDirectionAllowed(predicate, fromNode.type, toNode.type)) {
      // 额外语义约束
      if (predicate === 'proves') return fromNode.type === 'proof' && toNode.type === 'proposition';
      if (predicate === 'refutes') return fromNode.type === 'counterexample' && toNode.type === 'proposition';
      if (predicate === 'implies' || predicate === 'iff') {
        return fromNode.type === 'proposition' && toNode.type === 'proposition';
      }
      return true;
    }
    return false;
  };

  const edges: Edge[] = [];
  for (const edge of graph.edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      report.unresolvedReferences += 1;
      report.warnings.push(`关系 ${edge.id} 指向不存在的节点，已丢弃。`);
      report.droppedEdges += 1;
      continue;
    }

    // defines 已从 v5 谓词表移除
    if ((edge.predicate as string) === 'defines') {
      if (isValidPair('cites', edge.from, edge.to)) {
        edges.push({
          ...edge,
          predicate: 'cites',
          note: [edge.note, '从 defines 迁移，待人工确认'].filter(Boolean).join('；'),
        });
        report.rewrittenEdges += 1;
        report.needsManualReview.push({
          code: 'defines-downgraded',
          edgeId: edge.id,
          message: `定义「${nodeById.get(edge.from)?.title}」到概念「${nodeById.get(edge.to)?.title}」的 defines 关系已降级为 cites，请确认是否需要重连到 definition。`,
        });
      } else {
        report.droppedEdges += 1;
      }
      continue;
    }

    if (isValidPair(edge.predicate, edge.from, edge.to)) {
      edges.push(edge);
      continue;
    }

    // 端点类型变了（多半是 concept / context），先试着降级成 cites 保住线索
    if (isValidPair('cites', edge.from, edge.to)) {
      edges.push({
        ...edge,
        predicate: 'cites',
        note: [edge.note, '端点类型迁移后不再支持原谓词，已降级为 cites'].filter(Boolean).join('；'),
      });
      report.rewrittenEdges += 1;
      if (conceptIds.has(edge.to) || conceptIds.has(edge.from)) {
        report.needsManualReview.push({
          code: 'edge-needs-reconnect',
          edgeId: edge.id,
          message: `关系 ${edge.id}（${edge.predicate}）涉及已降级的概念节点，请人工确认是否重连。`,
        });
      }
      continue;
    }

    report.droppedEdges += 1;
    report.warnings.push(`关系 ${edge.id}（${edge.predicate}）端点类型不兼容，无法保留。`);
  }

  const steps: InferenceStep[] = [];
  for (const step of graph.steps) {
    const conclusion = nodeById.get(step.conclusionId);
    const premises = step.premiseIds.map((id) => nodeById.get(id));

    if (!conclusion || premises.some((premise) => !premise)) {
      report.unresolvedReferences += 1;
      report.droppedSteps += 1;
      report.warnings.push(`推理步骤 ${step.id} 引用了不存在的节点，已丢弃。`);
      continue;
    }

    if (conclusion.type !== 'proposition' || premises.some((premise) => premise?.type !== 'proposition')) {
      report.droppedSteps += 1;
      report.needsManualReview.push({
        code: 'step-needs-rebuild',
        stepId: step.id,
        message: `推理步骤「${step.rule}」的前提或结论不是 proposition（定义、笔记不能用真假来推理），已移出图谱，请人工重建。`,
      });
      continue;
    }

    const next: InferenceStep = { ...step };
    if (next.contextId && kindOf(next.contextId) !== 'context') {
      report.warnings.push(`推理步骤 ${step.id} 的语境不再是 context，已清空。`);
      next.contextId = undefined;
    }
    if (next.proofId && typeOf(next.proofId) !== 'proof') {
      report.warnings.push(`推理步骤 ${step.id} 的所属证明已不是 proof，已清空。`);
      next.proofId = undefined;
    }
    steps.push(next);
  }

  const oldKindCounts: Record<string, number> = {};
  for (const node of nodes) {
    const label = node.kind ? `${node.type}:${node.kind}` : node.type;
    oldKindCounts[label] = (oldKindCounts[label] ?? 0) + 1;
  }

  report.typeCounts = oldKindCounts;
  report.countsAfter = { nodes: nodes.length, edges: edges.length, steps: steps.length };

  return { graph: { nodes, edges, steps }, report };
}

/** 一句话概述迁移结果，用于 UI 提示 */
export function summarizeMigration(report: MigrationReport): string {
  const parts = [
    `节点 ${report.countsBefore.nodes} → ${report.countsAfter.nodes}`,
    `关系 ${report.countsBefore.edges} → ${report.countsAfter.edges}`,
  ];
  if (report.proofsCreated > 0) parts.push(`新增证明 ${report.proofsCreated}`);
  if (report.rewrittenEdges > 0) parts.push(`改写关系 ${report.rewrittenEdges}`);
  if (report.droppedSteps > 0) parts.push(`移出推理步骤 ${report.droppedSteps}`);
  if (report.needsManualReview.length > 0) parts.push(`待人工确认 ${report.needsManualReview.length} 项`);
  return parts.join('，');
}
