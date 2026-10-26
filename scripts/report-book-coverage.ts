/**
 * 覆盖率报告：`bun run scripts/report-book-coverage.ts --parts <目录> --expected <目录> [--out <report.md>]`
 *
 * 两张表分开（§0.3 硬要求）：
 * 1. 结构覆盖率（mapped / exception / missing / duplicate / undecided 六项分开）；
 * 2. 视觉复核状态（读 `local-textbook/sukey/review/<vol>-<ch>.json`，缺省 unreviewed）。
 * 两者禁止合并成一个「完成度」。
 *
 * 退出码：0 全绿；1 有 missing、有 part 解析不过或缺清单；2 参数 / 读文件失败。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  asExpectedManifest,
  CliError,
  coverageLine,
  EXIT_ISSUES,
  EXIT_OK,
  formatRate,
  optionalString,
  parseCliArgs,
  listJsonFiles,
  readJsonFile,
  readPartDir,
  requireString,
  sortByCodePoint,
} from '../src/lib/cli-args';
import { BookPartSchema, coverageOf, type BookPart, type ExpectedManifest, type PartCoverage } from '../src/lib/book-part';

const USAGE = [
  '用法：bun run scripts/report-book-coverage.ts --parts <目录> --expected <目录> [--out <report.md>]',
  '       [--review <目录>]',
  '',
  '  --parts <dir>     分章 part 目录（读 *.json，跳过 *.report.*）',
  '  --expected <dir>  Pass 1 清单目录（按 chapter 与 part 配对）',
  '  --out <file>      同时写一份 Markdown 报告（仍然打印到 stdout）',
  '  --review <dir>    视觉复核状态目录，默认 local-textbook/sukey/review',
  '',
  '退出码：0 全绿 · 1 有 missing / part 解析失败 / 缺清单 · 2 参数或读文件失败',
].join('\n');

const REVIEW_STATUSES = ['unreviewed', 'spot-checked', 'fully-reviewed'] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const DEFAULT_REVIEW_DIR = 'local-textbook/sukey/review';

interface ReviewState {
  status: ReviewStatus;
  spots: string[];
}

interface Row {
  chapter: string;
  partPath: string;
  coverage: PartCoverage | null;
  /** 拿不到覆盖率时的原因（解析失败 / 缺清单），写进报告，不吞掉 */
  problem?: string;
}

function loadManifests(dir: string): Map<string, ExpectedManifest> {
  const files = listJsonFiles(dir, '清单目录');
  if (files.length === 0) {
    throw new CliError(`清单目录里没有 *.json：${dir}`);
  }
  const byChapter = new Map<string, ExpectedManifest>();
  for (const path of files) {
    const raw = readJsonFile(path, '清单');
    // 同一个目录里也可能放着分章 part 或 book.json（冒烟测试就这么用），没 items 的直接跳过
    if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as Record<string, unknown>).items)) {
      console.error(`跳过 ${path}：不是 Pass 1 清单（没有 items 数组）`);
      continue;
    }
    const manifest = asExpectedManifest(raw, path);
    if (!manifest.chapter) continue;
    byChapter.set(manifest.chapter, manifest);
  }
  if (byChapter.size === 0) {
    throw new CliError(`清单目录里没有可用的清单（都要带 chapter 和 items）：${dir}`);
  }
  return byChapter;
}

function chapterLabelOf(part: BookPart): string {
  const prefix = `phy-${part.meta.volume}-`;
  return part.meta.chapter.startsWith(prefix) ? part.meta.chapter.slice(prefix.length) : part.meta.chapter;
}

