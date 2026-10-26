import type { Citation } from './schema';

/**
 * 编辑「来源」时只更新 source，保留原有的 page / originalNumber。
 * 三个字段都为空时返回 null（交给 store 清掉 citation）。
 */
export function mergeCitation(original: Citation | undefined, sourceInput: string): Citation | null {
  const next: Citation = {
    ...original,
    source: sourceInput.trim() || undefined,
  };
  const hasAny = Boolean(next.source || next.page || next.originalNumber);
  return hasAny ? next : null;
}
