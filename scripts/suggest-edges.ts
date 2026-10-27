/**
 * 跨章/跨册依赖候选：从已合并的图里找「后学用到先学」的候选边。
 *
 *   bun run suggest:edges [--graph <all.json>] [--out <报告.md>] [--volumes b9a,b9b]
 *
 * 为什么需要它：各批 Pass 2 落盘时，前后的批还没写完，拿不到对方节点 ID，
 * 于是「宁缺勿错」一律不连 —— 九年级实测九上各章之间几乎没有依赖边。
 * 但这条链是本书的主干：十三 章电流电压 → 十四 章欧姆定律 → 十五 章电功电热。
 *
 * 做法：把每个知识点节点（definition / proposition）当目标，去**更早的章/册**的节点里
 * 找 title / key / aliases 的字面出现，命中就产出候选，并附上出现那句话。
 * **它只产候选**：某句提到「电压」不等于用到电压，审计代理必须按
 * `transcribe-spec.md` §7.0 的判据复核（把该概念换掉这句子还成立 → 只是提到，不许连）。
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
  content?: string;
  key?: string;
  aliases?: string[];
  parentId?: string | null;
  citation?: { page?: string };
}

interface Edge {
  from: string;
  to: string;
  predicate: string;
}

interface Graph {
  nodes: Node[];
  edges: Edge[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const graphPath = resolve(arg('graph') ?? join(SUK, 'merged', 'all.json'));
const onlyVolumes = (arg('volumes') ?? '').split(',').map((v) => v.trim()).filter((v) => v.length > 0);
const outPath = resolve(arg('out') ?? join(SUK, 'audit', 'suggest-edges.md'));
if (!existsSync(graphPath)) {
  console.error(`找不到图文件：${graphPath}`);
  process.exit(2);
}

const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as Graph;
const byId = new Map(graph.nodes.map((n) => [n.id, n]));

/** 章 id：内容节点是页码 ID，要顺着 parentId 往上走到 chapter 级节点 */
const CHAPTER_ID = /^phy-[a-z0-9]+-c\d{2}$/;
function chapterOf(id: string): string {
  let cur: Node | undefined = byId.get(id);
  for (let depth = 0; depth < 12 && cur !== undefined; depth++) {
    if (CHAPTER_ID.test(cur.id)) return cur.id;
    const parent = cur.parentId;
    cur = parent === undefined || parent === null ? undefined : byId.get(parent);
  }
  const direct = /^(phy-[a-z0-9]+-c\d{2})/.exec(id);
  return direct?.[1] ?? 'unknown';
}

/** 太泛的词不做依赖目标：提到它们不构成「用到」 */
const GENERIC = new Set(['单位', '物理量', '现象', '测量', '方法', '实验', '活动', '问题', '结论', '物质', '物体']);

/** 册顺序：用于判定「更早」 */
const VOLUME_ORDER: Record<string, number> = { b8a: 0, b8b: 1, b9a: 2, b9b: 3 };
function volumeOf(id: string): string {
  return /^phy-([a-z0-9]+)/.exec(id)?.[1] ?? '';
}
function chapterOrder(chapter: string): number {
  const vol = volumeOf(chapter);
  const c = Number(/-c(\d+)$/.exec(chapter)?.[1] ?? 0);
  return (VOLUME_ORDER[vol] ?? 9) * 100 + c;
}

const knowledge = graph.nodes.filter(
  (n) => n.type === 'definition' || n.type === 'proposition',
);

/** 可被引用的名字：标题 + key + 别名，去重、去掉过短的 */
const namesOf = new Map<string, string[]>();
for (const n of knowledge) {
  const names = new Set<string>();
  if (n.title !== undefined && n.title.trim().length >= 2) names.add(n.title.trim());
  if (n.key !== undefined) names.add(n.key);
  for (const alias of n.aliases ?? []) if (alias.trim().length >= 2) names.add(alias.trim());
  namesOf.set(n.id, [...names]);
}

const existing = new Set(graph.edges.map((e) => `${e.predicate}|${e.from}|${e.to}`));
const candidates: {
  from: Node;
  to: Node;
  sentence: string;
  name: string;
}[] = [];

