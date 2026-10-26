/**
 * 把清单里的 `captionOnImage` 标记应用到已写好的 part：
 * 这些图的印刷图注直接压在画面上、裁不掉，阅读器若再渲染 `<figcaption>` 就会出现两遍。
 *
 *   bun run scripts/apply-caption-flags.ts [--expected <目录>] [--parts <目录>] [--dry-run]
 *
 * 幂等：已经处理过的不会再报。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const expectedDir = arg('expected', 'local-textbook/sukey/expected');
const partsDir = arg('parts', 'local-textbook/sukey/parts');

type Flagged = { srcId: string; text: string; caption?: string };
const flagged = new Map<string, Flagged>();

for (const name of readdirSync(expectedDir).filter((n) => n.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(expectedDir, name), 'utf8'));
  if (!Array.isArray(raw.items)) continue;
  for (const item of raw.items) {
    if (!item.captionOnImage) continue;
    flagged.set(item.srcId, {
      srcId: item.srcId,
      text: (item.text ?? '').trim(),
      caption: item.originalNumber ?? undefined,
    });
  }
}

if (flagged.size === 0) {
  console.log('清单里没有 captionOnImage 标记，无事可做。');
  process.exit(0);
}

let touched = 0;
let dropped = 0;
for (const name of readdirSync(partsDir).filter((n) => n.endsWith('.json'))) {
  const path = join(partsDir, name);
  const part = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(part.assets)) continue;
  let changed = false;

  for (const asset of part.assets) {
    // asset 的 srcId：优先 tags 里认领的 src，其次 nodeId
    const claimed: string[] = [];
    if (typeof asset.srcId === 'string') claimed.push(asset.srcId);
    const node = (part.nodes ?? []).find((n: { id: string }) => n.id === asset.nodeId);
    for (const tag of node?.tags ?? []) {
      if (typeof tag === 'string' && tag.startsWith('src:')) claimed.push(tag.slice(4));
    }
    claimed.push(asset.nodeId);

    const hit = claimed.find((id) => flagged.has(id));
    if (!hit) continue;
    if (!asset.caption) continue;

    if (!asset.alt || asset.alt.trim() === '') {
      asset.alt = asset.caption;
    } else if (!asset.alt.includes(asset.caption)) {
      asset.alt = `${asset.caption}。${asset.alt}`;
    }
    if (!dryRun) delete asset.caption;
    changed = true;
    dropped += 1;
    console.log(`  ${asset.id}：图注压在图上，去掉 caption，文字并入 alt`);
  }

  if (changed && !dryRun) {
    writeFileSync(path, JSON.stringify(part, null, 2) + '\n');
    touched += 1;
  }
}

console.log('');
console.log(`清单标记 ${flagged.size} 条 · 处理 asset ${dropped} 个 · 改动 part ${touched} 份${dryRun ? '（dry-run，未写入）' : ''}`);
