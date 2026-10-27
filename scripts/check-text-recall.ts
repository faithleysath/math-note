/**
 * 文字层召回检查：PDF 原文的句子有多少进了图谱。
 *
 *   bun run check:recall --volume b9a [--parts <目录>] [--threshold 0.85]
 *
 * 为什么需要它：`check:part` 只校验「清单里的 srcId 有没有被认领」，而清单本身可能漏块 ——
 * 覆盖率 100% 不代表原文没丢。这个脚本拿 PDF 文字层当独立信源反向核对。
 *
 * 算法：把 PDF 每页按句末标点切句，每句去空白标点后取 10 字窗口（每 3 字取一个），
 * 算有多少窗口在图谱的全部文字里出现过；≥60% 的窗口命中即算「这句转写进来了」。
 *
 * 校准（八年级上册，已逐页视觉复核）：**91.0%**（1673/1838 句）。
 * 未命中的绝大多数是 pdftotext 把左右两栏并成一行的产物，不是真丢内容。
 * 所以**基准是 91% 而不是 100%**，看的是「明显低于八上的册子」。
 *
 * 只对有文字层的册子有效（八上、九上）。八下、九下要用 OCR 文本替代 PDF 文字层。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SUK = join(REPO_ROOT, 'local-textbook', 'sukey');

const PDFS: Record<string, string> = {
  b8a: join(SUK, 'raw', 'sukey-八上.pdf'),
  b8b: join(SUK, 'raw', 'sukey-八下.pdf'),
  b9a: join(SUK, 'raw', 'sukey-九上.pdf'),
  b9b: join(SUK, 'raw', 'sukey-九下.pdf'),
};

const WINDOW = 10;
const STEP = 3;
const SENTENCE_THRESHOLD = 0.6;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const volume = arg('volume');
if (volume === undefined) {
  console.error('用法：bun run check:recall --volume b9a [--parts <目录>] [--threshold 0.85]');
  process.exit(2);
}
const pdfPath = PDFS[volume];
if (pdfPath === undefined || !existsSync(pdfPath)) {
  console.error(`找不到 ${volume} 的 PDF`);
  process.exit(2);
}
const partsDir = resolve(arg('parts') ?? join(SUK, 'parts'));
const threshold = Number(arg('threshold') ?? 0.85);

/** 只留文字骨架：去掉空白、标点、markdown 记号 */
function skeleton(text: string): string {
  return text.replace(/[^\w\u4e00-\u9fff]/g, '');
}

interface PartMeta {
  meta: { pdfPageRange: [number, number] };
}

const files = readdirSync(partsDir).filter((f) => f.startsWith(`${volume}-`) && f.endsWith('.json')).sort();
if (files.length === 0) {
  console.error(`${partsDir} 里没有 ${volume} 的 part`);
  process.exit(2);
}

let graphText = '';
const ranges: [number, number][] = [];
for (const file of files) {
  const raw = readFileSync(join(partsDir, file), 'utf8');
  graphText += raw;
  const meta = (JSON.parse(raw) as PartMeta).meta;
  ranges.push(meta.pdfPageRange);
}
const graph = skeleton(graphText);
const graphWindows = new Set<string>();
for (let i = 0; i + WINDOW <= graph.length; i++) graphWindows.add(graph.slice(i, i + WINDOW));

function scoreSentence(sentence: string): number | null {
  const t = skeleton(sentence);
  if (t.length < 12) return null;
  let hit = 0;
  let total = 0;
  for (let i = 0; i + WINDOW <= t.length; i += STEP) {
    total++;
    if (graphWindows.has(t.slice(i, i + WINDOW))) hit++;
  }
  return total === 0 ? null : hit / total;
}

function pageText(page: number): string {
  try {
    return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', pdfPath, '-'], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

const from = Math.min(...ranges.map((r) => r[0]));
const to = Math.max(...ranges.map((r) => r[1]));

let totalSentences = 0;
let hitSentences = 0;
const perPage: { page: number; total: number; hit: number; misses: string[] }[] = [];

for (let page = from; page <= to; page++) {
  const text = pageText(page);
  if (text.trim().length === 0) continue;
  let pageTotal = 0;
  let pageHit = 0;
  const misses: string[] = [];
  for (const sentence of text.split(/[。？！；\n]/)) {
    const score = scoreSentence(sentence);
    if (score === null) continue;
    pageTotal++;
    if (score >= SENTENCE_THRESHOLD) pageHit++;
    else if (misses.length < 4) misses.push(`${(score * 100).toFixed(0)}% ${sentence.trim().slice(0, 44)}`);
  }
  perPage.push({ page, total: pageTotal, hit: pageHit, misses });
  totalSentences += pageTotal;
  hitSentences += pageHit;
}

const pct = (h: number, t: number): string => (t === 0 ? '—' : `${((h / t) * 100).toFixed(1)}%`);

console.log(`${volume} · ${files.length} 份 part · pdfPage ${from}–${to}`);
console.log(`句级召回 ${pct(hitSentences, totalSentences)}（${hitSentences}/${totalSentences} 句）  参照：八上 91.0%`);
console.log('');

perPage.sort((a, b) => a.hit / a.total - b.hit / b.total);
const worst = perPage.filter((p) => p.total >= 4).slice(0, 8);
console.log('召回最低的 8 页（这几页要逐页看是不是有整块没转写）：');
for (const p of worst) {
  console.log(`  p${String(p.page).padStart(4, '0')}  ${pct(p.hit, p.total)}  ${p.total - p.hit}/${p.total} 句未命中`);
  for (const m of p.misses.slice(0, 2)) console.log(`        ${m}`);
}

const below = perPage.filter((p) => p.total >= 8 && p.hit / p.total < threshold);
console.log('');
console.log(
  below.length === 0
    ? `✓ 没有整页明显缺失（${perPage.length} 页，阈值 ${(threshold * 100).toFixed(0)}%）`
    : `⚠ ${below.length} 页低于 ${(threshold * 100).toFixed(0)}%：${below.map((p) => `p${p.page}`).join(' ')}`,
);