function readReview(reviewDir: string, part: BookPart): ReviewState {
  const path = join(reviewDir, `${part.meta.volume}-${chapterLabelOf(part)}.json`);
  if (!existsSync(path)) return { status: 'unreviewed', spots: [] };
  const raw = readJsonFile(path, '视觉复核记录');
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const status = source.status;
  if (typeof status !== 'string' || !(REVIEW_STATUSES as readonly string[]).includes(status)) {
    console.error(`复核记录 ${path} 的 status 不认识（${String(status)}），按 unreviewed 处理。`);
    return { status: 'unreviewed', spots: [] };
  }
  const spots = Array.isArray(source.spots) ? source.spots.filter((item): item is string => typeof item === 'string') : [];
  return { status: status as ReviewStatus, spots };
}

function tableRow(cells: ReadonlyArray<string | number>): string {
  return `| ${cells.join(' | ')} |`;
}

function metaTextOf(raw: unknown, key: string): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const meta = (raw as Record<string, unknown>).meta;
  if (typeof meta !== 'object' || meta === null) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function buildReport(rows: Row[], reviews: Map<string, ReviewState>, reviewDir: string): string {
  const lines: string[] = [];
  lines.push('# 结构覆盖率与视觉复核状态');
  lines.push('');
  lines.push('> 本文件由 `scripts/report-book-coverage.ts` 生成，数字来自 `coverageOf`，不要手改。');
  lines.push('> 结构与视觉复核是**两个独立指标**（规约 §0.3）：结构覆盖率 100% 不代表视觉复核完成。');
  lines.push('');

  // ---- 表 1：结构覆盖率 ----
  lines.push('## 1. 结构覆盖率');
  lines.push('');
  lines.push('分子只算 `mapped + exception`；`missing` / `duplicate` / `undecided` 单列，不并进「完成度」。');
  lines.push('');
  lines.push(
    tableRow(['章', 'total', 'mapped', 'exception', 'missing', 'duplicate', 'undecided', '结构覆盖率']),
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');

  let total = 0;
  let mapped = 0;
  let exception = 0;
  let missing = 0;
  let duplicate = 0;
  let undecided = 0;
  const missingLines: string[] = [];

  for (const row of rows) {
    const coverage = row.coverage;
    if (!coverage) {
      lines.push(tableRow([row.chapter, '—', '—', '—', '—', '—', '—', row.problem ?? '无数据']));
      continue;
    }
    total += coverage.total;
    mapped += coverage.mapped;
    exception += coverage.exception;
    missing += coverage.missing;
    duplicate += coverage.duplicate;
    undecided += coverage.undecided;
    lines.push(
      tableRow([
        row.chapter,
        coverage.total,
        coverage.mapped,
        coverage.exception,
        coverage.missing,
        coverage.duplicate,
        coverage.undecided,
        formatRate(coverage.mapped + coverage.exception, coverage.total),
      ]),
    );
    for (const srcId of coverage.missingSrcIds) missingLines.push(`- ${row.chapter}：${srcId}`);
  }

  lines.push(
    tableRow(['**全书**', total, mapped, exception, missing, duplicate, undecided, formatRate(mapped + exception, total)]),
  );
  lines.push('');

  // ---- 表 2：视觉复核 ----
  lines.push('## 2. 视觉复核状态');
  lines.push('');
  lines.push(`复核记录目录：\`${reviewDir}/<vol>-<ch>.json\`；没有记录一律按 \`unreviewed\` 计。`);
  lines.push('');
  lines.push(tableRow(['章', 'status', 'spots（抽查页）']));
  lines.push('|---|---|---|');

  let unreviewed = 0;
  let spotChecked = 0;
  let fullyReviewed = 0;
  for (const row of rows) {
    const review = reviews.get(row.chapter) ?? { status: 'unreviewed' as ReviewStatus, spots: [] };
    if (review.status === 'unreviewed') unreviewed += 1;
    else if (review.status === 'spot-checked') spotChecked += 1;
    else fullyReviewed += 1;
    lines.push(tableRow([row.chapter, review.status, review.spots.length > 0 ? review.spots.join(', ') : '—']));
  }
  lines.push('');

  // ---- 汇总 ----
  lines.push('## 3. 汇总');
  lines.push('');
  lines.push(`- 全书 total：${total}`);
  lines.push(`- 已映射 + 例外：${mapped + exception}/${total} (${formatRate(mapped + exception, total)})`);
  lines.push(`- missing：${missing}（另有 duplicate ${duplicate}、undecided ${undecided}）`);
  lines.push(
    `- 未复核章数：${unreviewed} / ${rows.length} 章（spot-checked ${spotChecked}，fully-reviewed ${fullyReviewed}）`,
  );
  if (rows.length > 0) lines.push(`- 按 part：${rows.map((row) => row.chapter).join('、')}`);
  lines.push('');

  if (missingLines.length > 0) {
    lines.push('### missing srcId 明细');
    lines.push('');
    lines.push(...missingLines);
    lines.push('');
  }

  return lines.join('\n');
}

function main(argv: string[]): number {
  const args = parseCliArgs(
    argv,
    { parts: { type: 'string' }, expected: { type: 'string' }, out: { type: 'string' }, review: { type: 'string' } },
    USAGE,
  );
  if (args.positionals.length > 0) {
    throw new CliError(`不接受位置参数：${args.positionals.join(' ')}\n\n${USAGE}`);
  }

  const partsDir = requireString(args, 'parts', USAGE);
  const expectedDir = requireString(args, 'expected', USAGE);
  const outPath = optionalString(args, 'out');
  const reviewDir = optionalString(args, 'review') ?? DEFAULT_REVIEW_DIR;

  const manifests = loadManifests(expectedDir);
  const partFiles = readPartDir(partsDir);
  if (partFiles.length === 0) {
    throw new CliError(`目录里没有分章 part：${partsDir}`);
  }

  const rows: Row[] = [];
  const reviews = new Map<string, ReviewState>();
  let problems = 0;

  for (const file of partFiles) {
    const parsed = BookPartSchema.safeParse(file.raw);
    if (!parsed.success) {
      rows.push({
        chapter: metaTextOf(file.raw, 'chapter') ?? file.path,
        partPath: file.path,
        coverage: null,
        problem: 'part 解析失败',
      });
      console.error(
        `part 解析失败：${file.path}\n${parsed.error.issues
          .map((issue) => `  · ${issue.path.map((segment) => String(segment)).join('.') || '（根）'}：${issue.message}`)
          .join('\n')}`,
      );
      problems += 1;
      continue;
    }

    const part = parsed.data;
    const manifest = manifests.get(part.meta.chapter);
    reviews.set(part.meta.chapter, readReview(reviewDir, part));
    if (!manifest) {
      rows.push({
        chapter: part.meta.chapter,
        partPath: file.path,
        coverage: null,
        problem: `缺清单（${part.meta.chapter}）`,
      });
      console.error(`缺清单：${part.meta.chapter}（${file.path}）在 ${expectedDir} 里找不到对应 items。`);
      problems += 1;
      continue;
    }

    const coverage = coverageOf(part, manifest);
    rows.push({ chapter: part.meta.chapter, partPath: file.path, coverage });
    if (coverage.missing > 0 || coverage.duplicate > 0 || coverage.undecided > 0) {
      console.error(`${part.meta.chapter} ${coverageLine(coverage)}`);
    }
  }

  rows.sort((left, right) => sortByCodePoint(left.chapter, right.chapter));
  for (const row of rows) {
    if (reviews.has(row.chapter)) continue;
    // 解析失败的 part 拿不到 meta，复核状态按 unreviewed 兜底
    reviews.set(row.chapter, { status: 'unreviewed', spots: [] });
  }

  const report = buildReport(rows, reviews, reviewDir);
  console.log(report);

  if (outPath !== undefined) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${report}\n`);
    console.log(`\n已写入：${outPath}`);
  }

  const missing = rows.reduce((sum, row) => sum + (row.coverage?.missing ?? 0), 0);
  return missing > 0 || problems > 0 ? EXIT_ISSUES : EXIT_OK;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = error.exitCode;
}
