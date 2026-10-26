import { describe, expect, it } from 'vitest';
import { buildIndex } from './graph';
import { mkNode } from './test-helpers';
import {
  validateBook,
  validateGraphInvariants,
  validateNewEdge,
  validateNodePatch,
  ValidationError,
} from './validate';
import type { BookMeta, Edge } from './schema';

const node = (
  id: string,
  type: Parameters<typeof mkNode>[1],
  parentId: string | null,
  order: number,
  kind?: string,
  title = id,
) => mkNode(id, type, parentId, order, { kind, title });

const nodes = [
  node('b', 'branch', null, 1024),
  node('c', 'chapter', 'b', 1024, 'chapter'),
  node('s', 'section', 'c', 1024, 'section'),
  node('cell', 'definition', 's', 1024, undefined, '细胞'),
  node('nucleus', 'definition', 's', 2048, undefined, '细胞核'),
  node('animal', 'definition', 's', 3072, undefined, '动物'),
  node('mammal', 'definition', 's', 4096, undefined, '哺乳动物'),
  node('law', 'proposition', 's', 5120, 'law', '欧姆定律'),
  node('exp', 'note', 's', 6144, 'experiment', '实验一'),
  node('phenomenon', 'note', 's', 7168, 'phenomenon', '现象一'),
  node('note', 'note', 's', 8192, 'explanation', '普通讲解'),
];

const index = buildIndex(nodes, []);

function edge(id: string, from: string, to: string, predicate: Edge['predicate']): Edge {
  return { id, from, to, predicate, assertedBy: 'manual', createdAt: 0, updatedAt: 0 };
}

describe('supports：实验/观察 → 科学陈述', () => {
  it('实验或现象笔记可以支持命题', () => {
    expect(() =>
      validateNewEdge(index, { from: 'exp', to: 'law', predicate: 'supports' }),
    ).not.toThrow();
    expect(() =>
      validateNewEdge(index, { from: 'phenomenon', to: 'law', predicate: 'supports' }),
    ).not.toThrow();
  });

  it('普通讲解笔记、命题起点、定义终点都被拒绝', () => {
    expect(() =>
      validateNewEdge(index, { from: 'note', to: 'law', predicate: 'supports' }),
    ).toThrowError(/实验|现象/);
    expect(() =>
      validateNewEdge(index, { from: 'law', to: 'cell', predicate: 'supports' }),
    ).toThrowError(/不能用在/);
    expect(() =>
      validateNewEdge(index, { from: 'exp', to: 'cell', predicate: 'supports' }),
    ).toThrowError(/不能用在/);
  });

  it('整图校验与单边校验使用同一套起点 kind 规则', () => {
    const issues = validateGraphInvariants({
      book: { subject: 'physics', stage: 'junior', title: '测试' },
      nodes,
      edges: [edge('e1', 'note', 'law', 'supports')],
    });
    expect(issues.some((issue) => issue.code === 'invalid-endpoint-type')).toBe(true);
  });
});

describe('修改 kind 不能破坏已有关系', () => {
  const supportsIndex = buildIndex(
    nodes,
    [edge('e1', 'exp', 'law', 'supports'), edge('e2', 'phenomenon', 'law', 'supports')],
  );

  it('把实验改成普通讲解会被拒绝，并指出具体关系', () => {
    expect(() =>
      validateNodePatch(supportsIndex, 'exp', { kind: 'explanation' }),
    ).toThrowError(/支持/);
    expect(() =>
      validateNodePatch(supportsIndex, 'phenomenon', { kind: 'explanation' }),
    ).toThrowError(/支持/);
  });

  it('不影响端点规则时仍可修改 kind', () => {
    expect(() =>
      validateNodePatch(supportsIndex, 'law', { kind: 'principle' }),
    ).not.toThrow();
    expect(() =>
      validateNodePatch(buildIndex(nodes, []), 'note', { kind: 'experiment' }),
    ).not.toThrow();
  });
});

describe('is-a / part-of：只连接定义', () => {
  it('合法组合', () => {
    expect(() =>
      validateNewEdge(index, { from: 'mammal', to: 'animal', predicate: 'is-a' }),
    ).not.toThrow();
    expect(() =>
      validateNewEdge(index, { from: 'nucleus', to: 'cell', predicate: 'part-of' }),
    ).not.toThrow();
  });

  it('不能跨到命题，也不能自指', () => {
    expect(() =>
      validateNewEdge(index, { from: 'mammal', to: 'law', predicate: 'is-a' }),
    ).toThrowError(/不能用在/);
    expect(() =>
      validateNewEdge(index, { from: 'cell', to: 'cell', predicate: 'part-of' }),
    ).toThrowError(/自己/);
  });

  it('可疑环只给警告，不硬判数据错误', () => {
    const cyc = buildIndex(nodes, [edge('e1', 'mammal', 'animal', 'is-a')]);
    const result = validateNewEdge(cyc, {
      from: 'animal',
      to: 'mammal',
      predicate: 'is-a',
    });
    expect(result.warnings.some((warning) => warning.code === 'semantic-cycle')).toBe(true);
  });
});

describe('book 元信息', () => {
  const book: BookMeta = { subject: 'chemistry', stage: 'junior', title: '九年级化学' };

  it('合法 book 通过', () => {
    expect(() => validateBook(book)).not.toThrow();
  });

  it('空标题与非法枚举被拒绝', () => {
    expect(() => validateBook({ ...book, title: '   ' })).toThrowError(/教材名称/);
    expect(() =>
      validateBook({ ...book, subject: 'geography' as BookMeta['subject'] }),
    ).toThrowError(/学科/);
    expect(() =>
      validateBook({ ...book, stage: 'college' as BookMeta['stage'] }),
    ).toThrowError(/学段|初中/);
  });

  it('缺少 book 的整图校验会报错', () => {
    expect(() => validateBook(null)).toThrowError(ValidationError);
  });
});
