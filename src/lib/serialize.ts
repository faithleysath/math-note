import {
  graphJSONSchema,
  type AnyNode,
  type Edge,
  type GraphJSON,
  type InferenceStep,
  type Node,
} from './schema';
import { ValidationError, validateGraphInvariants, type ValidationIssue } from './validate';
import { migrateSolutionToProof, migrateToV5, type MigrationReport } from './migrate';

export const SCHEMA_VERSION = 5;

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((issue) => `${issue.path.join('.') || '根'}: ${issue.message}`).join('；');
  }
  return error instanceof Error ? error.message : String(error);
}

export function serializeGraph(
  nodes: Node[],
  edges: Edge[],
  steps: InferenceStep[] = [],
): GraphJSON {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    nodes,
    edges,
    steps,
  };
}

export interface ParsedGraph {
  nodes: Node[];
  edges: Edge[];
  steps: InferenceStep[];
  /** 发生过迁移时的报告（含人工审核清单），否则为 null */
  migration: MigrationReport | null;
  warnings: ValidationIssue[];
}

/**
 * 解析一份快照 / 备份：
 * 1. JSON 结构校验
 * 2. 依次迁移 v2 → v3 → v4 → v5（不丢节点、边、解题记录）
 * 3. 全图不变式校验，有错误就抛，绝不覆盖现有数据
 */
export function parseGraph(json: unknown): ParsedGraph {
  let parsed: {
    schemaVersion: 2 | 3 | 4 | 5;
    exportedAt: number;
    nodes: AnyNode[];
    edges: Edge[];
    steps?: InferenceStep[];
  };
  try {
    parsed = graphJSONSchema.parse(json);
  } catch (error) {
    throw new ValidationError('schema', `数据结构不对：${messageOf(error)}`);
  }

  const version = parsed.schemaVersion;
  let nodes: AnyNode[] = parsed.nodes;
  let edges: Edge[] = parsed.edges;
  let steps: InferenceStep[] = parsed.steps ?? [];
  let report: MigrationReport | null = null;
  let proofsCreated = 0;

  // v2：solution 复制成独立证明
  if (version < 3) {
    const migrated = migrateSolutionToProof({ nodes, edges });
    nodes = migrated.graph.nodes;
    edges = migrated.graph.edges;
    steps = [];
    proofsCreated = migrated.proofsCreated;
  }

  // v3 / v4：类型收敛到 9 种 + kind
  if (version < 5) {
    const migrated = migrateToV5({ nodes, edges, steps }, version);
    nodes = migrated.graph.nodes;
    edges = migrated.graph.edges;
    steps = migrated.graph.steps;
    report = migrated.report;
    report.proofsCreated = proofsCreated;
  }

  const issues = validateGraphInvariants({ nodes: nodes as unknown as Node[], edges, steps });
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) {
    const head = errors.slice(0, 3).map((issue) => issue.message).join('；');
    throw new ValidationError(
      'graph',
      `导入的数据没通过校验：${head}${errors.length > 3 ? `（还有 ${errors.length - 3} 个问题）` : ''}`,
      errors,
    );
  }

  return {
    nodes: nodes as unknown as Node[],
    edges,
    steps,
    migration: report,
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}
