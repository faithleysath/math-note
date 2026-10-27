/**
 * CLI 脚本共用的薄工具层：参数解析、读 JSON、清单 / 实体注册表的形状检查、覆盖率排版。
 *
 * 这里**不放任何校验规则**。结构、ID、父子类型、关系端点、资源闭合、覆盖率判定
 * 全部来自 `book-part.ts` / `validate.ts`；脚本只负责参数解析与 I/O。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import type { EntityEntry, ExpectedItem, ExpectedManifest, PartCoverage } from './book-part';

/** 0：通过；1：校验/覆盖率不通过；2：参数、IO 或输入文件形状问题（脚本没法继续） */
export const EXIT_OK = 0;
export const EXIT_ISSUES = 1;
export const EXIT_USAGE = 2;

export class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode: number = EXIT_USAGE) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export interface CliArgs {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
}

/** `node:util` 的 parseArgs 薄包装：未知参数 / 缺值都变成 CliError，附带用法 */
export function parseCliArgs(
  argv: string[],
  options: NonNullable<ParseArgsConfig['options']>,
  usage: string,
): CliArgs {
  try {
    const parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
    return {
      values: parsed.values as Record<string, string | boolean | undefined>,
      positionals: [...parsed.positionals],
    };
  } catch (error) {
    throw new CliError(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
  }
}

export function requireString(args: CliArgs, name: string, usage: string): string {
  const value = args.values[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError(`缺少必填参数 --${name}。\n\n${usage}`);
  }
  return value;
}

export function optionalString(args: CliArgs, name: string): string | undefined {
  const value = args.values[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError(`参数 --${name} 需要一个非空字符串。`);
  }
  return value;
}

export function optionalInteger(args: CliArgs, name: string): number | undefined {
  const value = optionalString(args, name);
  if (value === undefined) return undefined;
  if (!/^-?\d+$/.test(value.trim())) {
    throw new CliError(`参数 --${name} 需要整数，收到「${value}」。`);
  }
  return Number.parseInt(value.trim(), 10);
}

export function readJsonFile(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new CliError(`读不到${label}：${path}（${error instanceof Error ? error.message : String(error)}）`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(`${label}不是合法 JSON：${path}（${error instanceof Error ? error.message : String(error)}）`);
  }
}

/** 写格式化 JSON（2 空格缩进 + 结尾换行），目录不存在就建 */
export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Pass 1 清单：只取机械校验用得上的字段（srcId / volume / chapter），
 * 其余字段（kind / region / text / continuesOn…）留给人工看。
 */
export function asExpectedManifest(raw: unknown, path: string): ExpectedManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError(`清单必须是 JSON 对象：${path}`);
  }
  const source = raw as Record<string, unknown>;
  if (!Array.isArray(source.items)) {
    throw new CliError(`清单缺少 items 数组：${path}`);
  }
  const items: ExpectedItem[] = source.items.map((item, index) => {
    const srcId = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).srcId : undefined;
    if (typeof srcId !== 'string' || srcId.trim() === '') {
      throw new CliError(`清单 ${path} 的 items[${index}] 缺少 srcId。`);
    }
    return { srcId };
  });
  return {
    ...(typeof source.volume === 'string' ? { volume: source.volume } : {}),
    ...(typeof source.chapter === 'string' ? { chapter: source.chapter } : {}),
    items,
  };
}

/** 跨册实体注册表（§9）：形状不对就报 CliError，别让合并器拿到半个注册表 */
export function asEntityRegistry(raw: unknown, path: string): EntityEntry[] {
  // 规约 §9 的文件形状是 `{ "entities": [...] }`，但历史调用写的都是裸数组。
  // 两种都收，避免「导出脚本写出的文件，合并器读不进去」这种自相矛盾。
  const list: unknown[] | null = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { entities?: unknown }).entities)
      ? (raw as { entities: unknown[] }).entities
      : null;
  if (list === null) {
    throw new CliError(`实体注册表必须是数组，或 { "entities": [...] }：${path}`);
  }
  return list.map((entry, index) => {
    const source = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const text = (key: string) => (typeof source[key] === 'string' ? (source[key] as string) : '');
    const aliases = Array.isArray(source.aliases) ? source.aliases.filter((item) => typeof item === 'string') : [];
    if (!text('id') || !text('key')) {
      throw new CliError(`实体注册表 ${path} 的第 ${index} 条缺少 id 或 key。`);
    }
    return { id: text('id'), key: text('key'), title: text('title'), aliases, firstSeen: text('firstSeen') };
  });
}

export interface PartFile {
  path: string;
  raw: unknown;
}

/** 目录下的 `*.json`（跳过 `*.report.*`），按文件名码点排序 */
export function listJsonFiles(dir: string, label: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json') && !name.includes('.report.'));
  } catch (error) {
    throw new CliError(`读不到${label}：${dir}（${error instanceof Error ? error.message : String(error)}）`);
  }
  return names.sort(sortByCodePoint).map((name) => join(dir, name));
}

/**
 * 目录下的分章 part（跳过 `*.report.*`），按文件名码点排序。
 *
 * 同一目录里放着的清单（`items`）或 `book.json` 会被跳过并在 stderr 提示：
 * 它们没有 `meta` / `nodes`，本来就不是分章 part。真正坏掉的 part 不会被跳
 * ——只要出现了 `meta` 或 `nodes`，就交给 `BookPartSchema` 报错。
 */
export function readPartDir(dir: string): PartFile[] {
  const files: PartFile[] = [];
  for (const path of listJsonFiles(dir, '分章目录')) {
    const raw = readJsonFile(path, '分章 part');
    if (!looksLikePart(raw)) {
      console.error(`跳过 ${path}：不是分章 part（没有 meta / nodes）`);
      continue;
    }
    files.push({ path, raw });
  }
  return files;
}

function looksLikePart(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const source = raw as Record<string, unknown>;
  return 'meta' in source || 'nodes' in source;
}

export function sortByCodePoint(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** 8/9 → 88.9%；分母为 0 时给破折号，别假装 100% */
export function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return '—';
  const percent = (numerator / denominator) * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

/** 结构覆盖率分子只算 mapped + exception（§0.3） */
export function structuralRate(coverage: PartCoverage): string {
  return formatRate(coverage.mapped + coverage.exception, coverage.total);
}

/** 六项分开报，不许合并成一个百分比 */
export function coverageLine(coverage: PartCoverage): string {
  return [
    `结构覆盖率 ${coverage.mapped + coverage.exception}/${coverage.total} (${structuralRate(coverage)})`,
    `mapped ${coverage.mapped}`,
    `exception ${coverage.exception}`,
    `missing ${coverage.missing}`,
    `duplicate ${coverage.duplicate}`,
    `undecided ${coverage.undecided}`,
  ].join(' · ');
}
