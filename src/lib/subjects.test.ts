import { describe, expect, it } from 'vitest';
import { KIND_OPTIONS } from './schema';
import {
  SUBJECT_PROFILES,
  filterGroupsFor,
  kindOptionsFor,
  predicatePreference,
  subjectProfile,
} from './subjects';

describe('学科配置', () => {
  it('五种学科都有配置，未知/空值回退数学', () => {
    expect(Object.keys(SUBJECT_PROFILES)).toEqual([
      'math',
      'physics',
      'chemistry',
      'biology',
      'science',
    ]);
    expect(subjectProfile(null).subject).toBe('math');
    expect(subjectProfile(undefined).subject).toBe('math');
  });

  it('数学沿用自动编号，其他理科原书编号优先', () => {
    expect(subjectProfile('math').numberingMode).toBe('generated');
    for (const subject of ['physics', 'chemistry', 'biology', 'science'] as const) {
      expect(subjectProfile(subject).numberingMode).toBe('source-first');
    }
  });

  it('推荐 kind 排在前面，其余 kind 仍可从「更多分类」选到', () => {
    const physics = kindOptionsFor('physics', 'note');
    expect(physics.preferred.slice(0, 2)).toEqual(['experiment', 'phenomenon']);
    const union = new Set([...physics.preferred, ...physics.more]);
    expect(union).toEqual(new Set(KIND_OPTIONS.note));

    const chemistry = kindOptionsFor('chemistry', 'proposition');
    expect(chemistry.preferred[0]).toBe('law');
    expect(chemistry.preferred).toContain('reaction');
    expect(chemistry.more).toContain('lemma');
  });

  it('搜索筛选器包含学科推荐类别，也保留全部 type', () => {
    const physics = filterGroupsFor('physics');
    const values = physics.flatMap((group) => group.options.map((option) => option.value));
    expect(values).toContain('note:experiment');
    expect(values).toContain('proposition:law');
    expect(values).toContain('proof');
    expect(values).toContain('attempt');
  });

  it('关系偏好表把 supports 放在数学不推荐的位置', () => {
    expect(predicatePreference('math').has('supports')).toBe(false);
    expect(predicatePreference('physics').get('supports')).toBeLessThan(
      predicatePreference('physics').get('proves') ?? 99,
    );
  });
});
