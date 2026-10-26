/**
 * 裁图流水线：按 `assets[].region` 裁插图、算哈希、回填字段（规约 §10 / §11）。
 *
 *   bun run scripts/crop-figures.ts --parts <目录或单个 part.json>
 *        [--dpi 200] [--force] [--dry-run]
 *
 * 行为见 `docs/plans/crop-task.md`：
 * - 像素换算只走 `src/lib/coords.ts`（`regionProblem` / `regionToPixels`），脚本自己不做坐标换算
 * - 直接让 `pdftoppm` 用 `-x -y -W -H` 裁，不先渲染整页再切
 * - 输出 `local-textbook/sukey/assets/<册>/<assetId>.png`，回填 path / mimeType / byteLength / sha256
 * - 幂等：字段齐全、文件在、sha256 与尺寸都对得上就跳过（`--force` 除外）
 * - 顺带产 `local-textbook/sukey/review/<册>-<章>/figures.html` 核对图
 *
 * 退出码：0 全部成功；1 有资源裁图失败；2 参数 / IO / geometry 读不了
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CliError,
  EXIT_ISSUES,
  EXIT_OK,
  listJsonFiles,
  optionalInteger,
  parseCliArgs,
  readJsonFile,
  requireString,
  sortByCodePoint,
  writeJsonFile,
} from '../src/lib/cli-args';
import { regionProblem, regionToPixels, type Region, type RenderedSize } from '../src/lib/coords';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SUK = join(REPO_ROOT, 'local-textbook', 'sukey');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ASSET_ID_RE = /^[\w.-]+$/;

const USAGE = `裁图流水线：按 region 裁插图 + 算哈希 + 回填 part JSON

  bun run scripts/crop-figures.ts --parts <目录或单个 part.json> [选项]

选项
  --parts <路径>  必填，分章 part 目录（读 *.json）或单个 part 文件
  --dpi <n>       裁图分辨率，默认取 pages/<册>/geometry.json 的 dpi（50..600）
  --force         忽略已裁好的图，全部重裁
  --dry-run       只打印计划，不写图片、不改 JSON、不写核对图
  -h, --help      显示本帮助

输出
  local-textbook/sukey/assets/<册>/<assetId>.png
  local-textbook/sukey/review/<册>-<章>/figures.html

退出码：0 成功 · 1 有资源失败 · 2 参数 / 读文件 / geometry 有问题`;

interface Options {
  parts: string;
  dpi: number | null;
  force: boolean;
  dryRun: boolean;
}

interface PdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PageGeometry {
  pdfPage: number;
  rotate: number;
  mediaBox: PdfBox;
  cropBox?: PdfBox;
  rendered: RenderedSize;
}

interface VolumeGeometry {
  volume: string;
  pdf: string;
  dpi: number;
  pdfPageCount: number;
  pages: PageGeometry[];
}

/** part 里 `assets[]` 的实际形状（字段归属见 §10） */
interface AssetEntry {
  id?: unknown;
  caption?: unknown;
  alt?: unknown;
  pdfPage?: unknown;
  region?: unknown;
  regionOmittedReason?: unknown;
  nodeId?: unknown;
  path?: unknown;
  mimeType?: unknown;
  byteLength?: unknown;
  sha256?: unknown;
  [key: string]: unknown;
}

interface LoadedPart {
  path: string;
  raw: Record<string, unknown>;
  volume: string;
  chapter: string;
  assets: AssetEntry[];
}

interface ReviewEntry {
  volume: string;
  assetId: string;
  caption: string;
  alt: string;
  pdfPage: number;
  width: number;
  height: number;
  bytes: number;
  relPath: string;
}

type AssetOutcome =
  | { status: 'cropped'; width: number; height: number; bytes: number }
  | { status: 'skipped'; width: number; height: number; bytes: number }
  | { status: 'failed'; reason: string };

interface Counters {
  cropped: number;
  skipped: number;
  failed: number;
  croppedBytes: number;
  sizes: Array<{ label: string; width: number; height: number; bytes: number }>;
}

let tempCounter = 0;

