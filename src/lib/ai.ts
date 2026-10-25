import { PREDICATE_LIST, PREDICATE_SPECS } from './predicates';
import { NODE_TYPE_META, NODE_TYPES, aiOperationListSchema, type AiOperation, type Node } from './schema';
import { useAiConfigStore } from '../stores/useAiConfigStore';

// =============================================================================
// Prompt 全部从注册表生成
// =============================================================================
// 以前 prompt 里手抄了一份 TypeScript 定义，改了类型忘改 prompt 就会让 AI
// 输出已经不存在的关系。现在只有注册表一个来源。

function nodeTypeTable(): string {
  return NODE_TYPES.map((type) => `- ${type}：${NODE_TYPE_META[type].label}`).join('\n');
}

function predicateTable(): string {
  return PREDICATE_LIST.map((predicate) => {
    const spec = PREDICATE_SPECS[predicate];
    const direction = spec.symmetric
      ? '对称关系，from/to 顺序无所谓'
      : `读作「from ${spec.verb} to」`;
    return [
      `- ${predicate}：${direction}`,
      `  from 允许：${spec.from.join(', ')}`,
      `  to 允许：${spec.to.join(', ')}`,
      spec.transitive ? '  可传递（不能成环）' : '  不可传递',
    ].join('\n');
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
- 「定义」「定理」「引理」「推论」「例题」「练习」会自动获得教科书编号，不需要在标题里写编号。
- 定理 / 引理 / 推论 / 例题 / 练习 的命题陈述或题干放在 content，教科书式证明或标准答案放在 solution。
- 「笔记」用来放评注、易错点、想法，不参与编号。

# 二、可用的关系

${predicateTable()}

关系方向很重要：from 是主语。如果内容说的是「A 是 B 的必要条件」，要写成 B 到 A 的 implies。
数学蕴含如果带前提，必须写进 condition 字段（LaTeX）。

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
    { "op": "create-node", "ref": "n1", "parentId": "<父节点 id>", "after": "<插在哪个兄弟后面，可为 null>", "type": "theorem", "title": "...", "content": "...", "solution": "..." },
    { "op": "create-node", "ref": "n2", "parentId": "ref:n1", "type": "note", "title": "...", "content": "..." },
    { "op": "create-edge", "from": "ref:n2", "to": "<已有节点 id>", "predicate": "depends-on", "condition": "可选" }
  ]
}

规则：
- 同一批里新建的节点先给它一个 ref（n1、n2…），后续引用它时写 "ref:n1"。
- 引用图谱里已有的节点时，直接用它的 id。
- 可以使用的 op：create-node、update-node、delete-node、create-edge、delete-edge、select。
- 拿不准的关系就不要加边，宁缺勿错。

# 五、当前上下文

目标父节点：${context.parent.id} | ${NODE_TYPE_META[context.parent.type].label} | ${context.parent.title}
该父节点下最后一个子节点 id：${context.lastChildId ?? 'null'}
（第一个新建节点的 after 请填这个值，后续节点填前一个新建节点的 "ref:..."，保证顺序正确。）

图谱里已有的节点（id | 类型 | 标题）：
${nodeCatalog(context.nodes)}

现在开始处理用户提供的内容，只输出 JSON。`;
}

// =============================================================================
// 调用
// =============================================================================

export interface AiPresetConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  modelName: string;
  baseUrl: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  imageBase64?: string;
  mimeType?: string;
}

function getPreset(): AiPresetConfig {
  const { getActivePreset } = useAiConfigStore.getState();
  const preset = getActivePreset();
  if (!preset) throw new Error('还没有配置 AI 预设。');
  if (!preset.apiKey) throw new Error(`预设「${preset.name}」缺少 API Key。`);
  return {
    provider: preset.provider,
    apiKey: preset.apiKey,
    modelName: preset.modelName,
    baseUrl: preset.baseUrl,
  };
}

async function callGemini(preset: AiPresetConfig, messages: ChatMessage[]): Promise<string> {
  const url = `${preset.baseUrl}/${preset.modelName}:generateContent?key=${preset.apiKey}`;
  const body = {
    contents: messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: message.text },
        ...(message.imageBase64
          ? [{ inline_data: { mime_type: message.mimeType ?? 'image/jpeg', data: message.imageBase64 } }]
          : []),
      ],
    })),
    generationConfig: { response_mime_type: 'application/json', temperature: 0.2 },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Gemini 请求失败（${response.status}）：${await response.text()}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Gemini 返回格式不认识。');
  return text;
}

async function callOpenAI(preset: AiPresetConfig, messages: ChatMessage[]): Promise<string> {
  const url = `${preset.baseUrl}/chat/completions`;
  const body = {
    model: preset.modelName,
    temperature: 0.2,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.imageBase64
        ? [
            { type: 'text', text: message.text },
            {
              type: 'image_url',
              image_url: { url: `data:${message.mimeType ?? 'image/jpeg'};base64,${message.imageBase64}` },
            },
          ]
        : message.text,
    })),
    response_format: { type: 'json_object' },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${preset.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`AI 请求失败（${response.status}）：${await response.text()}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('AI 返回格式不认识。');
  return content;
}

