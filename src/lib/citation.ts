import type { Citation } from './schema';

/**
 * 编辑来源信息：只更新传入的字段，保留其余字段。
 * 三个字段都为空时返回 null（交给 store 清掉 citation）。
 */
export function mergeCitation(
  original: Citation | undefined,
  sourceInput: string,
  extra: Pick<Citation, 'page' | 'originalNumber'> = {},
): Citation | null {
  const next: Citation = {
    ...original,
    source: sourceInput.trim() || undefined,
    page: extra.page !== undefined ? extra.page.trim() || undefined : original?.page,
    originalNumber:
      extra.originalNumber !== undefined
        ? extra.originalNumber.trim() || undefined
        : original?.originalNumber,
  };
  const hasAny = Boolean(next.source || next.page || next.originalNumber);
  return hasAny ? next : null;
}
