import { graphJSONSchema, type Edge, type GraphJSON, type InferenceStep, type Node } from './schema';
import { ValidationError, validateGraphInvariants, type ValidationIssue } from './validate';
import { migrateV2ToV3 } from './migrate';

export const SCHEMA_VERSION = 4;

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
  /** v2 数据被迁移时给出的说明，用于 UI 提示 / 日志 */
  migration: { from: 2; proofsCreated: number } | null;
  warnings: ValidationIssue[];
}

/**
 * 解析一份快照 / 备份：
 * 1. JSON 结构校验
 * 2. v2 → v3 迁移（solution 复制成证明节点）
 * 3. 全图不变式校验，有错误就抛，绝不覆盖现有数据
 */
export function parseGraph(json: unknown): ParsedGraph {
  let parsed: GraphJSON;
  try {
    parsed = graphJSONSchema.parse(json);
  } catch (error) {
    throw new ValidationError('schema', `数据结构不对：${messageOf(error)}`);
  }

  let nodes = parsed.nodes;
  let edges = parsed.edges;
  let steps: InferenceStep[] = parsed.steps ?? [];
  let migration: ParsedGraph['migration'] = null;

  if (parsed.schemaVersion === 2) {
    const migrated = migrateV2ToV3({ nodes, edges });
    nodes = migrated.graph.nodes;
    edges = migrated.graph.edges;
    // v2 里没有推理步骤
    steps = [];
    migration = { from: 2, proofsCreated: migrated.report.proofsCreated };
  }

  const issues = validateGraphInvariants({ nodes, edges, steps });
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
    nodes,
    edges,
    steps,
    migration,
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}
