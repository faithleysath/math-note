/**
 * 整页渲染 + `geometry.json`。
 *
 *   bun run scripts/render-book-pages.ts --volume b8a [--dpi 200] [--from 1] [--to 158] [--force]
 *
 * 行为见 `docs/plans/render-task.md`：
 * - 按 `/CropBox` + `/Rotate` 渲染（`pdftoppm` 默认就是 CropBox，这里显式传 `-cropbox`）
 * - 输出 `local-textbook/sukey/pages/<vol>/p<四位页序>.png`（规约 §11）
 * - 幂等：目标 PNG 已存在且可读就跳过；第二次跑必须全部跳过
 * - 同时写 `geometry.json`：每页 CropBox / MediaBox / Rotate + PNG 实际像素尺寸，
 *   这是 `src/lib/coords.ts` 的输入，脚本自己**不**做任何 PDF→region 换算
 *
 * 只依赖已装的 poppler（`pdfinfo` / `pdftoppm`）+ Node 内置模块，不装依赖。
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SUK = join(REPO_ROOT, 'local-textbook', 'sukey');

/** 册简称 → `manifest.json` 里的 `volume`（中文册名） */
const SLUG_TO_NAME: Record<string, string> = {
  b8a: '八上',
  b8b: '八下',
  b9a: '九上',
  b9b: '九下',
};

const DEFAULT_DPI = 200;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Options {
  volume: string;
  dpi: number;
  from: number | null;
  to: number | null;
  force: boolean;
}

interface PdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PageGeometry {
  pdfPage: number;
  rotate: 0 | 90 | 180 | 270;
  mediaBox: PdfBox;
  cropBox?: PdfBox;
  rendered: { width: number; height: number };
}

const USAGE = `整页渲染 + geometry.json

  bun run scripts/render-book-pages.ts --volume <b8a|b8b|b9a|b9b> [选项]

选项
  --volume <册>   必填，册简称（或中文册名 八上/八下/九上/九下）
  --dpi <n>       渲染分辨率，默认 ${DEFAULT_DPI}
  --from <页>     起始 PDF 页（1 起），默认 1
  --to <页>       结束 PDF 页（含），默认该册总页数
  --force         忽略已存在的 PNG，重渲染
  -h, --help      显示本帮助

输出
  local-textbook/sukey/pages/<vol>/p0001.png
  local-textbook/sukey/pages/<vol>/geometry.json
`;

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
  let force = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '--force') {
      force = true;
      continue;
    }
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

  const known = new Set(['volume', 'dpi', 'from', 'to']);
  for (const key of values.keys()) {
    if (!known.has(key)) fail(`认不出的参数「--${key}」。\n\n${USAGE}`);
  }

  const volume = values.get('volume');
  if (!volume) fail(`缺少 --volume。\n\n${USAGE}`);

  const dpi = values.has('dpi') ? parsePositiveInt(values.get('dpi')!, '--dpi') : DEFAULT_DPI;
  if (dpi < 50 || dpi > 600) fail(`--dpi 应在 50..600 之间，收到 ${dpi}。`);

  return {
    volume,
    dpi,
    from: values.has('from') ? parsePositiveInt(values.get('from')!, '--from') : null,
    to: values.has('to') ? parsePositiveInt(values.get('to')!, '--to') : null,
    force,
  };
}

function resolveVolume(slugOrName: string): { slug: string; name: string; pdfName: string; pdfPath: string } {
  const directName = SLUG_TO_NAME[slugOrName];
  const slug = directName
    ? slugOrName
    : Object.keys(SLUG_TO_NAME).find((key) => SLUG_TO_NAME[key] === slugOrName);
  if (!slug) fail(`不认识的册「${slugOrName}」，可选：${Object.keys(SLUG_TO_NAME).join(' / ')}。`);

  const name = SLUG_TO_NAME[slug];
  const manifestPath = join(SUK, 'manifest.json');
  if (!existsSync(manifestPath)) fail(`找不到 ${manifestPath}。`);

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((item) => item.volume === name);
  if (!entry) fail(`manifest.json 里没有「${name}」这一册。`);
  if (typeof entry.pdfPath !== 'string') fail(`manifest.json 的「${name}」条目缺 pdfPath。`);

  const pdfPath = join(SUK, entry.pdfPath);
  if (!existsSync(pdfPath)) fail(`找不到 PDF：${pdfPath}。`);
  return { slug, name, pdfName: entry.pdfPath.split('/').at(-1)!, pdfPath };
}

