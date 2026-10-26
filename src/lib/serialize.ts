import {
  graphJSONSchema,
  type BookMeta,
  type Edge,
  type GraphJSON,
  type InferenceStep,
  type Node,
} from './schema';
import { validateGraphInvariants, ValidationError, type ValidationIssue } from './validate';

const SCHEMA_VERSION = 8;

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

function declaredVersion(json: unknown): unknown {
  if (json && typeof json === 'object' && 'schemaVersion' in json) {
    return (json as { schemaVersion?: unknown }).schemaVersion;
  }
  return undefined;
}

export function serializeGraph(
  book: BookMeta,
  nodes: Node[],
  edges: Edge[],
  steps: InferenceStep[] = [],
): GraphJSON {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    book,
    nodes,
    edges,
    steps,
  };
}

interface ParsedGraph {
  book: BookMeta;
  nodes: Node[];
  edges: Edge[];
  steps: InferenceStep[];
  warnings: ValidationIssue[];
}

/**
 * 解析一份备份 / 快照。
 * 只接受 v8；结构不对或全图不变式不通过就抛错，绝不覆盖现有数据。
 */
export function parseGraph(json: unknown): ParsedGraph {
  const version = declaredVersion(json);
  if (typeof version === 'number' && version !== SCHEMA_VERSION) {
    if (version === 7) {
      throw new ValidationError(
        'schema',
        '这是 v7 备份。当前版本只接受 v8（含 book 教材元信息），旧数据不会自动迁移；请保留原文件，用对应版本的 Math Note 打开或重新导出。',
      );
    }
    throw new ValidationError(
      'schema',
      `不支持 schemaVersion=${String(version)}，当前只接受 v8。`,
    );
  }

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
    book: parsed.book,
    nodes: parsed.nodes,
    edges: parsed.edges,
    steps: parsed.steps ?? [],
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}
