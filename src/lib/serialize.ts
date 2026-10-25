import { graphJSONSchema, type Edge, type GraphJSON, type Node } from './schema';
import { ValidationError } from './validate';

export const SCHEMA_VERSION = 2;

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((issue) => `${issue.path.join('.') || '根'}: ${issue.message}`).join('；');
  }
  return error instanceof Error ? error.message : String(error);
}

export function serializeGraph(nodes: Node[], edges: Edge[]): GraphJSON {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    nodes,
    edges,
  };
}

/**
 * 解析一份快照 / 备份，并检查引用完整性。
 * 结构不对、父节点不存在、边指向空气，都会抛出一句人话。
 */
export function parseGraph(json: unknown): { nodes: Node[]; edges: Edge[] } {
  let parsed: GraphJSON;
  try {
    parsed = graphJSONSchema.parse(json);
  } catch (error) {
    throw new ValidationError('schema', `数据结构不对：${messageOf(error)}`);
  }

  const nodeIds = new Set<string>();
  for (const node of parsed.nodes) {
    if (nodeIds.has(node.id)) {
      throw new ValidationError('id', `节点 id 重复：${node.id}`);
    }
    nodeIds.add(node.id);
  }

  for (const node of parsed.nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) {
      throw new ValidationError('parentId', `节点「${node.title}」的父节点不存在。`);
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of parsed.edges) {
    if (edgeIds.has(edge.id)) {
      throw new ValidationError('id', `关系 id 重复：${edge.id}`);
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new ValidationError('edge', '存在指向不存在节点的关系。');
    }
  }

  return { nodes: parsed.nodes, edges: parsed.edges };
}