function pdfInfo(args: string[]): string {
  try {
    return execFileSync('pdfinfo', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    fail(`pdfinfo 执行失败${stderr ? `：${stderr}` : `（${String(error)}）`}。`);
  }
}

function readPdfPageCount(pdfPath: string): number {
  const output = pdfInfo([pdfPath]);
  const match = /^Pages:\s+(\d+)$/m.exec(output);
  if (!match) fail('pdfinfo 输出里没找到 Pages 行。');
  return Number(match[1]);
}

function parseBox(raw: string, label: string): PdfBox {
  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    fail(`${label} 解析失败：「${raw}」。`);
  }
  return { x0: parts[0], y0: parts[1], x1: parts[2], y1: parts[3] };
}

/**
 * `pdfinfo -box -f 1 -l N`：一次拿到全册每页的 MediaBox / CropBox / Rotate。
 * Rotate 行只在非 0 时出现（poppler 的行为），缺行按 0 处理。
 */
function readVolumeBoxes(pdfPath: string, pageCount: number): Map<number, Omit<PageGeometry, 'rendered'>> {
  const output = pdfInfo(['-box', '-f', '1', '-l', String(pageCount), pdfPath]);
  const boxes = new Map<number, Omit<PageGeometry, 'rendered'>>();

  for (const line of output.split('\n')) {
    const match = /^Page\s+(\d+)\s+(MediaBox|CropBox|rot):\s+(.+)$/.exec(line);
    if (!match) continue;
    const pdfPage = Number(match[1]);
    const field = match[2];
    const raw = match[3].trim();
    const current = boxes.get(pdfPage);

    if (field === 'rot') {
      const rotate = Number(raw);
      if (rotate !== 0 && rotate !== 90 && rotate !== 180 && rotate !== 270) {
        fail(`第 ${pdfPage} 页 /Rotate = ${raw}，只接受 0/90/180/270。`);
      }
      boxes.set(pdfPage, { pdfPage, rotate, mediaBox: { x0: 0, y0: 0, x1: 0, y1: 0 }, cropBox: current?.cropBox });
      continue;
    }

    const box = parseBox(raw, `第 ${pdfPage} 页 ${field}`);
    const base: Omit<PageGeometry, 'rendered'> = current ?? {
      pdfPage,
      rotate: 0,
      mediaBox: box,
    };
    if (field === 'MediaBox') base.mediaBox = box;
    else base.cropBox = box;
    boxes.set(pdfPage, base);
  }

  for (let page = 1; page <= pageCount; page += 1) {
    const box = boxes.get(page);
    if (!box) fail(`pdfinfo 没给出第 ${page} 页的几何信息。`);
    const media = box.mediaBox;
    if (media.x1 - media.x0 <= 0 || media.y1 - media.y0 <= 0) {
      fail(`第 ${page} 页的 MediaBox 无效：${JSON.stringify(media)}。`);
    }
  }
  return boxes;
}

/** 读 PNG 头的 IHDR 拿真实像素尺寸；坏文件返回 null。 */
function readPngSize(path: string): { width: number; height: number } | null {
  let buffer: Buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    return null;
  }
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

function pngName(pdfPage: number): string {
  return `p${String(pdfPage).padStart(4, '0')}.png`;
}

function isUsablePng(path: string): boolean {
  return readPngSize(path) !== null;
}

/** 把页号列表压成连续区间，减少 pdftoppm 启动次数。 */
function toRuns(pages: number[]): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  for (const page of [...pages].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && page === last.end + 1) last.end = page;
    else runs.push({ start: page, end: page });
  }
  return runs;
}

