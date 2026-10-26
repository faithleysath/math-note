import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGraph } from './serialize';

const examplesDir = new URL('../../examples/', import.meta.url);
const files = readdirSync(examplesDir).filter(
  (name) => name.startsWith('v8-') && name.endsWith('.json'),
);

describe('验收样例', () => {
  it('五门学科各有一份合法 v8 样例', () => {
    expect(files).toHaveLength(5);
    const subjects = files.map((file) => {
      const parsed = parseGraph(
        JSON.parse(readFileSync(new URL(file, examplesDir), 'utf8')),
      );
      // v8 样例走自动迁移：除了一条迁移提示，不应该有别的问题
      expect(parsed.warnings.map((issue) => issue.code)).toEqual(['migrated-from-v8']);
      return parsed.book.subject;
    });
    expect(new Set(subjects)).toEqual(
      new Set(['math', 'physics', 'chemistry', 'biology', 'science']),
    );
  });

  it('样例里的图片、原书编号和化学式都已落盘', () => {
    const chemistry = parseGraph(
      JSON.parse(readFileSync(new URL('v8-chemistry.json', examplesDir), 'utf8')),
    );
    const reaction = chemistry.nodes.find((node) => node.kind === 'reaction');
    expect(reaction?.content).toContain('\\ce{');
    const experiment = chemistry.nodes.find((node) => node.kind === 'experiment');
    expect(experiment?.content).toMatch(/!\[[^\]]+\]\(https?:\/\//);
    expect(experiment?.citation?.originalNumber).toBeTruthy();

    const biology = parseGraph(
      JSON.parse(readFileSync(new URL('v8-biology.json', examplesDir), 'utf8')),
    );
    expect(biology.edges.some((edge) => edge.predicate === 'is-a')).toBe(true);
    expect(biology.edges.some((edge) => edge.predicate === 'part-of')).toBe(true);

    const physics = parseGraph(
      JSON.parse(readFileSync(new URL('v8-physics.json', examplesDir), 'utf8')),
    );
    expect(physics.edges.some((edge) => edge.predicate === 'supports')).toBe(true);
  });
});