async function callModel(preset: AiPresetConfig, messages: ChatMessage[]): Promise<string> {
  return preset.provider === 'gemini' ? callGemini(preset, messages) : callOpenAI(preset, messages);
}

/** 从模型输出里抠出 JSON（有些模型仍然会包 ```json） */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('模型没有返回 JSON。');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function summarizeIssues(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

export interface AiParseResult {
  operations: AiOperation[];
  /** 校验失败时附上的原始输出，方便排查 */
  raw: string;
}

/**
 * 调模型 → 用 zod 校验 → 失败时把错误回传给模型要求它修一次。
 * LLM 永远不能绕过数据层的不变式。
 */
export async function generateOperations(input: {
  prompt: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<AiParseResult> {
  const preset = getPreset();
  const messages: ChatMessage[] = [
    { role: 'user', text: input.prompt, imageBase64: input.imageBase64, mimeType: input.mimeType },
  ];

  let raw = await callModel(preset, messages);
  try {
    return { operations: parseOperations(raw), raw };
  } catch (error) {
    // 一次自我修复的机会
    const repair: ChatMessage[] = [
      ...messages,
      { role: 'assistant', text: raw },
      {
        role: 'user',
        text: `上面这段输出不合法：${summarizeIssues(error)}。请只输出修正后的 JSON 对象，不要解释。`,
      },
    ];
    raw = await callModel(preset, repair);
    return { operations: parseOperations(raw), raw };
  }
}

export function parseOperations(raw: string): AiOperation[] {
  const json = extractJson(raw);
  return aiOperationListSchema.parse(json).operations;
}

/** 本地预览：把操作翻译成人话，应用前给用户看 */
export function describeOperation(op: AiOperation, nodes: Map<string, Node>): string {
  const title = (id: string) => {
    if (id.startsWith('ref:')) return `（本次新建 ${id.slice(4)}）`;
    const node = nodes.get(id);
    return node ? `「${node.title}」` : id;
  };

  switch (op.op) {
    case 'create-node':
      return `新建${NODE_TYPE_META[op.type].label}「${op.title}」${op.ref ? `（ref: ${op.ref}）` : ''}`;
    case 'update-node':
      return `修改${title(op.id)}`;
    case 'delete-node':
      return `删除${title(op.id)}及其子节点`;
    case 'create-edge':
      return `建立关系：${title(op.from)} → ${PREDICATE_SPECS[op.predicate].fromLabel} → ${title(op.to)}`;
    case 'delete-edge':
      return `删除关系 ${op.id}`;
    case 'select':
      return `选中${title(op.id)}`;
    default:
      return '未知操作';
  }
}
