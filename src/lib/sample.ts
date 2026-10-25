import type { Edge, Node, NodeType } from './schema';
import { ORDER_GAP } from './graph';

interface Draft {
  ref: string;
  type: NodeType;
  title: string;
  content?: string;
  solution?: string;
  parent?: string;
  key?: string;
  aliases?: string[];
  tags?: string[];
  attempt?: Node['attempt'];
}

/**
 * 示例笔记：一段真正的数学分析开头，用来展示层级编号、关系边和解题记录。
 * 不自动写入，由用户点「载入示例」触发。
 */
export function buildSample(): { nodes: Node[]; edges: Edge[] } {
  const now = Date.now();
  const idOf = new Map<string, string>();
  const drafts: Draft[] = [
    { ref: 'analysis', type: 'branch', title: '数学分析' },

    // 第 1 章
    { ref: 'ch1', type: 'chapter', parent: 'analysis', title: '实数与函数', content: '本章建立实数系与函数的基本语言。' },
    { ref: 'sec11', type: 'section', parent: 'ch1', title: '集合与映射', content: '集合、映射、复合与可数性。' },
    {
      ref: 'def-powerset',
      type: 'definition',
      parent: 'sec11',
      title: '幂集',
      key: 'power-set',
      aliases: ['2^A', 'P(A)'],
      content:
        '设 $A$ 是一个集合，由 $A$ 的所有子集所组成的集合称为 $A$ 的**幂集**，记作 $\\mathcal{P}(A)$ 或 $2^{A}$：\n\n$$\\mathcal{P}(A)=\\{S\\mid S\\subseteq A\\}.$$',
    },
    {
      ref: 'def-map',
      type: 'definition',
      parent: 'sec11',
      title: '映射',
      key: 'map',
      aliases: ['函数'],
      content:
        '设 $X,Y$ 是两个非空集合，若对每个 $x\\in X$，存在唯一的 $y\\in Y$ 与之对应，则称这个对应为从 $X$ 到 $Y$ 的**映射**，记作 $f:X\\to Y$。',
    },
    {
      ref: 'thm-composition',
      type: 'theorem',
      parent: 'sec11',
      title: '复合映射的结合律',
      content:
        '设 $f:X\\to Y$，$g:Y\\to Z$，$h:Z\\to W$，则\n\n$$h\\circ(g\\circ f)=(h\\circ g)\\circ f.$$',
      solution:
        '对任意 $x\\in X$，两边都等于 $h(g(f(x)))$，由映射相等的定义即得结论。',
    },
    {
      ref: 'eg-powerset',
      type: 'example',
      parent: 'sec11',
      title: '有限集的幂集元素个数',
      content: '证明：若 $|A|=n$，则 $|\\mathcal{P}(A)|=2^{n}$。',
      solution:
        '对 $n$ 归纳。$n=0$ 时 $\\mathcal{P}(\\varnothing)=\\{\\varnothing\\}$，成立。设 $n=k$ 时成立，取 $a\\in A$，把子集按是否含 $a$ 分成两类，各 $2^{k}$ 个，合计 $2^{k+1}$。',
    },
    {
      ref: 'ex-countable',
      type: 'exercise',
      parent: 'sec11',
      title: '可数集的并',
      content: '证明：可数个可数集的并仍是可数集。',
      solution: '用对角线枚举法（Cantor 的 $\u2115\\times\u2115$ 枚举）构造双射。',
    },
    {
      ref: 'try-1',
      type: 'attempt',
      parent: 'ex-countable',
      title: '第一次尝试：直接列举',
      attempt: { correct: false, durationMin: 25, method: '直接列举' },
      content:
        '我一开始想逐个集合依次往下数，写到一半发现「第一个集合是无限集」时根本走不到第二个集合，卡住了。',
    },
    {
      ref: 'try-2',
      type: 'attempt',
      parent: 'ex-countable',
      title: '第二次尝试：对角线',
      attempt: { correct: true, durationMin: 12, method: '对角线枚举' },
      content:
        '把第 $i$ 个集合的第 $j$ 个元素写成格点 $(i,j)$，按 $i+j$ 递增的顺序数，每一层只有有限个，于是得到完整的枚举。',
    },
    {
      ref: 'note-trap',
      type: 'note',
      parent: 'sec11',
      title: '易错点：并集可数不等于每个都可数',
      content: '「可数个可数集的并」里的「可数」不能换成「有限」，否则结论会退化。',
    },

    // 第 2 章
    { ref: 'ch2', type: 'chapter', parent: 'analysis', title: '极限', content: '数列极限与函数极限。' },
    { ref: 'sec21', type: 'section', parent: 'ch2', title: '数列极限' },
    {
      ref: 'def-limit',
      type: 'definition',
      parent: 'sec21',
      title: '数列极限',
      key: 'limit-of-sequence',
      aliases: ['收敛', 'lim'],
      content:
        '若对任意 $\\varepsilon>0$，存在 $N\\in\\mathbb{N}$，当 $n>N$ 时都有 $|a_n-a|<\\varepsilon$，则称数列 $\\{a_n\\}$ **收敛于 $a$**，记作 $\\lim\\limits_{n\\to\\infty}a_n=a$。',
    },
    {
      ref: 'thm-squeeze',
      type: 'theorem',
      parent: 'sec21',
      title: '夹逼定理',
      content:
        '若存在 $N_0$，当 $n>N_0$ 时 $a_n\\le b_n\\le c_n$，且 $\\lim a_n=\\lim c_n=L$，则 $\\lim b_n=L$。',
      solution:
        '对任意 $\\varepsilon>0$，取 $N$ 使 $|a_n-L|<\\varepsilon$ 且 $|c_n-L|<\\varepsilon$，于是 $L-\\varepsilon<a_n\\le b_n\\le c_n<L+\\varepsilon$。',
    },
    {
      ref: 'ex-squeeze',
      type: 'exercise',
      parent: 'sec21',
      title: '用夹逼定理求极限',
      content: '求 $\\lim\\limits_{n\\to\\infty}\\dfrac{\\sin n}{n}$。',
      solution: '由 $-\\dfrac1n\\le\\dfrac{\\sin n}{n}\\le\\dfrac1n$ 及 $\\dfrac1n\\to0$ 夹逼即得。',
    },
    {
      ref: 'ex-squeeze-2',
      type: 'exercise',
      parent: 'sec21',
      title: '根号下 n 个 1',
      content: '求 $\\lim\\limits_{n\\to\\infty}\\sqrt[n]{1+\\dfrac1n}$。',
    },

    // 第 3 章
    { ref: 'ch3', type: 'chapter', parent: 'analysis', title: '连续' },
    { ref: 'sec31', type: 'section', parent: 'ch3', title: '连续与间断' },
    {
      ref: 'def-continuous',
      type: 'definition',
      parent: 'sec31',
      title: '连续',
      key: 'continuous',
      content:
        '设 $f$ 在 $x_0$ 的某邻域内有定义，若 $\\lim\\limits_{x\\to x_0}f(x)=f(x_0)$，则称 $f$ 在 $x_0$ **连续**。',
    },
    {
      ref: 'thm-ivt',
      type: 'theorem',
      parent: 'sec31',
      title: '介值定理',
      content:
        '设 $f\\in C[a,b]$，$f(a)<\\mu<f(b)$，则存在 $\\xi\\in(a,b)$ 使 $f(\\xi)=\\mu$。',
      solution: '取 $S=\\{x\\in[a,b]\\mid f(x)\\le\\mu\\}$，令 $\\xi=\\sup S$，用连续性证明 $f(\\xi)=\\mu$。',
    },

    // 第二个分支，演示跨分支引用
    { ref: 'algebra', type: 'branch', title: '高等代数' },
    { ref: 'ach1', type: 'chapter', parent: 'algebra', title: '线性空间' },
    { ref: 'asec11', type: 'section', parent: 'ach1', title: '线性空间与子空间' },
    {
      ref: 'def-vector-space',
      type: 'definition',
      parent: 'asec11',
      title: '线性空间',
      key: 'vector-space',
      content: '定义了加法与数乘并满足八条公理的集合称为**线性空间**。',
    },
    {
      ref: 'note-dim',
      type: 'note',
      parent: 'asec11',
      title: '和数学分析的类比',
      content: '线性空间的公理化和实数系的公理化是同一个套路：先列要求，再证明满足要求的对象唯一。',
    },
  ];

  const nodes: Node[] = [];
  const orderCounter = new Map<string | null, number>();

  for (const draft of drafts) {
    const parentId = draft.parent ? (idOf.get(draft.parent) ?? null) : null;
    if (draft.parent && !parentId) continue;
    const nextOrder = (orderCounter.get(parentId) ?? 0) + ORDER_GAP;
    orderCounter.set(parentId, nextOrder);
    const id = crypto.randomUUID();
    idOf.set(draft.ref, id);
    nodes.push({
      id,
      type: draft.type,
      title: draft.title,
      content: draft.content ?? '',
      solution: draft.solution,
      parentId,
      order: nextOrder,
      key: draft.key,
      aliases: draft.aliases,
      tags: draft.tags,
      attempt: draft.attempt,
      createdAt: now,
      updatedAt: now,
    });
  }

  const edges: Edge[] = [];
  const addEdge = (fromRef: string, toRef: string, predicate: Edge['predicate'], extra?: Partial<Edge>) => {
    const from = idOf.get(fromRef);
    const to = idOf.get(toRef);
    if (!from || !to) return;
    edges.push({
      id: crypto.randomUUID(),
      from,
      to,
      predicate,
      assertedBy: 'import',
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
  };

  addEdge('thm-composition', 'def-map', 'depends-on');
  addEdge('eg-powerset', 'def-powerset', 'depends-on');
  addEdge('ex-countable', 'def-map', 'depends-on');
  addEdge('try-2', 'ex-countable', 'cites', { note: '我的正确解法' });
  addEdge('thm-squeeze', 'def-limit', 'depends-on');
  addEdge('ex-squeeze', 'thm-squeeze', 'depends-on');
  addEdge('ex-squeeze', 'def-limit', 'depends-on');
  addEdge('thm-ivt', 'def-continuous', 'depends-on');
  addEdge('thm-squeeze', 'def-limit', 'implies', {
    condition: '$a_n \\le b_n \\le c_n$ 且两端极限相同',
    note: '极限存在的充分条件',
  });
  addEdge('note-trap', 'ex-countable', 'cites');
  addEdge('note-dim', 'def-vector-space', 'cites');
  addEdge('def-continuous', 'def-limit', 'depends-on');

  return { nodes, edges };
}
