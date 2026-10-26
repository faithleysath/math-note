import {
  graphJSONSchema,
  graphJSONSchemaV9,
  type AssetMeta,
  type BookMetaV9,
  type Edge,
  type GraphJSON,
  type GraphJSONV9,
  type InferenceStep,
  type Node,
  type SourceAnchor,
} from './schema';
import { migrateV8ToV9 } from './migrations/v8-to-v9';
import { validateGraphInvariants, ValidationError, type ValidationIssue } from './validate';

const SCHEMA_VERSION = 9;

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

export interface GraphExportExtras {
  anchors?: SourceAnchor[];
  assets?: AssetMeta[];
}

/** 默认导出 v9；extras 缺省时 anchors / assets 补空数组 */
export function serializeGraph(
  book: BookMetaV9,
  nodes: Node[],
  edges: Edge[],
  steps: InferenceStep[] = [],
  extras: GraphExportExtras = {},
): GraphJSONV9 {
  return {
    schemaVersion: 9,
    exportedAt: Date.now(),
    book,
    nodes,
    edges,
    steps,
    anchors: extras.anchors ?? [],
    assets: extras.assets ?? [],
  };
}

interface ParsedGraph {
  /** 解析结果永远已经归一成当前格式 v9（v8 备份会被迁移） */
  schemaVersion: 9;
  book: BookMetaV9;
  nodes: Node[];
  edges: Edge[];
  steps: InferenceStep[];
  anchors: SourceAnchor[];
  assets: AssetMeta[];
  warnings: ValidationIssue[];
}

function migrationWarning(): ValidationIssue {
  return {
    severity: 'warning',
    code: 'migrated-from-v8',
    message: '已从 v8 自动迁移：这份备份没有本地媒体资源与出处锚点，anchors / assets 已补为空数组。',
  };
}

/** 全图不变式校验：有任何 error 就抛错，绝不返回半个结果 */
function assertInvariants(parsed: {
  book: BookMetaV9;
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
  anchors: SourceAnchor[];
  assets: AssetMeta[];
}): ValidationIssue[] {
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
  return issues.filter((issue) => issue.severity === 'warning');
}

/**
 * 解析一份备份 / 快照。
 *
 * 当前格式是 v9；v8 备份自动迁移（带一条 warning），v7 及更早直接拒绝。
 * 结构不对或全图不变式不通过就抛错，绝不覆盖现有数据。
 */
export function parseGraph(json: unknown): ParsedGraph {
  const version = declaredVersion(json);

  if (version === 8) {
    let v8: GraphJSON;
    try {
      v8 = graphJSONSchema.parse(json);
    } catch (error) {
      throw new ValidationError('schema', `数据结构不对：${messageOf(error)}`);
    }
    const migrated = migrateV8ToV9(v8);
    const warnings = assertInvariants(migrated);
    return {
      schemaVersion: 9,
      book: migrated.book,
      nodes: migrated.nodes,
      edges: migrated.edges,
      steps: migrated.steps ?? [],
      anchors: migrated.anchors,
      assets: migrated.assets,
      warnings: [migrationWarning(), ...warnings],
    };
  }

  if (version === 7) {
    throw new ValidationError(
      'schema',
      '这是 v7 备份。当前版本只接受 v9，v8 备份会自动迁移到 v9；v7 及更早的数据不会自动迁移，请保留原文件，用对应版本的教材图谱打开或重新导出。',
    );
  }

  if (typeof version === 'number' && version !== SCHEMA_VERSION) {
    throw new ValidationError(
      'schema',
      `不支持 schemaVersion=${String(version)}，当前只接受 v9，v8 会自动迁移。`,
    );
  }

  // v9：schemaVersion 缺失或类型不对时也走这里，由 zod 报「数据结构不对」
  let parsed;
  try {
    parsed = graphJSONSchemaV9.parse(json);
  } catch (error) {
    throw new ValidationError('schema', `数据结构不对：${messageOf(error)}`);
  }

  const warnings = assertInvariants(parsed);
  return {
    schemaVersion: 9,
    book: parsed.book,
    nodes: parsed.nodes,
    edges: parsed.edges,
    steps: parsed.steps ?? [],
    anchors: parsed.anchors ?? [],
    assets: parsed.assets ?? [],
    warnings,
  };
}
