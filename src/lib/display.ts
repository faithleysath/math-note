import type { NumberSource } from './schema';

/**
 * 渲染编号前缀的 Markdown 片段。
 * 原书编号必须显式标注，不能伪装成软件生成的「定理 1.2.1」。
 */
export function numberMarkdown(displayNumber: string, numberSource: NumberSource): string {
  if (!displayNumber) return '';
  if (numberSource === 'source') return `**原书编号：${displayNumber}**&emsp;`;
  return `**${displayNumber}**&emsp;`;
}

/**
 * 标题里是否已经带着这个编号。
 * 中文教材常写「第一章」「17.2 欧姆定律」，而编号可能是「第 1 章」，
 * 直接字符串包含判断不出来，这里再做一次空白归一和章节前缀识别。
 */
export function titleCarriesNumber(title: string, displayNumber: string): boolean {
  if (!displayNumber) return false;
  const compactTitle = title.replace(/\s+/g, '');
  const compactNumber = displayNumber.replace(/\s+/g, '');
  if (title.includes(displayNumber) || compactTitle.includes(compactNumber)) return true;
  return /^第[一二三四五六七八九十百千零〇0-9]+[章节单元课题篇部]/.test(compactTitle);
}

/**
 * 把编号前缀接到正文上。
 * 正文如果以标题、块级公式、表格、列表、图片或引用开头，
 * 前缀必须单独成行，否则 Markdown 会把它们当成普通段落。
 */
export function contentWithNumber(
  content: string,
  displayNumber: string,
  numberSource: NumberSource,
): string {
  const prefix = numberMarkdown(displayNumber, numberSource);
  if (!prefix) return content;
  if (/^\s*(#{1,6}\s|\$\$|\||[-*+]\s|\d+\.\s|!\[|>)/.test(content)) {
    return `${prefix}\n\n${content}`;
  }
  return `${prefix}${content}`;
}
