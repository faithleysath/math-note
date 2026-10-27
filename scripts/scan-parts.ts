/**
 * 九年级审计预扫描：把「判断类」要求变成候选清单。
 *
 *   bun run scan:parts [--parts <目录>] [--out <报告.md>]
 *
 * 为什么需要它：八年级的审计结论是「写成『必须/禁止』的规则执行准确率接近满分，
 * 写成『应该这样判断』的地方只有一半」。所以把能机械识别的特征先扫出来，审计代理逐条判，
 * 而不是靠通读全文靠感觉。
 *
 * **它只产候选，不下结论。** 每条都是「疑似」，需要审计代理去页图核实。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const SUK = join(REPO_ROOT, 'local-textbook', 'sukey');

interface PartNode {
  id: string;
  type: string;
  kind?: string;
  title?: string;
  content?: string;
  parentId?: string | null;
  tags?: string[];
  citation?: { page?: string };
}

interface Part {
  nodes?: PartNode[];
  edges?: unknown[];
  assets?: unknown[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const partsDir = resolve(arg('parts') ?? join(SUK, 'parts'));
const outPath = resolve(arg('out') ?? join(SUK, 'audit', 'scan-parts.md'));

if (!existsSync(partsDir)) {
  console.error(`找不到 parts 目录：${partsDir}`);
  process.exit(2);
}

/** 可判真假的引导词：出现在 note 正文里就该怀疑漏立命题 */
const ASSERTION_MARKERS = [
  '大量实验表明',
  '大量事实表明',
  '实验表明',
  '研究表明',
  '分析表明',
  '说明',
  '可知',
  '表明',
  '结论是',
  '由此可知',
  '由此推断',
  '成正比',
  '成反比',
  '成正比关系',
  '恒为',
  '保持不变',
  '总是',
];

/** 定律/规律名的尾巴：正文里出现且节点不是 proposition，基本可以断定漏立 */
const LAW_SUFFIX = /(定律|规律|原理|定则|条件|特点)/;

/** 公式特征 */
const FORMULA_MARKERS = [/\$\$/, /\\frac/, /\\times/, /\\Omega/, /\\rho/];

/** 伪定义特征：definition 正文里没有界定语 */
const DEFINING_WORDS = /(叫作|叫做|称为|称|是指|定义为|即|的含义是|的比值|的物理量)/;

/** 元话语：写给读者以外的人看的话 */
const META_WORDS = ['结构化', '该栏目', '图中层级', '此处原书', 'mindmap 只能', '层级关系图谱', '按规约', '本节点'];

const findings: { part: string; node: PartNode; reason: string; hit: string }[] = [];

const files = readdirSync(partsDir).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  const part = JSON.parse(readFileSync(join(partsDir, file), 'utf8')) as Part;
  for (const node of part.nodes ?? []) {
    const content = node.content ?? '';
    if (content.length === 0) continue;

    if (node.type === 'note') {
      for (const marker of ASSERTION_MARKERS) {
        if (content.includes(marker)) {
          findings.push({ part: file, node, reason: 'note 里有断言引导词，可能漏立 proposition', hit: marker });
          break;
        }
      }
      const law = LAW_SUFFIX.exec(node.title ?? '');
      if (law !== null) {
        findings.push({ part: file, node, reason: `note 标题含「${law[1]}」，可能该是 proposition`, hit: law[1] });
      }
      for (const re of FORMULA_MARKERS) {
        if (re.test(content) && !/(公式|计算|代入|求)/.test(node.title ?? '')) {
          findings.push({ part: file, node, reason: 'note 正文里有公式，可能该是 proposition(formula)', hit: String(re) });
          break;
        }
      }
    }

    if (node.type === 'definition' && !DEFINING_WORDS.test(content)) {
      findings.push({ part: file, node, reason: 'definition 正文里没有界定语，可能是伪定义', hit: '（无「叫作/称为/是指」）' });
    }

    for (const meta of META_WORDS) {
      if (content.includes(meta)) {
        findings.push({ part: file, node, reason: '正文里有元话语（写给读者以外的人看）', hit: meta });
        break;
      }
    }
  }
}

const byPart = new Map<string, typeof findings>();
for (const f of findings) {
  const list = byPart.get(f.part) ?? [];
  list.push(f);
  byPart.set(f.part, list);
}

const lines: string[] = [
  '# 审计预扫描（机械候选清单）',
  '',
  '> 由 `scripts/scan-parts.ts` 生成。**只产候选，不下结论**——每条都要去页图核实。',
  '> 判据是可机械识别的字面特征；「语义对不对」「依据支不支持」这类仍需人工审计。',
  '',
  `扫描 ${files.length} 份 part，命中 ${findings.length} 条候选。`,
  '',
];

for (const [file, list] of byPart) {
  lines.push(`## ${file}（${list.length} 条）`, '');
  lines.push('| 节点 | 标题 | 页码 | 问题 | 命中 |');
  lines.push('|---|---|---|---|---|');
  for (const f of list) {
    const title = (f.node.title ?? '').replace(/\|/g, '\\|').slice(0, 28);
    lines.push(`| \`${f.node.id}\` | ${title} | ${f.node.citation?.page ?? '?'} | ${f.reason} | \`${f.hit}\` |`);
  }
  lines.push('');
}

writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(`预扫描：${files.length} 份 part · ${findings.length} 条候选 → ${outPath}`);
