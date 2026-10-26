/**
 * bbox 核对图：把 Pass 1 冻结清单的 `region` 叠回整页 PNG，生成可人工抽查的 HTML。
 *
 *   bun run scripts/draw-expected-boxes.ts --expected <expected.json> [--out <dir>] [--thumb 1200]
 *
 * 输入 `expected` 的格式见 `docs/plans/transcribe-spec.md` §3.2。
 * 换算一律走 `src/lib/coords.ts`（`regionProblem` / `regionBorder`），本脚本不自己算坐标。
 *
 * 不装依赖、不引 CDN：样式内联，框是绝对定位的 `<div>`，位置用百分比
 * （百分比相对 `<img>` 的显示尺寸，因此任意缩略宽度都不会错位）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regionBorder, regionProblem } from '../src/lib/coords';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SUK = join(REPO_ROOT, 'local-textbook', 'sukey');

const DEFAULT_THUMB = 1200;

interface SourceItem {
  srcId?: unknown;
  kind?: unknown;
  pdfPage?: unknown;
  region?: unknown;
  regionOmittedReason?: unknown;
  originalNumber?: unknown;
  text?: unknown;
}

interface ExpectedList {
  volume?: unknown;
  chapter?: unknown;
  items?: unknown;
}

interface Options {
  expected: string;
  out: string | null;
  thumb: number;
}

const USAGE = `bbox 核对图

  bun run scripts/draw-expected-boxes.ts --expected <expected.json> [选项]

选项
  --expected <文件>  Pass 1 冻结清单（规约 §3.2），必填
  --out <目录>       输出目录，默认 local-textbook/sukey/review/<册>-<章>
  --thumb <px>       整页图显示宽度，默认 ${DEFAULT_THUMB}
  -h, --help         显示本帮助

输出
  <out>/p0020.html   每页一个自包含 HTML（内联样式，图片用相对路径引用整页 PNG）
`;

const KIND_COLORS: Record<string, string> = {
  figure: '#e11d48',
  paragraph: '#2563eb',
  table: '#7c3aed',
  activity: '#059669',
  experiment: '#0891b2',
  exercise: '#d97706',
  example: '#db2777',
  formula: '#4d7c0f',
  heading: '#475569',
};
const PALETTE = ['#e11d48', '#2563eb', '#7c3aed', '#059669', '#0891b2', '#d97706', '#db2777', '#4d7c0f', '#475569'];

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function parsePositiveInt(raw: string, label: string): number {
  if (!/^\d+$/.test(raw)) fail(`${label} 必须是正整数，收到「${raw}」。`);
  const value = Number(raw);
  if (value < 1) fail(`${label} 必须 ≥ 1，收到 ${value}。`);
  return value;
}

function parseArgs(argv: string[]): Options | 'help' {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return 'help';
    if (!arg.startsWith('--')) fail(`认不出的参数「${arg}」。\n\n${USAGE}`);
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      values.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) fail(`参数 --${key} 缺少取值。\n\n${USAGE}`);
    values.set(key, next);
    i += 1;
  }

  for (const key of values.keys()) {
    if (!['expected', 'out', 'thumb'].includes(key)) fail(`认不出的参数「--${key}」。\n\n${USAGE}`);
  }
  const expected = values.get('expected');
  if (!expected) fail(`缺少 --expected。\n\n${USAGE}`);

  return {
    expected,
    out: values.get('out') ?? null,
    thumb: values.has('thumb') ? parsePositiveInt(values.get('thumb')!, '--thumb') : DEFAULT_THUMB,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function colorFor(kind: string | null): string {
  if (!kind) return '#475569';
  const known = KIND_COLORS[kind];
  if (known) return known;
  let hash = 0;
  for (const char of kind) hash = (hash * 31 + char.codePointAt(0)!) % 1_000_003;
  return PALETTE[hash % PALETTE.length];
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(path: string): { width: number; height: number } | null {
  const buffer = readFileSync(path);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width >= 1 && height >= 1 ? { width, height } : null;
}

function pngName(pdfPage: number): string {
  return `p${String(pdfPage).padStart(4, '0')}.png`;
}

function htmlName(pdfPage: number): string {
  return `p${String(pdfPage).padStart(4, '0')}.html`;
}

function percent(value: number): string {
  // 3 位小数 = 整页图上亚像素级，肉眼无差
  return `${(value * 100).toFixed(3)}%`;
}

interface LoadedGeometry {
  volume: string;
  pages: Map<number, { width: number; height: number }>;
}

function loadGeometry(volume: string): LoadedGeometry | null {
  const path = join(SUK, 'pages', volume, 'geometry.json');
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    volume?: unknown;
    pages?: Array<{ pdfPage?: unknown; rendered?: { width?: unknown; height?: unknown } }>;
  };
  const pages = new Map<number, { width: number; height: number }>();
  for (const page of parsed.pages ?? []) {
    if (typeof page.pdfPage !== 'number') continue;
    const width = page.rendered?.width;
    const height = page.rendered?.height;
    if (typeof width === 'number' && typeof height === 'number' && width >= 1 && height >= 1) {
      pages.set(page.pdfPage, { width, height });
    }
  }
  return { volume: asString(parsed.volume) ?? volume, pages };
}

interface Located {
  item: SourceItem;
  srcId: string;
  kind: string | null;
  region: { x: number; y: number; width: number; height: number };
  label: string;
}

interface Unlocated {
  srcId: string;
  reason: string;
}

function renderPageHtml(options: {
  volume: string;
  chapter: string | null;
  pdfPage: number;
  pngSource: string;
  sizes: { width: number; height: number };
  located: Located[];
  unlocated: Unlocated[];
  thumb: number;
}): string {
  const { volume, chapter, pdfPage, pngSource, sizes, located, unlocated, thumb } = options;
  const title = `${volume} · PDF 第 ${pdfPage} 页 · bbox 核对`;

  const boxes = located
    .map((entry) => {
      const color = colorFor(entry.kind);
      const { region } = entry;
      const border = regionBorder(region, sizes);
      // 框贴近页顶时标签放进框内，否则悬在框上方，避免被裁掉
      const tagClass = region.y < 0.04 ? 'tag tag-in' : 'tag';
      const tooltip = asString(entry.item.text) ?? '';
      return [
        `      <div class="box" style="left:${percent(region.x)};top:${percent(region.y)};` +
          `width:${percent(region.width)};height:${percent(region.height)};--c:${color}"` +
          ` data-px="${border.left},${border.top},${border.right},${border.bottom}"` +
          ` data-src-id="${escapeHtml(entry.srcId)}"` +
          (tooltip ? ` title="${escapeHtml(tooltip)}"` : '') +
          '>',
        `        <span class="${tagClass}">${escapeHtml(entry.label)}</span>`,
        '      </div>',
      ].join('\n');
    })
    .join('\n');

  const unlocatedPanel =
    unlocated.length === 0
      ? ''
      : [
          '  <aside class="omitted">',
          `    <h2>未定位 ${unlocated.length} 条</h2>`,
          '    <ul>',
          ...unlocated.map(
            (entry) =>
              `      <li data-src-id="${escapeHtml(entry.srcId)}">${escapeHtml(entry.srcId)}` +
              `（${escapeHtml(entry.reason)}）</li>`,
          ),
          '    </ul>',
          '  </aside>',
        ].join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 24px 56px;
    background: #eef1f5;
    color: #111827;
    font: 14px/1.5 -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  }
  header.bar {
    position: sticky;
    top: 0;
    z-index: 10;
    max-width: ${thumb}px;
    margin: 0 auto 16px;
    padding: 10px 14px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    align-items: baseline;
  }
  header.bar strong { font-size: 15px; }
  header.bar span { color: #4b5563; }
  .page {
    position: relative;
    width: ${thumb}px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.22);
    line-height: 0;
  }
  .page img { display: block; width: 100%; height: auto; }
  .box {
    position: absolute;
    border: 2px solid var(--c);
    background: color-mix(in srgb, var(--c) 10%, transparent);
    line-height: 1.4;
  }
  .box:hover { outline: 3px solid #111; z-index: 6; }
  .tag {
    position: absolute;
    left: -2px;
    top: 0;
    transform: translateY(-100%);
    padding: 1px 5px;
    border-radius: 3px 3px 0 0;
    background: var(--c);
    color: #fff;
    font: 600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: nowrap;
    max-width: 92vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag.tag-in { transform: none; top: 0; }
  .omitted {
    position: fixed;
    right: 16px;
    bottom: 16px;
    max-width: 460px;
    max-height: 50vh;
    overflow: auto;
    z-index: 20;
    padding: 10px 14px;
    border: 2px solid #dc2626;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.97);
    color: #dc2626;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.22);
  }
  .omitted h2 { margin: 0 0 6px; font-size: 13px; }
  .omitted ul { margin: 0; padding-left: 18px; font-size: 12px; }
  .omitted li + li { margin-top: 4px; }
</style>
</head>
<body>
  <header class="bar">
    <strong>${escapeHtml(volume)}${chapter ? ` · ${escapeHtml(chapter)}` : ''} · PDF 第 ${pdfPage} 页</strong>
    <span>渲染 ${sizes.width}×${sizes.height} px</span>
    <span>已定位 ${located.length} 条 / 未定位 ${unlocated.length} 条</span>
  </header>
  <main>
    <div class="page">
      <img src="${escapeHtml(pngSource)}" alt="${escapeHtml(`PDF 第 ${pdfPage} 页`)}" width="${sizes.width}" height="${sizes.height}">
${boxes}
    </div>
  </main>
${unlocatedPanel}
</body>
</html>
`;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options === 'help') {
    console.log(USAGE);
    return;
  }

  const expectedPath = resolve(process.cwd(), options.expected);
  if (!existsSync(expectedPath)) fail(`找不到清单：${options.expected}。`);

  let parsed: ExpectedList;
  try {
    parsed = JSON.parse(readFileSync(expectedPath, 'utf8')) as ExpectedList;
  } catch (error) {
    fail(`清单不是合法 JSON：${String(error)}。`);
  }
  if (!Array.isArray(parsed.items)) fail('清单缺 items 数组（规约 §3.2）。');

  const chapter = asString(parsed.chapter);
  const volume = asString(parsed.volume) ?? chapter?.match(/^phy-([a-z0-9]+)-c\d+$/)?.[1] ?? null;
  if (!volume) fail('清单缺 volume（chapter 也推不出册简称），无法定位整页 PNG。');

  const chapterSlug = chapter?.match(/c\d+$/)?.[0] ?? 'all';
  const outDir = options.out
    ? resolve(process.cwd(), options.out)
    : join(SUK, 'review', `${volume}-${chapterSlug}`);
  mkdirSync(outDir, { recursive: true });

  const geometry = loadGeometry(volume);
  if (!geometry) {
    console.log(`! 没找到 pages/${volume}/geometry.json，改用 PNG 头的 IHDR 取像素尺寸。`);
  } else if (geometry.volume !== volume) {
    console.log(`! geometry.json 里的 volume 是「${geometry.volume}」，与清单的「${volume}」不一致，已按页码取值。`);
  }

  const byPage = new Map<number, SourceItem[]>();
  const badItems: string[] = [];
  for (const [index, item] of parsed.items.entries()) {
    if (typeof item !== 'object' || item === null) {
      badItems.push(`items[${index}] 不是对象`);
      continue;
    }
    const pdfPage = item.pdfPage;
    if (typeof pdfPage !== 'number' || !Number.isInteger(pdfPage) || pdfPage < 1) {
      badItems.push(`items[${index}]（srcId=${String(item.srcId)}）的 pdfPage 不是 ≥1 的整数`);
      continue;
    }
    const list = byPage.get(pdfPage) ?? [];
    list.push(item);
    byPage.set(pdfPage, list);
  }

  const pages = [...byPage.keys()].sort((a, b) => a - b);
  const missingPages: number[] = [];
  const written: Array<{ pdfPage: number; located: number; unlocated: number; file: string }> = [];
  const invalidRegions: string[] = [];

  let totalItems = 0;
  let totalLocated = 0;
  let totalUnlocated = 0;
  let itemsOnMissingPages = 0;

  for (const pdfPage of pages) {
    const items = byPage.get(pdfPage)!;
    totalItems += items.length;

    const pngPath = join(SUK, 'pages', volume, pngName(pdfPage));
    if (!existsSync(pngPath)) {
      missingPages.push(pdfPage);
      itemsOnMissingPages += items.length;
      continue;
    }

    let sizes = geometry?.pages.get(pdfPage) ?? null;
    if (!sizes) {
      const fromPng = readPngSize(pngPath);
      if (!fromPng) {
        missingPages.push(pdfPage);
        console.log(`! 第 ${pdfPage} 页的 ${pngName(pdfPage)} 读不出像素尺寸，已跳过。`);
        continue;
      }
      sizes = fromPng;
    }

    const located: Located[] = [];
    const unlocated: Unlocated[] = [];

    for (const item of items) {
      const srcId = asString(item.srcId) ?? '(缺 srcId)';
      const kind = asString(item.kind);
      const reason = asString(item.regionOmittedReason);

      if (item.region === undefined || item.region === null) {
        if (!reason) {
          const problem = `条目 ${srcId} 既没有 region 也没有 regionOmittedReason（规约 §3.2 要求二选一）`;
          invalidRegions.push(`第 ${pdfPage} 页 ${problem}`);
          unlocated.push({ srcId, reason: '未写 regionOmittedReason' });
          continue;
        }
        unlocated.push({ srcId, reason });
        continue;
      }

      const problem = regionProblem(item.region);
      if (problem) {
        invalidRegions.push(`第 ${pdfPage} 页 ${srcId}：${problem}`);
        unlocated.push({ srcId, reason: `region 非法：${problem}` });
        continue;
      }

      const region = item.region as { x: number; y: number; width: number; height: number };
      const number = asString(item.originalNumber);
      located.push({
        item,
        srcId,
        kind,
        region,
        label: [srcId, kind, number].filter((part): part is string => Boolean(part)).join(' · '),
      });
    }

    totalLocated += located.length;
    totalUnlocated += unlocated.length;

    const relativePng = relative(outDir, pngPath).split('\\').join('/');
    const html = renderPageHtml({
      volume,
      chapter,
      pdfPage,
      pngSource: relativePng,
      sizes,
      located,
      unlocated,
      thumb: options.thumb,
    });
    const file = join(outDir, htmlName(pdfPage));
    writeFileSync(file, html);
    written.push({ pdfPage, located: located.length, unlocated: unlocated.length, file });
  }

  // ---- 统计 ----
  console.log(`清单：${options.expected}`);
  console.log(`    volume=${volume}${chapter ? ` chapter=${chapter}` : '（无 chapter）'}`);
  console.log(
    `总条目 ${totalItems}（已定位 ${totalLocated} / 未定位 ${totalUnlocated}）  涉及 ${pages.length} 页`,
  );

  if (itemsOnMissingPages > 0) {
    console.log(`其中 ${itemsOnMissingPages} 条属于缺失页，未生成核对图。`);
  }

  if (written.length > 0) {
    const counts = written.map((entry) => entry.located + entry.unlocated);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const maxPages = written.filter((entry) => entry.located + entry.unlocated === max).map((entry) => entry.pdfPage);
    const minPages = written.filter((entry) => entry.located + entry.unlocated === min).map((entry) => entry.pdfPage);
    console.log(`每页条目数 min=${min}（${minPages.map((page) => `p${page}`).join(', ')}） max=${max}（${maxPages.map((page) => `p${page}`).join(', ')}）`);
    for (const entry of written) {
      const unlocatedNote = entry.unlocated > 0 ? `，未定位 ${entry.unlocated}` : '';
      console.log(`  ${htmlName(entry.pdfPage)}  ${entry.located + entry.unlocated} 条${unlocatedNote}`);
    }
    console.log(`输出 ${written.length} 个 HTML → ${outDir}`);
  } else {
    console.log('没有可生成的页面。');
  }

  if (missingPages.length > 0) {
    console.log(`缺失页（无可用 PNG，已跳过）：${missingPages.map((page) => `p${page}`).join(', ')}`);
  }
  if (invalidRegions.length > 0) {
    console.log('清单问题：');
    for (const line of invalidRegions) console.log(`  ✗ ${line}`);
  }
  if (badItems.length > 0) {
    console.log('无法归页的条目：');
    for (const line of badItems) console.log(`  ✗ ${line}`);
  }
  if (invalidRegions.length > 0 || badItems.length > 0) process.exitCode = 1;
}

main();
