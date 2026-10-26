import { describe, expect, it } from 'vitest';
import { buildIndex, deriveWithSteps, explainTrace, stepsForNode } from './graph';
import { validateGraphInvariants, validateNewStep } from './validate';
import { mkEdge, mkNode } from './test-helpers';
import type { Edge, InferenceStep, Node } from './schema';

const node = (
  id: string,
  type: string,
  parentId: string | null,
  order: number,
  extra: Partial<Node> = {},
): Node => mkNode(id, type, parentId, order, extra);

function edge(from: string, to: string, predicate: Edge['predicate'], extra: Partial<Edge> = {}): Edge {
  return mkEdge(from, to, predicate, extra);
}

function step(extra: Partial<InferenceStep> = {}): InferenceStep {
  return {
    id: 'step-1',
    premiseIds: ['a', 'b'],
    conclusionId: 'c',
    rule: '紧集上连续函数有界',
    assertedBy: 'manual',
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

const nodes = [
  node('s', 'note', null, 1024, { title: '起点' }),
  node('a', 'theorem', null, 2048, { title: 'A 连续' }),
  node('b', 'theorem', null, 3072, { title: 'B 紧' }),
  node('c', 'theorem', null, 4096, { title: 'C 有界' }),
  node('ctx', 'context', null, 5120, { title: '实数域' }),
];

const reach = (steps: InferenceStep[], opts = {}) =>
  deriveWithSteps(buildIndex(nodes, [edge('s', 'a', 'implies'), edge('s', 'b', 'implies')], steps), 's', opts);

describe('推理步骤（超边）', () => {
  it('所有前提都成立时才推出结论', () => {
    const derived = reach([step()]);
    expect(derived.map((item) => item.nodeId)).toContain('c');
  });

  it('少一个前提就推不出来', () => {
    const index = buildIndex(nodes, [edge('s', 'a', 'implies')], [step()]);
    const derived = deriveWithSteps(index, 's');
    expect(derived.map((item) => item.nodeId)).not.toContain('c');
  });

  it('不能把「A 单独推出 C」当成这条推理', () => {
    // 如果错误地拆成 A⇒C、B⇒C，那么只给 A 就会推出 C
    const index = buildIndex(nodes, [edge('s', 'a', 'implies')], [step()]);
    const derived = deriveWithSteps(index, 's');
    const conclusions = derived.map((item) => item.nodeId);
    expect(conclusions).toContain('a');
    expect(conclusions).not.toContain('c');
  });

  it('前提带条件时，结论也是有条件的', () => {
    const index = buildIndex(
      nodes,
      [edge('s', 'a', 'implies', { condition: 'n 为自然数' }), edge('s', 'b', 'implies')],
      [step()],
    );
    const derived = deriveWithSteps(index, 's');
    const target = derived.find((item) => item.nodeId === 'c');
    expect(target?.unresolvedConditions).toEqual(['n 为自然数']);
  });

  it('语境一致时整条推导共享同一个语境', () => {
    const index = buildIndex(
      nodes,
      [
        edge('s', 'a', 'implies', { contextId: 'ctx' }),
        edge('s', 'b', 'implies', { contextId: 'ctx' }),
      ],
      [step({ contextId: 'ctx' })],
    );
    const target = deriveWithSteps(index, 's').find((item) => item.nodeId === 'c');
    expect(target?.contextId).toBe('ctx');
  });

  it('语境不一致就不能当成无条件', () => {
    const index = buildIndex(
      nodes,
      [
        edge('s', 'a', 'implies', { contextId: 'ctx' }),
        edge('s', 'b', 'implies', { contextId: 'other' }),
      ],
      [step({ contextId: 'ctx' })],
    );
    const target = deriveWithSteps(index, 's').find((item) => item.nodeId === 'c');
    expect(target?.contextId).toBeUndefined();
  });

  it('已推翻的推理步骤不参与推导（重复校验）', () => {
    const index = buildIndex(
      nodes,
      [edge('s', 'a', 'implies'), edge('s', 'b', 'implies')],
      [step({ status: 'conjecture' })],
    );
    expect(deriveWithSteps(index, 's').map((item) => item.nodeId)).not.toContain('c');
    expect(
      deriveWithSteps(index, 's', { includeConjectures: true }).map((item) => item.nodeId),
    ).toContain('c');
  });

  it('已推翻的推理步骤不参与推导', () => {
    const index = buildIndex(
      nodes,
      [edge('s', 'a', 'implies'), edge('s', 'b', 'implies')],
      [step({ status: 'disproven' })],
    );
    expect(deriveWithSteps(index, 's').map((item) => item.nodeId)).not.toContain('c');
  });

  it('能解释每一步是怎么来的', () => {
    const index = buildIndex(nodes, [edge('s', 'a', 'implies'), edge('s', 'b', 'implies')], [step()]);
    const target = deriveWithSteps(index, 's').find((item) => item.nodeId === 'c');
    expect(target).toBeTruthy();
    expect(explainTrace(index, target!)).toContain('紧集上连续函数有界');
    expect(explainTrace(index, target!)).toContain('A 连续');
  });

  it('能查出涉及某节点的步骤', () => {
    const index = buildIndex(nodes, [], [step()]);
    const forA = stepsForNode(index, 'a');
    expect(forA.asPremise).toHaveLength(1);
    expect(forA.asConclusion).toHaveLength(0);
    expect(stepsForNode(index, 'c').asConclusion).toHaveLength(1);
  });
});

describe('推理步骤校验', () => {
  const index = buildIndex(nodes, []);

  it('至少要有一个前提', () => {
    expect(() =>
      validateNewStep(index, { premiseIds: [], conclusionId: 'c', rule: '规则' }),
    ).toThrowError(/至少需要一个前提/);
  });

  it('前提必须存在', () => {
    expect(() =>
      validateNewStep(index, { premiseIds: ['ghost'], conclusionId: 'c', rule: '规则' }),
    ).toThrowError(/不存在/);
  });

  it('结论不能同时是前提', () => {
    expect(() =>
      validateNewStep(index, { premiseIds: ['c'], conclusionId: 'c', rule: '规则' }),
    ).toThrowError(/不能同时是它的前提/);
  });

  it('结论必须是命题类节点', () => {
    expect(() =>
      validateNewStep(index, { premiseIds: ['a'], conclusionId: 'ctx', rule: '规则' }),
    ).toThrowError(/结论必须是命题/);
  });

  it('结构节点不能当前提', () => {
    expect(() =>
      validateNewStep(index, { premiseIds: ['ctx'], conclusionId: 'c', rule: '规则' }),
    ).toThrowError(/不能作为推理前提/);
  });

  it('必须有规则名，且拒绝重复步骤', () => {
    expect(() =>
      validateNewStep(index, { premiseIds: ['a'], conclusionId: 'c', rule: '   ' }),
    ).toThrowError(/规则/);

    const withStep = buildIndex(nodes, [], [step({ premiseIds: ['a'] })]);
    expect(() =>
      validateNewStep(withStep, { premiseIds: ['a'], conclusionId: 'c', rule: '紧集上连续函数有界' }),
    ).toThrowError(/已经存在/);
  });

  it('前提顺序不影响去重', () => {
    const withStep = buildIndex(nodes, [], [step()]);
    expect(() =>
      validateNewStep(withStep, {
        premiseIds: ['b', 'a'],
        conclusionId: 'c',
        rule: '紧集上连续函数有界',
      }),
    ).toThrowError(/已经存在/);
  });

  it('全图校验能发现悬空前提和重复步骤', () => {
    const issues = validateGraphInvariants({
      nodes,
      edges: [],
      steps: [step({ id: 's1', premiseIds: ['ghost'] }), step({ id: 's2' }), step({ id: 's3' })],
    });
    expect(issues.some((issue) => issue.code === 'missing-premise')).toBe(true);
    expect(issues.some((issue) => issue.code === 'duplicate-step')).toBe(true);
  });
});
