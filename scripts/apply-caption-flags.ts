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

type Flagged = {
  srcId: string;
  text: string;
  pdfPage?: number;
  region?: { x: number; y: number; width: number; height: number };
};

/** 用 (pdfPage, region) 精确定位 asset —— 一个节点可能引用多张图，按 nodeId 匹配会串台 */
function sameRegion(a?: { x: number; y: number; width: number; height: number }, b?: { x: number; y: number; width: number; height: number }): boolean {
  if (!a || !b) return false;
  const eps = 1e-9;
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}
const flagged = new Map<string, Flagged>();

for (const name of readdirSync(expectedDir).filter((n) => n.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(expectedDir, name), 'utf8'));
  if (!Array.isArray(raw.items)) continue;
  for (const item of raw.items) {
    if (!item.captionOnImage) continue;
    flagged.set(item.srcId, {
      srcId: item.srcId,
      text: (item.text ?? '').trim(),
      pdfPage: item.pdfPage,
      region: item.region,
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
    // 只认 (pdfPage, region) 完全一致的那一条；按 nodeId 匹配会让同一节点的多张图互相污染
    const hit = [...flagged.entries()].find(
      ([, info]) => info.pdfPage === asset.pdfPage && sameRegion(info.region, asset.region),
    )?.[0];
    if (!hit) continue;

    // 图注文字只存在于像素里也不行：必须在 alt 里留一份可检索、可读屏的副本。
    // 优先用清单里那条的原文（Pass 1 抄的印刷图注），其次才是 asset 自带的 caption。
    const info = flagged.get(hit)!;
    const captionText = (info.text || asset.caption || '').trim();
    const already = captionText !== '' && (asset.alt ?? '').includes(captionText);
    const hadCaption = typeof asset.caption === 'string';

    if (!already || hadCaption) {
      if (captionText !== '' && !already) {
        asset.alt = (asset.alt ?? '').trim() === '' ? captionText : `${captionText}。${asset.alt}`;
      }
      if (!dryRun && hadCaption) delete asset.caption;
      changed = true;
      dropped += 1;
      console.log(`  ${asset.id}：图注压在图上，caption→alt${already ? '（alt 已有，只删 caption）' : ''}`);
    }
  }

  if (changed && !dryRun) {
    writeFileSync(path, JSON.stringify(part, null, 2) + '\n');
    touched += 1;
  }
}

console.log('');
console.log(`清单标记 ${flagged.size} 条 · 处理 asset ${dropped} 个 · 改动 part ${touched} 份${dryRun ? '（dry-run，未写入）' : ''}`);
