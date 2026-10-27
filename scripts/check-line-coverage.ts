/**
 * 行覆盖检查：清单里的 region 有没有漏掉正文行。
 *
 *   bun run check:lines --expected <清单.json> [--tolerance 0.004]
 *
 * 为什么需要它：`check:expected` 只校验 region 合法性与重叠声明，**它不知道页面上还有哪些字没被框住**。
 * 漏一块正文时覆盖率照样 100%。这个脚本把 PDF 文字层的每个词拿来做探针，
 * 看它落在哪个条目的 region 里；落不进去的就是候选漏块。
 *
 * 只对有文字层的册子有效（八上、九上）。八下、九下没有文字层，用 OCR 也拿不到逐词坐标，
 * 只能靠 `draw:boxes` 的核对图人眼过。
 *
 * 按规则允许「不覆盖」的行：
 * - 页眉页脚（y < 6% 或 y > 93%）
 * - 页码（纯数字且在最下方）
 * - 「图 X-Y ……」图注行（规约 §3.1：figure 的 region 不含图注行）
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Item {
  srcId: string;
  kind: string;
  pdfPage: number;
  region?: Region;
  extraRegions?: { pdfPage: number; region: Region }[];
}
interface Expected {
  volume: string;
  items: Item[];
}

interface Word {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const expectedPath = arg('expected');
if (expectedPath === undefined) {
  console.error('用法：bun run check:lines --expected <清单.json>');
  process.exit(2);
}
const expected = JSON.parse(readFileSync(resolve(expectedPath), 'utf8')) as Expected;
const pdfPath = PDFS[expected.volume];
if (pdfPath === undefined || !existsSync(pdfPath)) {
  console.error(`找不到 ${expected.volume} 的 PDF`);
  process.exit(2);
}

/** 每个 pdfPage 上所有条目 region 的并集 */
const regionsByPage = new Map<number, Region[]>();
for (const item of expected.items) {
  if (item.region !== undefined) {
    const list = regionsByPage.get(item.pdfPage) ?? [];
    list.push(item.region);
    regionsByPage.set(item.pdfPage, list);
  }
  for (const extra of item.extraRegions ?? []) {
    const list = regionsByPage.get(extra.pdfPage) ?? [];
    list.push(extra.region);
    regionsByPage.set(extra.pdfPage, list);
  }
}

function inside(region: Region, px: number, py: number): boolean {
  return px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height;
}

// 图注行：pdftotext 常把序号与「图」字倒序，所以两种写法都认
const CAPTION_ORDERED = /^图\s*\d+\s*[-–—]\s*\d+/;
const CAPTION_REVERSED = /\d+\s*[-–—]\s*\d+\s*图/;
const PAGE_NUMBER = /^\d{1,3}$/;

function wordsOf(page: number): { words: Word[]; width: number; height: number } {
  const xml = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const size = /<page width="([\d.]+)" height="([\d.]+)"/.exec(xml);
  const width = Number(size?.[1] ?? 0);
  const height = Number(size?.[2] ?? 0);
  const words: Word[] = [];
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  for (let m = re.exec(xml); m !== null; m = re.exec(xml)) {
    words.push({ x0: Number(m[1]), y0: Number(m[2]), x1: Number(m[3]), y1: Number(m[4]), text: m[5] });
  }
  return { words, width, height };
}

/** 把词聚成行：yMin 相差 < 3pt 且 x 接近 */
function linesOf(words: Word[]): Word[][] {
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: Word[][] = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last !== undefined) {
      const ref = last[0];
      const mid = (w.y0 + w.y1) / 2;
      const lastX1 = last[last.length - 1]?.x1 ?? 0;
      // 只并「右侧且贴得住」的词：y0 排序会把同一排里偏左上方的词排到前面，
      // 若不加方向判断，图注序号（13-39）会被并进左边另一栏的正文行（见 b9a p0084）。
      const gap = w.x0 - lastX1;
      if (ref !== undefined && Math.abs((ref.y0 + ref.y1) / 2 - mid) < 4 && gap > -2 && gap < 40) {
        last.push(w);
        continue;
      }
    }
    lines.push([w]);
  }
  return lines;
}