function parseOptions(argv: string[]): Options | 'help' {
  const args = parseCliArgs(
    argv,
    {
      parts: { type: 'string' },
      dpi: { type: 'string' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    USAGE,
  );

  if (args.values.help === true) return 'help';

  const parts = requireString(args, 'parts', USAGE);
  const dpi = optionalInteger(args, 'dpi');
  if (dpi !== undefined && (dpi < 50 || dpi > 600)) {
    throw new CliError(`--dpi 应在 50..600 之间，收到 ${dpi}。\n\n${USAGE}`);
  }
  return {
    parts,
    dpi: dpi ?? null,
    force: args.values.force === true,
    dryRun: args.values['dry-run'] === true,
  };
}

function readPngSize(path: string): RenderedSize | null {
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

function sha256Of(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `--parts` 可以是目录也可以是单个文件；目录里跳过不像 part 的 JSON */
function loadParts(input: string): LoadedPart[] {
  const absolute = resolve(process.cwd(), input);
  if (!existsSync(absolute)) throw new CliError(`找不到 --parts 指定的路径：${input}`);

  const paths = statSync(absolute).isDirectory() ? listJsonFiles(absolute, '分章目录') : [absolute];
  if (paths.length === 0) throw new CliError(`目录里没有 *.json：${input}`);

  const parts: LoadedPart[] = [];
  for (const path of paths) {
    const raw = readJsonFile(path, '分章 part');
    if (!isRecord(raw)) throw new CliError(`分章 part 必须是 JSON 对象：${path}`);
    if (!('meta' in raw) && !('nodes' in raw)) {
      console.error(`跳过 ${path}：不是分章 part（没有 meta / nodes）`);
      continue;
    }
    if (!Array.isArray(raw.assets)) throw new CliError(`分章 part 缺少 assets 数组：${path}`);
    const meta = isRecord(raw.meta) ? raw.meta : {};
    const volume = typeof meta.volume === 'string' ? meta.volume.trim() : '';
    if (volume === '') throw new CliError(`分章 part 的 meta.volume 缺失或不是字符串：${path}`);
    const chapter = typeof meta.chapter === 'string' ? meta.chapter.trim() : '';
    parts.push({ path, raw, volume, chapter, assets: raw.assets as AssetEntry[] });
  }
  if (parts.length === 0) throw new CliError(`--parts 里没有可处理的分章 part：${input}`);
  return parts;
}

const geometryCache = new Map<string, VolumeGeometry>();

function loadGeometry(slug: string): VolumeGeometry {
  const cached = geometryCache.get(slug);
  if (cached) return cached;

  const path = join(SUK, 'pages', slug, 'geometry.json');
  const raw = readJsonFile(path, '页面几何');
  if (!isRecord(raw)) throw new CliError(`geometry.json 必须是 JSON 对象：${path}`);
  const dpi = raw.dpi;
  const pdf = raw.pdf;
  if (typeof dpi !== 'number' || !Number.isFinite(dpi) || dpi <= 0) {
    throw new CliError(`geometry.json 的 dpi 不合法：${path}`);
  }
  if (typeof pdf !== 'string' || pdf.trim() === '') throw new CliError(`geometry.json 的 pdf 缺失：${path}`);
  if (!Array.isArray(raw.pages)) throw new CliError(`geometry.json 的 pages 不是数组：${path}`);

  const pages: PageGeometry[] = [];
  for (const [index, item] of raw.pages.entries()) {
    if (!isRecord(item)) throw new CliError(`geometry.json 的 pages[${index}] 不是对象：${path}`);
    const page = item.pdfPage;
    const rendered = item.rendered;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw new CliError(`geometry.json 的 pages[${index}].pdfPage 不合法：${path}`);
    }
    if (!isRecord(rendered) || typeof rendered.width !== 'number' || typeof rendered.height !== 'number') {
      throw new CliError(`geometry.json 的 pages[${index}].rendered 不合法：${path}`);
    }
    pages.push({
      pdfPage: page,
      rotate: typeof item.rotate === 'number' ? item.rotate : 0,
      mediaBox: isRecord(item.mediaBox) ? (item.mediaBox as unknown as PdfBox) : { x0: 0, y0: 0, x1: 0, y1: 0 },
      ...(isRecord(item.cropBox) ? { cropBox: item.cropBox as unknown as PdfBox } : {}),
      rendered: { width: rendered.width, height: rendered.height },
    });
  }

  const geometry: VolumeGeometry = {
    volume: slug,
    pdf,
    dpi,
    pdfPageCount: typeof raw.pdfPageCount === 'number' ? raw.pdfPageCount : pages.length,
    pages,
  };
  geometryCache.set(slug, geometry);
  return geometry;
}

/**
 * geometry.json 的 `rendered` 是 geometry.dpi 下的整页像素尺寸。
 * 换成别的 dpi 时必须等比缩放，否则 `regionToPixels` 算出来的框会整体偏移。
 */
function renderedAt(rendered: RenderedSize, fromDpi: number, toDpi: number): RenderedSize {
  if (fromDpi === toDpi) return rendered;
  const scale = toDpi / fromDpi;
  return {
    width: Math.max(1, Math.round(rendered.width * scale)),
    height: Math.max(1, Math.round(rendered.height * scale)),
  };
}

function cropWithPdftoppm(
  pdfPath: string,
  dpi: number,
  pdfPage: number,
  rect: { left: number; top: number; width: number; height: number },
  prefix: string,
): { path: string; buffer: Buffer } {
  try {
    execFileSync(
      'pdftoppm',
      [
        '-r',
        String(dpi),
        '-f',
        String(pdfPage),
        '-l',
        String(pdfPage),
        '-x',
        String(rect.left),
        '-y',
        String(rect.top),
        '-W',
        String(rect.width),
        '-H',
        String(rect.height),
        '-png',
        '-cropbox',
        '-singlefile',
        pdfPath,
        prefix,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(
      `pdftoppm 失败${stderr ? `：${stderr.split('\n').at(-1)}` : `（${String(error)}）`}`,
      { cause: error },
    );
  }

  const produced = `${prefix}.png`;
  if (!existsSync(produced)) throw new Error('pdftoppm 退出码为 0 但没产出 PNG');
  return { path: produced, buffer: readFileSync(produced) };
}

function reviewDirFor(part: LoadedPart): string {
  const suffix = part.chapter.replace(/^phy-/, '') || part.volume;
  return join(SUK, 'review', suffix);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderReviewHtml(entries: ReviewEntry[]): string {
  const sorted = [...entries].sort((left, right) => sortByCodePoint(left.assetId, right.assetId));
  const totalBytes = sorted.reduce((sum, entry) => sum + entry.bytes, 0);
  const cards = sorted
    .map((entry) => {
      const pageLink = `p${String(entry.pdfPage).padStart(4, '0')}.html`;
      return [
        '    <figure class="card">',
        `      <a class="frame" href="${escapeHtml(pageLink)}" title="打开第 ${entry.pdfPage} 页的 bbox 核对图">`,
        `        <img src="${escapeHtml(`../../${entry.relPath}`)}" width="${entry.width}" height="${entry.height}" alt="${escapeHtml(entry.alt || entry.caption)}" loading="lazy">`,
        '      </a>',
        '      <figcaption>',
        `        <code>${escapeHtml(entry.assetId)}</code>`,
        `        <span class="cap">${escapeHtml(entry.caption || '（无图注）')}</span>`,
        `        <span class="meta">pdfPage ${entry.pdfPage} · ${entry.width}×${entry.height} px · ${escapeHtml(formatBytes(entry.bytes))}</span>`,
        '      </figcaption>',
        '    </figure>',
      ].join('\n');
    })
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>裁图核对 · ${escapeHtml(sorted[0]?.volume ?? '')}</title>
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
    max-width: 1400px;
    margin: 0 auto 18px;
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
  main {
    max-width: 1400px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
  .card {
    margin: 0;
    padding: 10px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .frame {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    padding: 6px;
    border: 1px dashed #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
  }
  .frame img { max-width: 100%; height: auto; display: block; }
  .frame:hover { border-color: #2563eb; }
  figcaption { display: flex; flex-direction: column; gap: 2px; }
  figcaption code { font-size: 12px; color: #1d4ed8; overflow-wrap: anywhere; }
  .cap { font-size: 13px; }
  .meta { font-size: 12px; color: #6b7280; }
</style>
</head>
<body>
<header class="bar">
  <strong>裁图核对 · ${escapeHtml(sorted[0]?.volume ?? '')}</strong>
  <span>${sorted.length} 张 · ${escapeHtml(formatBytes(totalBytes))}</span>
  <span>点图打开该页整页 bbox 核对图；对照看有没有裁歪、有没有把相邻内容吃进来</span>
</header>
<main>
${cards}
</main>
</body>
</html>
`;
}

function main(): number {
  const started = Date.now();
  const options = parseOptions(process.argv.slice(2));
  if (options === 'help') {
    console.log(USAGE);
    return EXIT_OK;
  }

  const parts = loadParts(options.parts);
  const counters: Counters = { cropped: 0, skipped: 0, failed: 0, croppedBytes: 0, sizes: [] };
  const failures: Array<{ assetId: string; reason: string }> = [];
  const review = new Map<string, ReviewEntry[]>();
  const tempDirs = new Set<string>();
  let dirtyParts = 0;

  try {
    for (const part of parts) {
      const geometry = loadGeometry(part.volume);
      const geometryDpi = geometry.dpi;
      const dpi = options.dpi ?? geometryDpi;
      const pdfPath = join(SUK, 'raw', geometry.pdf);
      if (!existsSync(pdfPath)) throw new CliError(`找不到 PDF：${pdfPath}（geometry.json 的 pdf 字段）`);

      console.log('');
      console.log(`part ${part.path}`);
      console.log(
        `  册 ${part.volume} · 章 ${part.chapter || '—'} · 资源 ${part.assets.length} 条 · geometry dpi ${geometryDpi} → 裁图 dpi ${dpi}${options.dryRun ? ' · dry-run' : ''}${options.force ? ' · force' : ''}`,
      );

      const entries = review.get(reviewDirFor(part)) ?? [];
      let partDirty = false;

      for (const asset of part.assets) {
        const id = typeof asset.id === 'string' ? asset.id.trim() : '';
        const label = id || '(缺 id)';

        const outcome = processAsset({
          asset,
          id,
          geometry,
          geometryDpi,
          dpi,
          pdfPath,
          options,
          tempDirs,
        });

        if (outcome.status === 'failed') {
          counters.failed += 1;
          failures.push({ assetId: label, reason: outcome.reason });
          console.log(`  ✗ ${label}：${outcome.reason}`);
          continue;
        }

        if (outcome.status === 'cropped') {
          counters.cropped += 1;
          counters.croppedBytes += outcome.bytes;
          partDirty = true;
        } else {
          counters.skipped += 1;
        }
        counters.sizes.push({ label, width: outcome.width, height: outcome.height, bytes: outcome.bytes });

        const verb = outcome.status === 'cropped' ? (options.dryRun ? '· 计划裁剪' : '✓ 裁剪') : '- 跳过';
        console.log(
          `  ${verb} ${label}  p${String(asset.pdfPage).padStart(3, '0')}  ${outcome.width}×${outcome.height}  ${formatBytes(outcome.bytes)}`,
        );

        // 核对图只收磁盘上真实存在的图（dry-run 时可能还没裁）
        if (existsSync(join(SUK, `assets/${part.volume}/${label}.png`)) || outcome.status === 'cropped') {
          entries.push({
            volume: part.volume,
            assetId: label,
            caption: typeof asset.caption === 'string' ? asset.caption : '',
            alt: typeof asset.alt === 'string' ? asset.alt : '',
            pdfPage: typeof asset.pdfPage === 'number' ? asset.pdfPage : 0,
            width: outcome.width,
            height: outcome.height,
            bytes: outcome.bytes,
            relPath: `assets/${part.volume}/${label}.png`,
          });
        }
      }

      review.set(reviewDirFor(part), entries);

      if (partDirty && !options.dryRun) {
        writeJsonFile(part.path, part.raw);
        dirtyParts += 1;
        console.log(`  → 已回填 ${part.path}`);
      }
  }

  } finally {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  }

  // ---- 核对图 ----
  for (const [dir, entries] of review) {
    if (options.dryRun) continue;
    if (entries.length === 0) continue;
    const html = renderReviewHtml(entries);
    const htmlPath = join(dir, 'figures.html');
    const previous = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : null;
    if (previous === html) {
      console.log(`核对图未变化：${htmlPath}`);
    } else {
      mkdirSync(dir, { recursive: true });
      writeFileSync(htmlPath, html);
      console.log(`核对图已写入：${htmlPath}（${entries.length} 张）`);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log('');
  const cropVerb = options.dryRun ? '计划裁剪' : '裁剪';
  const wrote = options.dryRun ? '' : `   本次写出 ${formatBytes(counters.croppedBytes)}`;
  console.log(
    `${cropVerb} ${counters.cropped} / 跳过 ${counters.skipped} / 失败 ${counters.failed}${wrote}   耗时 ${elapsed}s`,
  );
  if (counters.sizes.length > 0) {
    const byArea = [...counters.sizes].sort((left, right) => right.width * right.height - left.width * left.height);
    const largest = byArea[0];
    const smallest = byArea.at(-1)!;
    console.log(
      `尺寸：最大 ${largest.width}×${largest.height}（${largest.label}） 最小 ${smallest.width}×${smallest.height}（${smallest.label}）`,
    );
  }
  if (dirtyParts > 0) console.log(`回填了 ${dirtyParts} 个 part 文件`);

  if (failures.length > 0) {
    console.error('');
    console.error(`失败清单（${failures.length}）：`);
    for (const failure of failures) console.error(`  ${failure.assetId}：${failure.reason}`);
    return EXIT_ISSUES;
  }
  return EXIT_OK;
}

interface ProcessContext {
  asset: AssetEntry;
  id: string;
  geometry: VolumeGeometry;
  geometryDpi: number;
  dpi: number;
  pdfPath: string;
  options: Options;
  tempDirs: Set<string>;
}

function processAsset(context: ProcessContext): AssetOutcome {
  const { asset, id, geometry, geometryDpi, dpi, pdfPath, options } = context;

  if (id === '') return { status: 'failed', reason: '资源条目缺 id' };
  if (!ASSET_ID_RE.test(id)) {
    return { status: 'failed', reason: `assetId「${id}」只能包含字母、数字、下划线、点和连字符` };
  }

  const pdfPage = asset.pdfPage;
  if (typeof pdfPage !== 'number' || !Number.isInteger(pdfPage) || pdfPage < 1) {
    return { status: 'failed', reason: `pdfPage 不是正整数（${String(pdfPage)}）` };
  }

  if (asset.region === undefined) {
    const reason = typeof asset.regionOmittedReason === 'string' && asset.regionOmittedReason.trim() !== ''
      ? asset.regionOmittedReason.trim()
      : '缺 region';
    return { status: 'failed', reason: `没有坐标，无法裁图：${reason}` };
  }

  const problem = regionProblem(asset.region);
  if (problem) return { status: 'failed', reason: `region 不合法，拒绝裁剪：${problem}` };

  const page = geometry.pages.find((item) => item.pdfPage === pdfPage);
  if (!page) {
    return {
      status: 'failed',
      reason: `geometry.json 里没有第 ${pdfPage} 页（先跑 bun run render:pages --volume ${geometry.volume} --from ${pdfPage} --to ${pdfPage}）`,
    };
  }

  let rect: { left: number; top: number; width: number; height: number };
  try {
    rect = regionToPixels(asset.region as Region, renderedAt(page.rendered, geometryDpi, dpi));
  } catch (error) {
    return { status: 'failed', reason: `坐标换算失败：${error instanceof Error ? error.message : String(error)}` };
  }

  const relPath = `assets/${geometry.volume}/${id}.png`;
  const target = join(SUK, relPath);
  const existing = existsSync(target) && statSync(target).isFile() ? statSync(target) : null;

  // 幂等：字段齐全 + 文件在 + sha256 / 字节数 / PNG 尺寸都对得上 → 跳过
  if (!options.force && typeof asset.sha256 === 'string' && existing) {
    const problems: string[] = [];
    if (asset.mimeType !== 'image/png') problems.push(`mimeType 记录为 ${String(asset.mimeType)}`);
    if (asset.path !== relPath) problems.push(`path 记录为 ${String(asset.path)}`);
    const png = readPngSize(target);
    if (!png) problems.push('现有 PNG 读不出 IHDR');
    else if (png.width !== rect.width || png.height !== rect.height) {
      problems.push(`现有 PNG ${png.width}×${png.height} 与 region 换算的 ${rect.width}×${rect.height} 不一致`);
    }
    if (asset.byteLength !== existing.size) problems.push('byteLength 与磁盘文件不一致');
    const fileSha = sha256Of(readFileSync(target));
    if (fileSha !== asset.sha256) problems.push('sha256 与磁盘文件不一致');

    if (problems.length === 0) {
      return { status: 'skipped', width: rect.width, height: rect.height, bytes: existing.size };
    }
    console.warn(`  ! ${id} 已有图但${problems.join('；')}，重新裁剪`);
  }

  if (options.dryRun) {
    return { status: 'cropped', width: rect.width, height: rect.height, bytes: existing?.size ?? 0 };
  }

  const assetsDir = dirname(target);
  mkdirSync(assetsDir, { recursive: true });
  tempCounter += 1;
  const tmpDir = join(assetsDir, `.tmp-crop-${process.pid}-${tempCounter}`);
  mkdirSync(tmpDir, { recursive: true });
  context.tempDirs.add(tmpDir);

  let produced: { path: string; buffer: Buffer };
  try {
    produced = cropWithPdftoppm(pdfPath, dpi, pdfPage, rect, join(tmpDir, id));
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }

  const png = readPngSize(produced.path);
  if (!png) return { status: 'failed', reason: '产出的 PNG 读不出 IHDR（文件损坏）' };
  if (png.width !== rect.width || png.height !== rect.height) {
    return {
      status: 'failed',
      reason: `产出尺寸 ${png.width}×${png.height} 与请求的 ${rect.width}×${rect.height} 不一致`,
    };
  }

  renameSync(produced.path, target);
  const sha256 = sha256Of(produced.buffer);
  asset.path = relPath;
  asset.mimeType = 'image/png';
  asset.byteLength = produced.buffer.length;
  asset.sha256 = sha256;

  return { status: 'cropped', width: png.width, height: png.height, bytes: produced.buffer.length };
}

try {
  process.exitCode = main();
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = error.exitCode;
}
