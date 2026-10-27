#!/usr/bin/env bun
/**
 * 打包教材交换包（.tbg）：
 *
 *   bun run pack:exchange --graph <all.json> --root <目录> --out <out.tbg>
 *        [--doc <cover.md> ...] [--title <书名>]
 *
 * `--root` 是 graph.assets[].path 的基准目录，例如 `local-textbook/sukey`。
 * 逐张校验字节数与 sha256，任何一张对不上就整包失败。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { buildExchangePackage, type ExchangeAsset, type ExchangeDocument } from '../src/lib/exchange';
import { graphJSONSchemaV9 } from '../src/lib/schema';

const USAGE = [
  '用法：bun run pack:exchange --graph <all.json> --root <目录> --out <out.tbg>',
  '       [--doc <文档.md> ...] [--title <书名>]',
  '',
  '  --graph   合并后的 v9 GraphJSON',
  '  --root    graph.assets[].path 的基准目录（例如 local-textbook/sukey）',
  '  --out     输出 .tbg 路径',
  '  --doc     可选，重复传入；打进 documents/ 供人读，导入时忽略',
  '  --title   可选，覆盖 manifest.book.title（仅展示用）',
].join('\n');

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const values: { graph?: string; root?: string; out?: string; title?: string; docs: string[] } = {
    docs: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--help' || key === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
    if (!value || value.startsWith('--')) fail(`参数 ${key} 缺少值。\n${USAGE}`);
    if (key === '--graph') values.graph = value;
    else if (key === '--root') values.root = value;
    else if (key === '--out') values.out = value;
    else if (key === '--title') values.title = value;
    else if (key === '--doc') values.docs.push(value);
    else fail(`不认识的参数：${key}\n${USAGE}`);
    i += 1;
  }
  if (!values.graph || !values.root || !values.out) fail(USAGE);
  return values as { graph: string; root: string; out: string; title?: string; docs: string[] };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const graphPath = resolve(args.graph);
  const root = resolve(args.root);
  const outPath = resolve(args.out);

  let graphJson: unknown;
  try {
    graphJson = JSON.parse(await readFile(graphPath, 'utf8'));
  } catch (error) {
    fail(`读 graph 失败：${error instanceof Error ? error.message : String(error)}`);
  }
  const graph = graphJSONSchemaV9.parse(graphJson);
  if (args.title) graph.book = { ...graph.book, title: args.title };

  const assets: ExchangeAsset[] = [];
  for (const meta of graph.assets) {
    const filePath = resolve(root, meta.path);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(filePath));
    } catch (error) {
      fail(`读资源失败：${meta.path}（${error instanceof Error ? error.message : String(error)}）`);
    }
    assets.push({ meta, bytes });
  }

  const documents: ExchangeDocument[] = [];
  const used = new Set<string>();
  for (const doc of args.docs) {
    const name = basename(doc);
    if (used.has(name)) fail(`文档重名：${name}`);
    used.add(name);
    documents.push({
      path: `documents/${name}`,
      bytes: new Uint8Array(await readFile(resolve(doc))),
    });
  }

  const packageBytes = await buildExchangePackage(graph, assets, { documents });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, packageBytes);
  console.log(
    `交换包已写入：${outPath}\n` +
      `  ${graph.nodes.length} 节点 / ${graph.edges.length} 边 / ${graph.assets.length} 资源` +
      `${documents.length > 0 ? ` / ${documents.length} 份文档` : ''}\n` +
      `  ${(packageBytes.byteLength / 1024 / 1024).toFixed(1)} MiB`,
  );
}

await main();
