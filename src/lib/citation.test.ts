import { describe, expect, it } from 'vitest';
import { mergeCitation } from './citation';

describe('来源编辑', () => {
  it('只改来源名称时保留页码与原题号', () => {
    const original = { source: '旧教材', page: '12', originalNumber: '定理 1.3' };
    expect(mergeCitation(original, '新教材')).toEqual({
      source: '新教材',
      page: '12',
      originalNumber: '定理 1.3',
    });
  });

  it('清空来源名称不丢其他字段', () => {
    const original = { source: '旧教材', page: '12', originalNumber: '定理 1.3' };
    expect(mergeCitation(original, '   ')).toEqual({
      source: undefined,
      page: '12',
      originalNumber: '定理 1.3',
    });
  });

  it('三个字段都为空时返回 null', () => {
    expect(mergeCitation({ source: '旧教材' }, '')).toBeNull();
    expect(mergeCitation(undefined, '')).toBeNull();
  });

  it('原来没有来源时可以新增，并保留已有页码', () => {
    expect(mergeCitation({ page: '3' }, '讲义')).toEqual({ page: '3', source: '讲义' });
  });
});
