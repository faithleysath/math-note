import type { Edge, InferenceStep, Node, NodeType, Predicate } from './schema';

/**
 * 测试用构造器。
 * 允许写 v4 的旧类型名，自动映射成 v5 的 type/kind，
 * 这样大量既有用例不用逐条改。
 */
const LEGACY: Record<string, { type: NodeType; kind?: string }> = {
  chapter: { type: 'section', kind: 'chapter' },
  section: { type: 'section', kind: 'section' },
  theorem: { type: 'proposition', kind: 'theorem' },
  lemma: { type: 'proposition', kind: 'lemma' },
  corollary: { type: 'proposition', kind: 'corollary' },
  example: { type: 'problem', kind: 'example' },
  exercise: { type: 'problem', kind: 'exercise' },
  concept: { type: 'note', kind: 'topic' },
  context: { type: 'note', kind: 'context' },
};

export function mkNode(
  id: string,
  type: string,
  parentId: string | null,
  order: number,
  extra: Partial<Node> = {},
): Node {
  const mapped = LEGACY[type] ?? { type: type as NodeType };
  return {
    id,
    type: mapped.type,
    kind: mapped.kind,
    title: id,
    content: '',
    parentId,
    order,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

let seq = 0;

export function mkEdge(
  from: string,
  to: string,
  predicate: Predicate,
  extra: Partial<Edge> = {},
): Edge {
  seq += 1;
  return {
    id: `e${seq}`,
    from,
    to,
    predicate,
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

export function mkStep(extra: Partial<InferenceStep> = {}): InferenceStep {
  seq += 1;
  return {
    id: `step-${seq}`,
    premiseIds: ['a', 'b'],
    conclusionId: 'c',
    rule: '测试规则',
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}
