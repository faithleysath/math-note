import { buildIndex, searchNodes, stepsForNode } from '../src/lib/graph';
import { serializeGraph, parseGraph } from '../src/lib/serialize';
import type { Edge, Node } from '../src/lib/schema';

function makeGraph(count: number) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const now = Date.now();
  const add = (n: Partial<Node>) => {
    nodes.push({
      id: n.id!, type: n.type!, kind: n.kind, title: n.title ?? n.id!, content: n.content ?? '',
      parentId: n.parentId ?? null, order: n.order ?? 1024, createdAt: now, updatedAt: now,
      key: n.key,
    });
    return n.id!;
  };
  add({ id: 'root', type: 'branch', title: '高中数学' });
  let perChapter = 0;
  const chapters = Math.max(1, Math.round(count / 100));
  for (let c = 0; c < chapters; c++) {
    const ch = `ch${c}`;
    add({ id: ch, type: 'section', kind: 'chapter', title: `第${c}章`, parentId: 'root', order: 1024 * (c + 1) });
    for (let s = 0; s < 10; s++) {
      const sec = `sec${c}_${s}`;
      add({ id: sec, type: 'section', kind: 'section', title: `小节${c}.${s}`, parentId: ch, order: 1024 * (s + 1) });
      let idx = 0;
      while (perChapter < Math.round(count / (chapters * 10)) ) {
        idx += 1; perChapter += 1;
        const id = `p${c}_${s}_${idx}`;
        add({
          id, type: 'proposition', kind: idx % 3 === 0 ? 'property' : 'theorem',
          title: `命题 ${c}.${s}.${idx} 关于函数与数列的性质`, content: '设 $x$ 为实数，则 $x^2\\ge 0$。',
          parentId: sec, order: 1024 * idx, key: `prop-${c}-${s}-${idx}`,
        });
        if (idx > 1) {
          edges.push({
            id: `e${c}_${s}_${idx}`, from: id, to: `p${c}_${s}_${idx - 1}`,
            predicate: 'depends-on', assertedBy: 'import', createdAt: now, updatedAt: now,
          });
        }
      }
      perChapter = 0;
    }
  }
  return { nodes, edges, steps: [] };
}

const results: Record<string, unknown> = {};
for (const size of [5000, 20000]) {
  const graph = makeGraph(size);
  const t0 = performance.now();
  const index = buildIndex(graph.nodes, graph.edges, []);
  const build = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < 20; i++) searchNodes(index, '数列', 20);
  const search = (performance.now() - t1) / 20;

  const t3 = performance.now();
  for (let i = 0; i < 100; i++) stepsForNode(index, graph.nodes[i % graph.nodes.length].id);
  const stepLookup = (performance.now() - t3) / 100;

  const exportJson = JSON.stringify(serializeGraph(graph.nodes, graph.edges, []));
  const t4 = performance.now();
  parseGraph(JSON.parse(exportJson));
  const importMs = performance.now() - t4;

  results[`${size}`] = {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    indexMs: +build.toFixed(1),
    searchMs: +search.toFixed(2),
    stepLookupMs: +stepLookup.toFixed(3),
    importMs: +importMs.toFixed(1),
    jsonMB: +(exportJson.length / 1024 / 1024).toFixed(1),
    heapMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0),
  };
}
console.log(JSON.stringify(results, null, 1));
