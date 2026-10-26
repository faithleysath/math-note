import {
  graphJSONSchema,
  type Edge,
  type GraphJSON,
  type InferenceStep,
  type Node,
} from './schema';
import { ValidationError, validateGraphInvariants, type ValidationIssue } from './validate';

export const SCHEMA_VERSION = 6;

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    const shown = issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '根'}: ${issue.message}`)
      .join('；');
    return issues.length > 3 ? `${shown}（还有 ${issues.length - 3} 个问题）` : shown;
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
  warnings: ValidationIssue[];
}

/**
 * 解析一份备份 / 快照。
 * 只接受 v5；结构不对或全图不变式不通过就抛错，绝不覆盖现有数据。
 */
export function parseGraph(json: unknown): ParsedGraph {
  let parsed: GraphJSON;
  try {
    parsed = graphJSONSchema.parse(json);
  } catch (error) {
    throw new ValidationError('schema', `数据结构不对：${messageOf(error)}`);
  }

  const issues = validateGraphInvariants(parsed);
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
    nodes: parsed.nodes,
    edges: parsed.edges,
    steps: parsed.steps ?? [],
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}