const pages = [...regionsByPage.keys()].sort((a, b) => a - b);
let uncoveredTotal = 0;
const report: string[] = [];

for (const page of pages) {
  const { words, width, height } = wordsOf(page);
  if (words.length === 0 || width === 0) continue;
  const regions = regionsByPage.get(page) ?? [];
  const misses: { text: string; x: number; y: number }[] = [];

  const lines = linesOf(words);
  // 图注区：以「图…」或单独一行编号（13-20）为种子，向上下按左边界对齐扩张，
  // 把折成多行的图注整块标记出来，避免逐行正则漏判（图 13-20 安培 那条就折成 4 行）。
  const isCaption = new Array<boolean>(lines.length).fill(false);
  const lineBox = (i: number) => {
    const line = lines[i] ?? [];
    return {
      text: line.map((w) => w.text).join('').trim(),
      x0: Math.min(...line.map((w) => w.x0)) / width,
      y0: Math.min(...line.map((w) => w.y0)) / height,
      y1: Math.max(...line.map((w) => w.y1)) / height,
    };
  };
  const bareNumber = (t: string) => /^\d{1,3}\s*[-–—]\s*\d{1,3}$/.test(t);
  for (let i = 0; i < lines.length; i++) {
    const box = lineBox(i);
    if (box.text.length === 0) continue;
    const seed =
      bareNumber(box.text) ||
      (box.text.startsWith('图') && box.text.length < 40 && !/[。？！]$/.test(box.text));
    if (!seed) continue;
    isCaption[i] = true;
    for (const dir of [1, -1]) {
      let j = i + dir;
      let ref = box;
      while (j >= 0 && j < lines.length) {
        const cur = lineBox(j);
        const gap = dir === 1 ? cur.y0 - ref.y1 : ref.y0 - cur.y1;
        if (Math.abs(cur.x0 - box.x0) > 0.03 || gap > 0.025 || cur.text.length > 40) break;
        isCaption[j] = true;
        ref = cur;
        j += dir;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const text = line.map((w) => w.text).join('');
    if (text.trim().length === 0) continue;
    const x0 = Math.min(...line.map((w) => w.x0)) / width;
    const x1 = Math.max(...line.map((w) => w.x1)) / width;
    const y0 = Math.min(...line.map((w) => w.y0)) / height;
    const y1 = Math.max(...line.map((w) => w.y1)) / height;

    // 规则允许不覆盖的
    if (y1 < 0.07 || y0 > 0.93) continue;
    if (PAGE_NUMBER.test(text.trim())) continue;
    if (CAPTION_ORDERED.test(text.trim()) || (CAPTION_REVERSED.test(text.trim()) && /图/.test(text) && text.trim().length < 32)) continue;
    if (isCaption[i] === true) continue;

    // 行中心 + 两端点，三点里至少两点被覆盖才算出问题（避免单点落在缝隙上误报）
    const probes: [number, number][] = [
      [(x0 + x1) / 2, (y0 + y1) / 2],
      [x0 + 0.002, (y0 + y1) / 2],
      [x1 - 0.002, (y0 + y1) / 2],
    ];
    const covered = probes.filter(([px, py]) => regions.some((r) => inside(r, px, py))).length;
    if (covered >= 2) continue;
    misses.push({ text: text.trim().slice(0, 52), x: x0, y: y0 });
  }

  if (misses.length > 0) {
    uncoveredTotal += misses.length;
    report.push(`p${String(page).padStart(4, '0')}  ${misses.length} 行未覆盖`);
    for (const m of misses) report.push(`    y=${m.y.toFixed(3)} x=${m.x.toFixed(3)}  ${m.text}`);
  }
}

console.log(`${expectedPath.split('/').pop()} · ${expected.items.length} 条条目 · ${pages.length} 页`);
if (uncoveredTotal === 0) {
  console.log('✓ 所有正文行都落在条目 region 内');
} else {
  console.log(`⚠ ${uncoveredTotal} 行未覆盖（逐条看是不是漏块；图注/页眉/页码已排除）：`);
  for (const line of report) console.log(line);
}
