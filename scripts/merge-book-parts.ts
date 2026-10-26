/**
 * 合并：`bun run scripts/merge-book-parts.ts --parts <目录> --book <book.json> --out <out.json>
 *        [--entities <entities.json>] [--page-offset <n>]`
 *
 * 脚本只做参数解析和 I/O：合并顺序、order / 时间戳 / 边与步骤 id / anchors 全由
 * `mergeBookParts` 生成，产物再用 `validateGraphInvariants` 复核一遍。
 *
 * 退出码：0 合并成功；1 有 part 校验不过（拒绝合并）或产物不过不变式（不写文件）；
 *        2 参数 / 读文件 / book 或 entities 文件形状不合法。
 */
import {
  asEntityRegistry,
  CliError,
  EXIT_ISSUES,
  EXIT_OK,
  optionalInteger,
  optionalString,
  parseCliArgs,
  readJsonFile,
  readPartDir,
  requireString,
  writeJsonFile,
} from '../src/lib/cli-args';
import { BookPartSchema, mergeBookParts, validateBookPart, type EntityEntry } from '../src/lib/book-part';
import { bookMetaV9Schema } from '../src/lib/schema';
import { validateGraphInvariants, type ValidationIssue } from '../src/lib/validate';

const USAGE = [
  '用法：bun run scripts/merge-book-parts.ts --parts <目录> --book <book.json> --out <out.json>',
  '       [--entities <entities.json>] [--page-offset <n>]',
  '',
  '  --parts <dir>        分章 part 目录（读 *.json，跳过 *.report.*）',
  '  --book <file>        教材元信息（v9 book，必填 subject / stage / title）',
  '  --out <file>         合并后的 v9 图',
  '  --entities <file>    跨册实体注册表；合并后写回同一路径',
  '  --page-offset <n>    印刷页码偏移（manifest.json 的 pageOffset.offset）',
  '',
  '退出码：0 成功 · 1 校验不通过 · 2 参数或读文件失败',
].join('\n');

function describeProblem(issue: ValidationIssue): string {
  const where = issue.field ? ` · 字段 ${issue.field}` : issue.nodeId ? ` · 节点 ${issue.nodeId}` : '';
  return `  ${issue.severity.padEnd(7)} [${issue.code}] ${issue.message}${where}`;
}

function zodIssuesText(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map((issue) => `  · ${issue.path.length > 0 ? issue.path.map((segment) => String(segment)).join('.') : '（根）'}：${issue.message}`)
    .join('\n');
}

function main(argv: string[]): number {
  const args = parseCliArgs(
    argv,
    {
      parts: { type: 'string' },
      book: { type: 'string' },
      out: { type: 'string' },
      entities: { type: 'string' },
      'page-offset': { type: 'string' },
    },
    USAGE,
  );
  if (args.positionals.length > 0) {
    throw new CliError(`不接受位置参数：${args.positionals.join(' ')}\n\n${USAGE}`);
  }

  const partsDir = requireString(args, 'parts', USAGE);
  const bookPath = requireString(args, 'book', USAGE);
  const outPath = requireString(args, 'out', USAGE);
  const entitiesPath = optionalString(args, 'entities');
  const pageOffset = optionalInteger(args, 'page-offset');

  const bookParsed = bookMetaV9Schema.safeParse(readJsonFile(bookPath, '教材元信息'));
  if (!bookParsed.success) {
    throw new CliError(`教材元信息不合 v9 schema：${bookPath}\n${zodIssuesText(bookParsed.error.issues)}`);
  }

  let entities: EntityEntry[] | undefined;
  if (entitiesPath !== undefined) {
    entities = asEntityRegistry(readJsonFile(entitiesPath, '实体注册表'), entitiesPath);
  }

  const files = readPartDir(partsDir);
  if (files.length === 0) {
    throw new CliError(`目录里没有可合并的分章 part：${partsDir}`);
  }

  // 1) 先逐份单章校验，任何一份有 error 就整体拒绝
  let rejected = false;
  console.log(`待合并 ${files.length} 个 part：`);
  for (const file of files) {
    const issues = validateBookPart(file.raw);
    const errors = issues.filter((issue) => issue.severity === 'error');
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    console.log(`\n[${file.path}] 错误 ${errors.length} · 告警 ${warnings.length}`);
    for (const issue of issues) console.log(describeProblem(issue));
    if (errors.length > 0) rejected = true;
  }
  if (rejected) {
    console.error('\n拒绝合并：上面的 part 有 error。先修到 `check:part` 全绿再合（§0.1.10）。');
    return EXIT_ISSUES;
  }

  // 2) 校验过了才解析，形状由 BookPartSchema 钉死
  const parts = files.map((file) => {
    const parsed = BookPartSchema.safeParse(file.raw);
    if (!parsed.success) {
      throw new CliError(`part 通过校验却解析失败（不应发生）：${file.path}\n${zodIssuesText(parsed.error.issues)}`);
    }
    return parsed.data;
  });

  // 3) 合并（顺序 / order / 时间戳 / 边 id / anchors 全在库里）
  let result: ReturnType<typeof mergeBookParts>;
  try {
    result = mergeBookParts(parts, bookParsed.data, {
      ...(entities === undefined ? {} : { entities }),
      ...(pageOffset === undefined ? {} : { pageOffset }),
    });
  } catch (error) {
    // 库在「节点 id 跨 part 重复」「资源流水线字段没回填」这类硬错上直接 throw，消息已经是人话
    console.error(`\n拒绝合并：${error instanceof Error ? error.message : String(error)}`);
    return EXIT_ISSUES;
  }

  // 4) 产物再校验一遍，不过就不写文件
  const graphIssues = validateGraphInvariants(result.graph);
  const graphErrors = graphIssues.filter((issue) => issue.severity === 'error');
  const graphWarnings = graphIssues.filter((issue) => issue.severity === 'warning');
  if (graphIssues.length > 0) {
    console.log(`\n合并产物校验：错误 ${graphErrors.length} · 告警 ${graphWarnings.length}`);
    for (const issue of graphIssues) console.log(describeProblem(issue));
  } else {
    console.log('\n合并产物校验：通过');
  }
  if (graphErrors.length > 0) {
    console.error('\n不写文件：合并产物没有通过全图不变式。');
    return EXIT_ISSUES;
  }

  // 5) 落盘
  writeJsonFile(outPath, result.graph);
  console.log(
    [
      '',
      `合并完成：${parts.length} 个 part · ${result.graph.nodes.length} 节点 · ${result.graph.edges.length} 关系 · ` +
        `${result.graph.steps?.length ?? 0} 推理步骤 · ${result.graph.anchors.length} anchors · ${result.graph.assets.length} 资源`,
      `输出：${outPath}`,
    ].join('\n'),
  );

  if (entitiesPath !== undefined) {
    writeJsonFile(entitiesPath, result.entities);
    console.log(`实体注册表：${entitiesPath}（${result.entities.length} 条）`);
  }

  const warnings = [...result.warnings, ...graphWarnings];
  console.log(`warnings：${warnings.length}`);
  for (const warning of warnings) console.log(describeProblem(warning));

  return EXIT_OK;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exitCode = error.exitCode;
}