const contentNodes = graph.nodes.filter(
  (n) => n.type === 'note' || n.type === 'problem' || n.type === 'proposition' || n.type === 'definition',
);

for (const from of contentNodes) {
  const content = from.content ?? '';
  if (content.length < 10) continue;
  if (onlyVolumes.length > 0 && !onlyVolumes.includes(volumeOf(from.id))) continue;
  const fromChapter = chapterOf(from.id);
  const fromOrder = chapterOrder(fromChapter);
  for (const to of knowledge) {
    if (to.id === from.id) continue;
    if (chapterOf(to.id) === fromChapter) continue; // 同章交给 Pass 2 自己
    if (chapterOrder(chapterOf(to.id)) >= fromOrder) continue; // 只要「后学 → 先学」
    for (const name of namesOf.get(to.id) ?? []) {
      // 只认中文名或多词英文 key，避免 "heat" 命中 "heat transfer" 这种噪音
      if (GENERIC.has(name)) continue;
      if (!/[\u4e00-\u9fff]/.test(name) && name.length < 6) continue;
      const idx = content.indexOf(name);
      if (idx === -1) continue;
      if (existing.has(`depends-on|${from.id}|${to.id}`) || existing.has(`cites|${from.id}|${to.id}`)) break;
      const start = Math.max(0, idx - 40);
      const sentence = content.slice(start, Math.min(content.length, idx + name.length + 40)).replace(/\n/g, ' ');
      candidates.push({ from, to, sentence, name });
      break;
    }
  }
}

const pretty = (n: Node): string => `${n.title ?? '(无题)'}${n.citation?.page !== undefined ? ` p${n.citation.page}` : ''}`;

const byFrom = new Map<string, typeof candidates>();
for (const c of candidates) {
  const list = byFrom.get(c.from.id) ?? [];
  list.push(c);
  byFrom.set(c.from.id, list);
}

// 孤立的知识点：定义与命题必须能挂上端（supports / covers / depends-on / uses）
const degree = new Map<string, number>();
for (const e of graph.edges) {
  degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
  degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
}
const isolated = knowledge.filter(
  (n) => (degree.get(n.id) ?? 0) === 0 && (onlyVolumes.length === 0 || onlyVolumes.includes(volumeOf(n.id))),
);

const lines: string[] = [
  '# 跨章 / 跨册依赖候选',
  '',
  '> 由 `scripts/suggest-edges.ts` 生成。**只产候选，不许照着连**。',
  '> 复核判据（`transcribe-spec.md` §7.0）：把这句里的那个概念换成别的，句子是否还成立？',
  '> **还成立就是「只是提到」，不许连**；离开它这句不成立才是 `depends-on`。',
  '> 装置/技术/生活实例「用到了」某原理 → `uses`，不是 `depends-on`。',
  '',
  `扫 ${contentNodes.length} 个内容节点，命中 ${candidates.length} 条候选，涉及 ${byFrom.size} 个起点。`,
  '',
  `## 零度知识点（孤立，必须有落点）—— ${isolated.length} 个`,
  '',
  ...isolated.map((n) => `- \`${n.id}\` · ${n.type}${n.kind !== undefined ? `(${n.kind})` : ''} · **${n.title ?? ''}** · p${n.citation?.page ?? '?'}`),
  '',
  '---',
  '',
  '## 依赖候选',
  '',
];

let lastChapter = '';
for (const [fromId, list] of [...byFrom.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const chapter = chapterOf(fromId);
  if (chapter !== lastChapter) {
    lines.push(`## ${chapter}`, '');
    lastChapter = chapter;
  }
  const from = byId.get(fromId);
  if (from === undefined) continue;
  lines.push(`### ${pretty(from)} · \`${fromId}\``, '');
  for (const c of list) {
    lines.push(`- → **${pretty(c.to)}**（\`${c.to.id}\`，命中「${c.name}」）`);
    lines.push(`  > …${c.sentence}…`);
  }
  lines.push('');
}

writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(`依赖候选：${candidates.length} 条，涉及 ${byFrom.size} 个起点 → ${outPath}`);
