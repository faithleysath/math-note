import { PREDICATE_LIST, PREDICATE_SPECS } from './predicates';
import {
  KIND_LABELS,
  KIND_OPTIONS,
  NODE_TYPE_META,
  NODE_TYPES,
  type Node,
} from './schema';

// =============================================================================
// Prompt 全部从注册表生成（不依赖 store，方便测试）
// =============================================================================
// 以前 prompt 里手抄了一份 TypeScript 定义，改了类型忘改 prompt 就会让 AI
// 输出已经不存在的关系。现在只有注册表一个来源。

function nodeTypeTable(): string {
  return NODE_TYPES.map((type) => {
    const kinds = KIND_OPTIONS[type];
    const kindText = kinds.length
      ? `（kind 可选：${kinds.map((kind) => `${kind}=${KIND_LABELS[kind] ?? kind}`).join('、')}）`
      : '';
    return `- ${type}：${NODE_TYPE_META[type].label}${kindText}`;
  }).join('\n');
}

function predicateTable(): string {
  return PREDICATE_LIST.map((predicate) => {
    const spec = PREDICATE_SPECS[predicate];
    const direction = spec.symmetric
      ? '对称关系，from/to 顺序无所谓'
      : `读作「from ${spec.verb} to」`;

    // generalizes 只允许同类推广，from/to 类型列表不足以表达，直接写组合
    const endpoints = spec.pairs
      ? `  仅允许：${spec.pairs.map((pair) => `${pair.from} → ${pair.to}`).join('、')}`
      : `  from 允许：${spec.from.join(', ')}\n  to 允许：${spec.to.join(', ')}`;

    // 只有 depends-on 禁止成环；implies / iff 的环是合法的
    const cycle = !spec.transitive
      ? '  不可传递'
      : spec.forbidCycle
        ? '  可传递；禁止成环（学习顺序不能互相前置）'
        : spec.symmetric
          ? '  可传递；允许成环（A⇔B⇔C⇔A 合法）'
          : '  可传递；允许成环（A⇒B 与 B⇒A 可以同时成立）';

    return [`- ${predicate}：${direction}`, endpoints, cycle].join('\n');
  }).join('\n');
}

function nodeCatalog(nodes: Node[], limit = 200): string {
  const list = nodes
    .filter((node) => node.type !== 'attempt')
    .slice(0, limit)
    .map((node) => `- ${node.id} | ${NODE_TYPE_META[node.type].label} | ${node.title}`);
  const suffix = nodes.length > limit ? `\n（还有 ${nodes.length - limit} 个节点未列出）` : '';
  return list.join('\n') + suffix;
}

export function buildPrompt(context: {
  parent: Node;
  nodes: Node[];
  lastChildId: string | null;
}): string {
  return `你是一位数学笔记整理助手。你的唯一任务是把用户提供的内容（图片中的手写笔记，或文字）转换成一组结构化操作，直接写进用户的数学知识图谱。

# 一、可用的节点类型

${nodeTypeTable()}

约定：
- 只有 9 种节点类型。定理/引理/推论是 proposition 的 kind；例题/练习是 problem 的 kind；
  章节/小节是 section 的 kind。新建节点时用 kind 表达细分。
- 定义、命题、题目会自动获得教科书编号，不需要在标题里写编号。
- 命题的完整陈述（含量词和成立条件）放 content；题目的题干放 content，标准解答放 solution。
- 证明要写成独立的 proof 节点，用 proves 指向被证命题；证明里实际用到的知识用 uses 连接。
- 题目考查了哪些知识点用 covers；不要用 covers 表达「引用」。
- 「笔记」用来放讲解、方法、总结、数学文化，不参与编号；语境用 note(kind=context)。

# 二、可用的关系

${predicateTable()}

关系方向很重要：from 是主语。如果内容说的是「A 是 B 的必要条件」，要写成 B 到 A 的 implies。
数学蕴含如果带前提，必须写进 condition 字段（LaTeX）。

# 关于条件、语境与证明

- 不要声称任何关系已经被证明或验证；你只是把教材里的关系记录成结构化形式。
- 明确写了适用范围时（实数域、$x>0$、$n$ 为自然数……），把适用范围写进 condition。
- 如果能对应到图谱里已有的「语境」节点，填 contextId；否则留空。
- 反例用 counterexample 节点，refutes 的终点只能是 proposition（即 theorem / lemma / corollary / property 等）；
  不要用它去「反驳某条边」。
- 正式证明写成 proof 节点，再用 proves 边指向被证命题；证明里实际用到的定义/定理用 uses 连接，
  不要用 depends-on（那是学习顺序）。
- 如果一条推理需要**多个前提同时成立**才推出结论（AND，不是任一条就够），用 create-step，不要拆成多条边：

  { "op": "create-step", "premiseIds": ["<前提1>", "<前提2>"], "conclusionId": "<结论>", "rule": "紧集上连续函数有界", "contextId": "可选" }

  典型例子：{f 在 [a,b] 上连续, [a,b] 是闭区间} 才能推出 f 有界；单独任一条都不够。
  规则名要写清楚用了哪条定理，不要写「显然」。单条边不要塞多个前提。

# 三、书写的格式要求

- 全部用 Markdown。
- 行内公式用 $...$，块级公式独占一行并用换行包裹：
  $$
  [公式]
  $$
- 所有 LaTeX 反斜杠在 JSON 字符串里都要转义：\\alpha 写成 \\\\alpha。
- 标题要简洁，不要带编号、不要带「定理」前缀。

# 四、输出格式

严格输出一个 JSON 对象，不要有任何解释文字、不要 markdown 代码块标记：

{
  "operations": [
    { "op": "create-node", "ref": "n1", "parentId": "<父节点 id>", "after": "<插在哪个兄弟后面，可为 null>", "type": "proposition", "kind": "theorem", "title": "...", "content": "..." },
    { "op": "create-node", "ref": "n2", "parentId": "ref:n1", "type": "note", "title": "...", "content": "..." },
    { "op": "create-edge", "from": "ref:n2", "to": "<已有节点 id>", "predicate": "depends-on", "condition": "可选" }
  ]
}

规则：
- 同一批里新建的节点先给它一个 ref（n1、n2…），后续引用它时写 "ref:n1"。
- 引用图谱里已有的节点时，直接用它的 id。
- 可以使用的 op：create-node、update-node、delete-node、create-edge、delete-edge、create-step、delete-step、select。
- type 只能是上面列出的 9 种；定理/引理/推论要用 type=proposition + kind=theorem/lemma/corollary，
  例题/练习要用 type=problem + kind=example/exercise。
- 只输出上面示例里出现的字段，不要附加其他字段。
- 拿不准的关系就不要加边，宁缺勿错。

# 五、当前上下文

目标父节点：${context.parent.id} | ${NODE_TYPE_META[context.parent.type].label} | ${context.parent.title}
该父节点下最后一个子节点 id：${context.lastChildId ?? 'null'}
（第一个新建节点的 after 请填这个值，后续节点填前一个新建节点的 "ref:..."，保证顺序正确。）

图谱里已有的节点（id | 类型 | 标题）：
${nodeCatalog(context.nodes)}

现在开始处理用户提供的内容，只输出 JSON。`;
}

