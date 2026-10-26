/**
 * 回填插图内在尺寸：扫分章 part 的 `assets[]`，读磁盘上 PNG 的 IHDR，把 width / height 写回 JSON。
 *
 *   bun run scripts/backfill-asset-size.ts [--parts <目录或单个 part.json>] [--dry-run]
 *
 * - 尺寸只认磁盘上的 PNG，不从 region 反推（region 是归一化坐标，不是像素）
 * - 幂等：字段已存在且与磁盘一致就跳过；不一致的以磁盘为准改正并列出
 * - 缺图 / 读不出 IHDR 的 asset 记一笔失败，退出码 1
 *
 * 退出码：0 全部回填完成；1 有 asset 读不出尺寸；2 参数 / IO / JSON 形状问题
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CliError,
  EXIT_ISSUES,
  EXIT_OK,
  listJsonFiles,
  optionalString,
  parseCliArgs,
  readJsonFile,
  writeJsonFile,
} from '../src/lib/cli-args';
import { readPngSize } from '../src/lib/png-size';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUK = join(HERE, '..', 'local-textbook', 'sukey');
const DEFAULT_PARTS = join(SUK, 'parts');

const USAGE = `回填插图内在尺寸：读 PNG 头 → 写回 part 的 assets[].width / height

  bun run scripts/backfill-asset-size.ts [选项]

选项
  --parts <路径>  分章 part 目录（读 *.json）或单个 part 文件，默认 local-textbook/sukey/parts
  --dry-run       只看结果，不改 JSON
  -h, --help      显示本帮助

退出码：0 成功 · 1 有资源读不出尺寸 · 2 参数 / 读文件 / JSON 形状有问题`;

interface Options {
  parts: string;
  dryRun: boolean;
}

interface AssetEntry {
  id?: unknown;
  path?: unknown;
  width?: unknown;
  height?: unknown;
  [key: string]: unknown;
}

interface Counters {
  /** 新写入尺寸 */
  filled: number;
  /** 已有尺寸与磁盘不一致，按磁盘改正 */
  corrected: number;
  /** 已经一致，跳过 */
  unchanged: number;
  failures: Array<{ asset: string; part: string; reason: string }>;
}

function parseOptions(argv: string[]): Options | 'help' {
  const args = parseCliArgs(
    argv,
    {
      parts: { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    USAGE,
  );
  if (args.values.help === true) return 'help';
  const parts = optionalString(args, 'parts');
  return { parts: parts ? resolve(process.cwd(), parts) : DEFAULT_PARTS, dryRun: args.values['dry-run'] === true };
}

function partFilesOf(input: string): string[] {
  if (!existsSync(input)) throw new CliError(`找不到分章 part：${input}`);
  const stats = statSync(input);
  if (stats.isFile()) return [input];
  if (!stats.isDirectory()) throw new CliError(`--parts 必须是目录或文件：${input}`);
  return listJsonFiles(input, '分章目录');
}

function readPart(path: string): Record<string, unknown> {
  const raw = readJsonFile(path, '分章 part');
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError(`分章 part 必须是 JSON 对象：${path}`);
  }
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.assets)) {
    throw new CliError(`分章 part 缺少 assets 数组：${path}`);
  }
  return source;
}

/** asset.path 相对 local-textbook/sukey；没有 path 时按 assets/<册>/<id>.png 兜底 */
function pngPathOf(asset: AssetEntry, part: Record<string, unknown>, partPath: string): string | null {
  if (typeof asset.path === 'string' && asset.path.trim() !== '') {
    return join(SUK, asset.path);
  }
  const meta = part.meta;
  const volume =
    typeof meta === 'object' && meta !== null && typeof (meta as Record<string, unknown>).volume === 'string'
      ? ((meta as Record<string, unknown>).volume as string)
      : '';
  const id = typeof asset.id === 'string' ? asset.id : '';
  if (!volume || !id) {
    console.error(`跳过 ${partPath} 的一个 asset：缺 path，也没有 meta.volume / id 可以推算`);
    return null;
  }
  return join(SUK, 'assets', volume, `${id}.png`);
}

function main(): number {
  const options = parseOptions(process.argv.slice(2));
  if (options === 'help') {
    console.log(USAGE);
    return EXIT_OK;
  }

  const counters: Counters = { filled: 0, corrected: 0, unchanged: 0, failures: [] };
  const mismatches: Array<{ asset: string; before: string; after: string }> = [];
  let dirtyParts = 0;

  for (const partPath of partFilesOf(options.parts)) {
    const part = readPart(partPath);
    const assets = part.assets as AssetEntry[];
    let dirty = false;

    for (const asset of assets) {
      const label = typeof asset.id === 'string' && asset.id.trim() !== '' ? asset.id : '(缺 id)';
      const pngPath = pngPathOf(asset, part, partPath);
      if (!pngPath) {
        counters.failures.push({ asset: label, part: partPath, reason: '无法确定 PNG 路径' });
        continue;
      }
      if (!existsSync(pngPath)) {
        counters.failures.push({ asset: label, part: partPath, reason: `PNG 不存在：${pngPath}` });
        continue;
      }
      const size = readPngSize(readFileSync(pngPath));
      if (!size) {
        counters.failures.push({ asset: label, part: partPath, reason: `读不出 PNG 头：${pngPath}` });
        continue;
      }

      if (asset.width === size.width && asset.height === size.height) {
        counters.unchanged += 1;
        continue;
      }

      const hadSize = typeof asset.width === 'number' || typeof asset.height === 'number';
      if (hadSize) {
        counters.corrected += 1;
        mismatches.push({
          asset: label,
          before: `${String(asset.width)}×${String(asset.height)}`,
          after: `${size.width}×${size.height}`,
        });
      } else {
        counters.filled += 1;
      }
      asset.width = size.width;
      asset.height = size.height;
      dirty = true;
      if (options.dryRun) {
        const verb = hadSize ? '改正' : '回填';
        console.log(`  · 计划${verb} ${label} ${size.width}×${size.height}`);
      }
    }

    if (dirty) {
      if (!options.dryRun) {
        writeJsonFile(partPath, part);
        dirtyParts += 1;
        console.log(`  → 已写入 ${partPath}`);
      }
    }
  }

  console.log('');
  console.log(
    `回填 ${counters.filled} 个 / 改正 ${counters.corrected} 个 / 跳过 ${counters.unchanged} 个${options.dryRun ? '（dry-run，未写文件）' : ''}`,
  );
  if (dirtyParts > 0) console.log(`写入了 ${dirtyParts} 个 part 文件`);
  if (mismatches.length > 0) {
    console.log('');
    console.log(`尺寸与磁盘不一致、已按磁盘改正（${mismatches.length}）：`);
    for (const item of mismatches) console.log(`  ${item.asset}：${item.before} → ${item.after}`);
  }

  if (counters.failures.length > 0) {
    console.error('');
    console.error(`读不出尺寸（${counters.failures.length}）：`);
    for (const failure of counters.failures) {
      console.error(`  ${failure.asset}（${failure.part}）：${failure.reason}`);
    }
    return EXIT_ISSUES;
  }
  return EXIT_OK;
}

try {
  process.exitCode = main();
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = error.exitCode;
}
