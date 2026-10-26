/**
 * Pass 1 清单校验：`bun run scripts/check-expected.ts <expected.json> [...] [--json] [--stats]`
 *
 * 脚本只做参数解析和 I/O；规则一律来自 `validateExpectedManifest`，统计来自
 * `expectedManifestStats`，不在这里重写一条。清单是覆盖率的分母，没有 error 才进 Pass 2。
 *
 * 退出码：0 = 无 error（可有 warning）；1 = 有 error；2 = 参数 / 读文件失败。
 */
import {
  CliError,
  EXIT_ISSUES,
  EXIT_OK,
  parseCliArgs,
  readJsonFile,
} from '../src/lib/cli-args';
import {
  expectedManifestStats,
  validateExpectedManifest,
  type ExpectedManifestIssue,
  type ExpectedManifestStats,
} from '../src/lib/book-part';

const USAGE = [
  '用法：bun run scripts/check-expected.ts <expected.json> [<expected2.json> ...] [--json] [--stats]',
  '',
  '  --stats  额外打印条目数、kind 分布、按页分布、region 覆盖、overlaps / parentSrcId 计数',
  '  --json   输出机器可读结构',
  '',
  '退出码：0 无 error（可有 warning）· 1 有 error · 2 参数或读文件失败',
].join('\n');

interface FileReport {
  path: string;
  issues: ExpectedManifestIssue[];
  errors: number;
  warnings: number;
  stats?: ExpectedManifestStats;
}

function checkFile(path: string, withStats: boolean): FileReport {
  const raw = readJsonFile(path, '清单');
  const issues = validateExpectedManifest(raw);
  return {
    path,
    issues,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    ...(withStats ? { stats: expectedManifestStats(raw) } : {}),
  };
}

function formatIssue(issue: ExpectedManifestIssue): string {
  const where = [
    issue.srcId === undefined ? '' : ` · 条目 ${issue.srcId}`,
    issue.path === undefined ? '' : ` · 字段 ${issue.path}`,
  ].join('');
  return `  ${issue.severity.padEnd(7)} [${issue.code}] ${issue.message}${where}`;
}

/** `--stats` 的三行：总量与坐标覆盖 / kind 分布 / 页分布 */
function statsLines(stats: ExpectedManifestStats): string[] {
  const kinds = stats.kinds.map((entry) => `${entry.kind} ${entry.count}`).join(' · ');
  const pages = stats.pages.map((entry) => `${entry.pdfPage}:${entry.count}`).join(' · ');
  return [
    `  条目 ${stats.total} · 有 region ${stats.withRegion} · 只有 regionOmittedReason ${stats.reasonOnly} · overlaps ${stats.overlapPairs} 对 · parentSrcId ${stats.parentLinks} 条`,
    `  按 kind：${kinds === '' ? '（无）' : kinds}`,
    `  按页：${pages === '' ? '（无）' : pages}`,
  ];
}

function printHuman(reports: FileReport[]): void {
  reports.forEach((report, index) => {
    console.log(`\n[${index + 1}/${reports.length}] ${report.path} — 错误 ${report.errors} · 告警 ${report.warnings}`);
    if (report.issues.length === 0) console.log('  ✓ 无问题');
    // 按 error / warning 分组输出（组内保持库返回的顺序）
    const ordered = [
      ...report.issues.filter((issue) => issue.severity === 'error'),
      ...report.issues.filter((issue) => issue.severity !== 'error'),
    ];
    for (const issue of ordered) console.log(formatIssue(issue));
    if (report.stats) {
      for (const line of statsLines(report.stats)) console.log(line);
    }
  });

  const errors = reports.reduce((sum, report) => sum + report.errors, 0);
  const warnings = reports.reduce((sum, report) => sum + report.warnings, 0);
  console.log(
    `\n合计 ${reports.length} 个清单 · 错误 ${errors} · 告警 ${warnings} → ${errors > 0 ? '不通过' : '通过'}`,
  );
}

function printJson(reports: FileReport[]): void {
  const payload = {
    files: reports.map((report) => ({
      path: report.path,
      issues: report.issues,
      errors: report.errors,
      warnings: report.warnings,
      ...(report.stats === undefined ? {} : { stats: report.stats }),
    })),
    summary: {
      files: reports.length,
      errors: reports.reduce((sum, report) => sum + report.errors, 0),
      warnings: reports.reduce((sum, report) => sum + report.warnings, 0),
    },
  };
  console.log(JSON.stringify(payload, null, 2));
}

function main(argv: string[]): number {
  const args = parseCliArgs(argv, { json: { type: 'boolean' }, stats: { type: 'boolean' } }, USAGE);
  if (args.positionals.length === 0) {
    throw new CliError(`至少要给一个清单文件。\n\n${USAGE}`);
  }
  const reports = args.positionals.map((path) => checkFile(path, args.values.stats === true));

  if (args.values.json === true) printJson(reports);
  else printHuman(reports);

  return reports.some((report) => report.errors > 0) ? EXIT_ISSUES : EXIT_OK;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = error.exitCode;
}