function dirSizeBytes(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    total += info.isDirectory() ? dirSizeBytes(path) : info.size;
  }
  return total;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function renderSinglePage(
  pdfPath: string,
  dpi: number,
  page: number,
  target: string,
  tmpDir: string,
): string | null {
  const prefix = join(tmpDir, `p-${String(page).padStart(4, '0')}`);
  try {
    execFileSync(
      'pdftoppm',
      ['-r', String(dpi), '-png', '-cropbox', '-f', String(page), '-l', String(page), '-singlefile', pdfPath, prefix],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    return `pdftoppm 失败${stderr ? `：${stderr.split('\n').slice(-1)[0]}` : `（${String(error)}）`}`;
  }
  const produced = `${prefix}.png`;
  if (!existsSync(produced)) return 'pdftoppm 退出码为 0 但没产出 PNG';
  const size = readPngSize(produced);
  if (!size) return '产出的 PNG 读不出 IHDR（文件损坏）';
  renameSync(produced, target);
  return null;
}

/** 先按区间批量渲染；区间失败再逐页重试，保证报出具体页号。 */
function renderRange(
  pdfPath: string,
  dpi: number,
  run: { start: number; end: number },
  pagesDir: string,
  tmpDir: string,
  failures: Array<{ page: number; reason: string }>,
): number {
  const target = (page: number) => join(pagesDir, pngName(page));
  const first = target(run.start);
  if (run.start === run.end) {
    const reason = renderSinglePage(pdfPath, dpi, run.start, first, tmpDir);
    if (reason) failures.push({ page: run.start, reason });
    return reason ? 0 : 1;
  }

  try {
    execFileSync(
      'pdftoppm',
      ['-r', String(dpi), '-png', '-cropbox', '-f', String(run.start), '-l', String(run.end), pdfPath, join(tmpDir, 'p')],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    console.error(
      `! 第 ${run.start}-${run.end} 页批量渲染失败，改为逐页重试${stderr ? `：${stderr.split('\n').slice(-1)[0]}` : ''}`,
    );
    let rendered = 0;
    for (let page = run.start; page <= run.end; page += 1) {
      const reason = renderSinglePage(pdfPath, dpi, page, target(page), tmpDir);
      if (reason) failures.push({ page, reason });
      else rendered += 1;
    }
    return rendered;
  }

  const produced = new Map<number, string>();
  for (const name of readdirSync(tmpDir)) {
    const match = /^p-(\d+)\.png$/.exec(name);
    if (match) produced.set(Number(match[1]), join(tmpDir, name));
  }

  let rendered = 0;
  for (let page = run.start; page <= run.end; page += 1) {
    const path = produced.get(page);
    if (!path) {
      failures.push({ page, reason: 'pdftoppm 没产出该页' });
      continue;
    }
    const size = readPngSize(path);
    if (!size) {
      failures.push({ page, reason: '产出的 PNG 读不出 IHDR（文件损坏）' });
      continue;
    }
    renameSync(path, target(page));
    rendered += 1;
  }
  return rendered;
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return;
  }

  const started = Date.now();
  const { slug, name, pdfName, pdfPath } = resolveVolume(parsed.volume);
  const pdfPageCount = readPdfPageCount(pdfPath);

  const from = parsed.from ?? 1;
  const to = parsed.to ?? pdfPageCount;
  if (from > pdfPageCount) fail(`--from ${from} 超出总页数 ${pdfPageCount}。`);
  if (to > pdfPageCount) fail(`--to ${to} 超出总页数 ${pdfPageCount}（${name}）。`);
  if (from > to) fail(`--from ${from} 大于 --to ${to}。`);

  const pagesDir = join(SUK, 'pages', slug);
  mkdirSync(pagesDir, { recursive: true });

  console.log(`册：${slug}（${name}）  PDF：${pdfPath}`);
  console.log(`页范围：${from}..${to} / 共 ${pdfPageCount} 页   dpi=${parsed.dpi}${parsed.force ? '  --force' : ''}`);

  const requested: number[] = [];
  for (let page = from; page <= to; page += 1) requested.push(page);

  const pending = requested.filter((page) => parsed.force || !isUsablePng(join(pagesDir, pngName(page))));
  const skipped = requested.length - pending.length;
  const failures: Array<{ page: number; reason: string }> = [];

  // 已有但损坏的 PNG（0 字节 / 半截文件）当作缺失，顺带报出来
  for (const page of requested) {
    const path = join(pagesDir, pngName(page));
    if (existsSync(path) && !isUsablePng(path) && !parsed.force) {
      console.warn(`! 第 ${page} 页的 ${pngName(page)} 存在但不可读，已重渲染。`);
    }
  }

  let rendered = 0;
  if (pending.length === 0) {
    console.log('全部跳过（目标 PNG 均已存在且可读）。');
  } else {
    console.log(`待渲染 ${pending.length} 页，跳过 ${skipped} 页。`);
    const tmpDir = join(pagesDir, `.tmp-${process.pid}-${started}`);
    mkdirSync(tmpDir, { recursive: true });
    try {
      for (const run of toRuns(pending)) {
        const label = run.start === run.end ? `第 ${run.start} 页` : `第 ${run.start}-${run.end} 页`;
        const done = renderRange(pdfPath, parsed.dpi, run, pagesDir, tmpDir, failures);
        rendered += done;
        console.log(`  ✓ ${label}（${done} 页）`);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // ---- geometry.json：磁盘上真实存在的 PNG + pdfinfo 的页框 ----
  const boxes = readVolumeBoxes(pdfPath, pdfPageCount);
  const pages: PageGeometry[] = [];
  for (let page = 1; page <= pdfPageCount; page += 1) {
    const path = join(pagesDir, pngName(page));
    if (!existsSync(path)) continue;
    const renderedSize = readPngSize(path);
    if (!renderedSize) {
      failures.push({ page, reason: `geometry：${pngName(page)} 读不出像素尺寸` });
      continue;
    }
    const box = boxes.get(page);
    if (!box) {
      failures.push({ page, reason: 'geometry：pdfinfo 缺该页页框' });
      continue;
    }
    const crop = box.cropBox ?? box.mediaBox;
    const expectedWidth = Math.round(((crop.x1 - crop.x0) * parsed.dpi) / 72);
    const expectedHeight = Math.round(((crop.y1 - crop.y0) * parsed.dpi) / 72);
    const sizeMatches =
      Math.abs(renderedSize.width - expectedWidth) <= 1 && Math.abs(renderedSize.height - expectedHeight) <= 1;
    if (!sizeMatches) {
      console.warn(
        `! 第 ${page} 页像素尺寸 ${renderedSize.width}×${renderedSize.height} 与 CropBox@${parsed.dpi}dpi 推算的 ${expectedWidth}×${expectedHeight} 不一致（该页可能不是本次 dpi 渲染的）。`,
      );
    }
    pages.push({ pdfPage: page, ...box, rendered: renderedSize });
  }

  const geometryPath = join(pagesDir, 'geometry.json');
  const geometry = {
    volume: slug,
    pdf: pdfName,
    dpi: parsed.dpi,
    pdfPageCount,
    pages,
  };
  const serialized = `${JSON.stringify(geometry, null, 2)}\n`;
  const previous = existsSync(geometryPath) ? readFileSync(geometryPath, 'utf8') : null;
  if (previous === serialized) {
    console.log(`geometry.json 未变化（${pages.length} 页）。`);
  } else {
    writeFileSync(geometryPath, serialized);
    console.log(`geometry.json 已写入 ${pages.length} 页。`);
  }
  if (previous !== null && pages.length > 0 && pages.length < pdfPageCount) {
    console.log(`  （geometry.json 目前只覆盖已渲染的 ${pages.length}/${pdfPageCount} 页，全册渲染后会补齐）`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log('');
  console.log(`渲染 ${rendered} 页 / 跳过 ${skipped} 页 / 失败 ${failures.length} 页   耗时 ${elapsed}s`);
  console.log(`输出目录 ${pagesDir}（${formatBytes(dirSizeBytes(pagesDir))}）`);

  if (failures.length > 0) {
    console.error('失败页：');
    for (const item of [...failures].sort((a, b) => a.page - b.page)) {
      console.error(`  第 ${item.page} 页：${item.reason}`);
    }
    process.exitCode = 1;
  }
}

main();
