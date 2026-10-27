/**
 * 从已合并的 `all.json` 导出跨册实体注册表 `entities.json`。
 *
 *   bun run export:entities [--graph <all.json>] [--out <entities.json>]
 *
 * 为什么需要它：规约 §9 要求批次开跑前查注册表，`merge:parts --entities` 会用它做重复建节点的告警。
 * 八上八下一直没传过，九年级开工会直接产生重复概念节点（九下第十五章整章建立在九上的电压/电流/电阻上）。
 *
 * 取什么：`type=definition` 且有 `key` 的节点。`key` 是跨册引用的唯一锚点，没有 key 的定义无法被引用，
 * 不能进注册表（否则合并器会拿一个永远对不上的 key 去比对）。
 *
 * `firstSeen` 取**最近的祖先 `section`**（「一、二、三」那级）；没有就退到章。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SUK = join(REPO_ROOT, 'local-textbook', 'sukey');

interface Node {
  id: string;
  type: string;
  kind?: string;
  title?: string;
  parentId?: string | null;
  key?: string;
  aliases?: string[];
}

interface Graph {
  nodes: Node[];
}

interface Entity {
  id: string;
  key: string;
  title: string;
  aliases: string[];
  firstSeen: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const graphPath = resolve(arg('graph') ?? join(SUK, 'merged', 'all.json'));
const outPath = resolve(arg('out') ?? join(SUK, 'entities.json'));

if (!existsSync(graphPath)) {
  console.error(`找不到图文件：${graphPath}`);
  process.exit(2);
}

const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as Graph;
const byId = new Map(graph.nodes.map((n) => [n.id, n]));

/** 祖先里最近的 section（「一、二、三」级），没有就退到章，再没有就空串 */
function firstSeenOf(node: Node): string {
  let cur = node.parentId ? byId.get(node.parentId) : undefined;
  let chapter: string | undefined;
  while (cur) {
    if (cur.type === 'section') {
      if (cur.kind === 'section') return cur.id;
      if (cur.kind === 'chapter') chapter = cur.id;
    }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chapter ?? '';
}

const entities: Entity[] = graph.nodes
  .filter((n) => n.type === 'definition' && typeof n.key === 'string' && n.key.length > 0)
  .map((n) => ({
    id: n.id,
    key: n.key as string,
    title: n.title ?? '',
    aliases: n.aliases ?? [],
    firstSeen: firstSeenOf(n),
  }))
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

const dupKey = entities.filter((e, i) => i > 0 && entities[i - 1]?.key === e.key);
if (dupKey.length > 0) {
  console.error(`key 重复：${dupKey.map((e) => e.key).join(', ')}`);
  process.exit(2);
}

writeFileSync(outPath, `${JSON.stringify({ entities }, null, 2)}\n`);
console.log(`实体注册表：${outPath}（${entities.length} 条）`);
const noSection = entities.filter((e) => e.firstSeen === '');
if (noSection.length > 0) console.log(`firstSeen 为空：${noSection.length} 条（不在任何章下的定义）`);
