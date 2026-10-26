/**
 * 跨批次一致性检查：`bun run scripts/check-book-consistency.ts --expected <目录>`
 *
 * `check-expected` 只管单个清单内部是否合法；这里管**多个批次之间是否一致**。
 * 一章常被切成两三个批次、由不同代理并行枚举，同一种版面被判成不同 kind 的事真的发生过。
 *
 * 纯脚本、不调模型。有 error 退出码 1。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Item = {
  srcId: string;
  kind?: string;
  pdfPage?: number;
  text?: string;
  originalNumber?: string | null;
  parentSrcId?: string | null;
  captionOnImage?: boolean;
};
type Manifest = {
  volume?: string;
  chapter?: string;
  pdfPageRange?: [number, number];
  printedPageRange?: [string, string];
  items: Item[];
};

const KINDS = new Set([
  'heading',
  'para',
  'figure',
  'table',
  'activity-title',
  'block-title',
  'module',
  'exercise',
  'summary',
  'question',
]);

/** 栏目名 → 该栏目标题行应有的 kind */
const BLOCK_TITLES: [RegExp, string][] = [
  [/^(活动|学生实验)[\s\d.．]/, 'activity-title'],
  [/^(实践与练习|素养进阶|内容梳理|反思提升|问题解决)\s*$/, 'block-title'],
  [/^(信息快递|方法技巧|读一读|生活\s*物理\s*社会|国家工程|跨学科实践)/, 'module'],
];

type Issue = { severity: 'error' | 'warning'; code: string; message: string };
const issues: Issue[] = [];
const err = (code: string, message: string) => issues.push({ severity: 'error', code, message });
const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message });

function readManifests(dir: string): { file: string; data: Manifest }[] {
  const out: { file: string; data: Manifest }[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Manifest;
    if (!Array.isArray(raw.items)) continue;
    out.push({ file: name, data: raw });
  }
  return out;
}

const dir = (() => {
  const i = process.argv.indexOf('--expected');
  return i > 0 ? process.argv[i + 1] : 'local-textbook/sukey/expected';
})();

const manifests = readManifests(dir);
if (manifests.length === 0) {
  console.error(`没有找到清单：${dir}`);
  process.exit(2);
}

const seenSrcId = new Map<string, string>();
const byChapter = new Map<string, { file: string; range?: [number, number] }[]>();

for (const { file, data } of manifests) {
  const chapter = data.chapter ?? '';
  // 1. 文件名前缀必须与 chapter 一致
  const stem = file.replace(/\.json$/, '');
  if (!stem.startsWith(`b8a-${chapter.slice(-3)}`) && !stem.startsWith(chapter)) {
    err('filename-chapter', `${file}：文件名前缀与 chapter「${chapter}」对不上`);
  }
  if (!data.pdfPageRange) warn('no-range', `${file}：没有 pdfPageRange，无法检查批次是否重叠`);
  else {
    const list = byChapter.get(chapter) ?? [];
    list.push({ file, range: data.pdfPageRange });
    byChapter.set(chapter, list);
  }

  for (const item of data.items) {
    // 2. srcId 格式
    if (!/^phy-[a-z0-9]+-p\d{3,4}-\d{2}(@\d+)?$/.test(item.srcId)) {
      err('srcid-format', `${file}：srcId「${item.srcId}」不符合 phy-<册>-p<3~4位>-<2位>`);
    }
    // 3. srcId 跨文件唯一
    const owner = seenSrcId.get(item.srcId);
    if (owner && owner !== file) {
      err('srcid-cross-file', `srcId「${item.srcId}」同时出现在 ${owner} 和 ${file}`);
    } else seenSrcId.set(item.srcId, file);

    // 4. kind 白名单
    if (item.kind && !KINDS.has(item.kind)) {
      err('kind-unknown', `${file}：${item.srcId} 的 kind「${item.kind}」不在白名单里`);
    }

    // 5. 栏目名与 kind 的对应关系（跨批一致性最关键的一条）
    const text = (item.text ?? '').trim();
    for (const [re, expected] of BLOCK_TITLES) {
      if (re.test(text) && item.kind !== expected) {
        err(
          'module-kind-mismatch',
          `${file}：${item.srcId} 的 text 是栏目标题「${text.slice(0, 18)}」，kind 应是 ${expected}，实际是 ${item.kind ?? '(空)'}`,
        );
        break;
      }
    }

    // 6. 非 figure 条目必须有原文文本
    if (item.kind !== 'figure' && item.kind !== 'table' && !text) {
      err('text-empty', `${file}：${item.srcId}（kind=${item.kind}）没有 text，无法核对是否漏转`);
    }

    // 7. captionOnImage 只能出现在 figure 上
    if (item.captionOnImage && item.kind !== 'figure') {
      err('captionOnImage-misuse', `${file}：${item.srcId} 不是 figure 却标了 captionOnImage`);
    }
  }
}

// 8. 同一章各批次的页码区间不能重叠
for (const [chapter, list] of byChapter) {
  const sorted = list.filter((x) => x.range).sort((a, b) => a.range![0] - b.range![0]);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.range![0] <= prev.range![1]) {
      err(
        'page-range-overlap',
        `${chapter}：${prev.file}（${prev.range!.join('-')}）与 ${cur.file}（${cur.range!.join('-')}）页码区间重叠`,
      );
    }
    if (cur.range![0] !== prev.range![1] + 1) {
      warn(
        'page-range-gap',
        `${chapter}：${prev.file} 结束于 ${prev.range![1]}，${cur.file} 从 ${cur.range![0]} 开始，中间有缺页`,
      );
    }
  }
}

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');

for (const i of issues) {
  console.log(`  ${i.severity === 'error' ? 'error  ' : 'warning'} [${i.code}] ${i.message}`);
}
console.log('');
console.log(`清单 ${manifests.length} 份 · 条目 ${seenSrcId.size} · 错误 ${errors.length} · 告警 ${warnings.length}`);
process.exit(errors.length > 0 ? 1 : 0);
