/**
 * 单章校验：`bun run scripts/check-book-part.ts <part.json> [...] [--expected <expected.json>] [--json]`
 *
 * 脚本只做参数解析和 I/O；校验一律调 `validateBookPart`（内部再走
 * `BookPartSchema` / `validateGraphInvariants` / `coverageOf`），不在这里重写规则。
 *
 * 退出码：0 = 无 error（可有 warning）；1 = 有 error；2 = 参数 / 读文件失败。
 */
import {
  asExpectedManifest,
  CliError,
  coverageLine,
  EXIT_ISSUES,
  EXIT_OK,
  optionalString,
  parseCliArgs,
  readJsonFile,
} from '../src/lib/cli-args';
import { BookPartSchema, coverageOf, validateBookPart, type ExpectedManifest, type PartCoverage } from '../src/lib/book-part';
import type { ValidationIssue } from '../src/lib/validate';

const USAGE = [
  '用法：bun run scripts/check-book-part.ts <part.json> [<part2.json> ...] [--expected <expected.json>] [--json]',
  '',
  '  --expected <file>  Pass 1 冻结清单；给了才做 srcId 覆盖率检查',
  '  --json             输出机器可读结构',
  '',
  '退出码：0 无 error · 1 有 error · 2 参数或读文件失败',
].join('\n');

interface FileReport {
  path: string;
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  coverage?: PartCoverage;
}

function checkFile(path: string, expected: ExpectedManifest | undefined): FileReport {
  const raw = readJsonFile(path, '分章 part');
  const issues = validateBookPart(raw, expected);

  // 覆盖率要解析后的数据：结构不过就不算覆盖率，validateBookPart 已经报过原因
  let coverage: PartCoverage | undefined;
  if (expected) {
    const parsed = BookPartSchema.safeParse(raw);
    if (parsed.success) coverage = coverageOf(parsed.data, expected);
  }

  return {
    path,
    issues,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    ...(coverage === undefined ? {} : { coverage }),
  };
}

function formatIssue(issue: ValidationIssue): string {
  const where = issue.field
    ? ` · 字段 ${issue.field}`
    : issue.nodeId
      ? ` · 节点 ${issue.nodeId}`
      : issue.edgeId
        ? ` · 关系 ${issue.edgeId}`
        : '';
  return `  ${issue.severity.padEnd(7)} [${issue.code}] ${issue.message}${where}`;
}

function printHuman(reports: FileReport[]): void {
  reports.forEach((report, index) => {
    console.log(`\n[${index + 1}/${reports.length}] ${report.path} — 错误 ${report.errors} · 告警 ${report.warnings}`);
    if (report.issues.length === 0) {
      console.log('  ✓ 无问题');
    }
    // 按 error / warning 分组输出（组内保持库返回的顺序）
    const ordered = [
      ...report.issues.filter((issue) => issue.severity === 'error'),
      ...report.issues.filter((issue) => issue.severity !== 'error'),
    ];
    for (const issue of ordered) console.log(formatIssue(issue));
    if (report.coverage) {
      console.log(`  ${coverageLine(report.coverage)}`);
      if (report.coverage.missingSrcIds.length > 0) {
        for (const srcId of report.coverage.missingSrcIds) console.log(`  missing srcId: ${srcId}`);
      }
    }
  });

  const errors = reports.reduce((sum, report) => sum + report.errors, 0);
  const warnings = reports.reduce((sum, report) => sum + report.warnings, 0);
  console.log(`\n合计 ${reports.length} 个 part · 错误 ${errors} · 告警 ${warnings} → ${errors > 0 ? '不通过' : '通过'}`);
}

function printJson(reports: FileReport[]): void {
  const single = reports.length === 1 ? reports[0] : undefined;
  const payload = {
    files: reports.map((report) => ({
      path: report.path,
      issues: report.issues,
      errors: report.errors,
      warnings: report.warnings,
      ...(report.coverage === undefined ? {} : { coverage: report.coverage }),
    })),
    summary: {
      files: reports.length,
      errors: reports.reduce((sum, report) => sum + report.errors, 0),
      warnings: reports.reduce((sum, report) => sum + report.warnings, 0),
    },
    // 多个 part 共用一个清单时，六项计数不可相加（同一份分母会被重复计算），只在单文件时给顶层 coverage
    ...(single?.coverage === undefined ? {} : { coverage: single.coverage }),
  };
  console.log(JSON.stringify(payload, null, 2));
}

function main(argv: string[]): number {
  const args = parseCliArgs(argv, { expected: { type: 'string' }, json: { type: 'boolean' } }, USAGE);
  if (args.positionals.length === 0) {
    throw new CliError(`至少要给一个 part 文件。\n\n${USAGE}`);
  }
  const expectedPath = optionalString(args, 'expected');
  const expected =
    expectedPath === undefined ? undefined : asExpectedManifest(readJsonFile(expectedPath, '清单'), expectedPath);
  const reports = args.positionals.map((path) => checkFile(path, expected));

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
