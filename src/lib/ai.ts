import { PREDICATE_SPECS } from './predicates';
import {
  KIND_LABELS,
  NODE_TYPE_META,
  aiOperationListSchema,
  type AiOperation,
  type Node,
} from './schema';
import { useAiConfigStore } from '../stores/useAiConfigStore';

export { buildPrompt } from './ai-prompt';

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
    case 'create-node': {
      const kindText = op.kind ? `${KIND_LABELS[op.kind] ?? op.kind}` : NODE_TYPE_META[op.type].label;
      return `新建${kindText}「${op.title}」${op.ref ? `（ref: ${op.ref}）` : ''}`;
    }
    case 'update-node':
      return `修改${title(op.id)}`;
    case 'delete-node':
      return `删除${title(op.id)}及其子节点`;
    case 'create-edge':
      return `建立关系：${title(op.from)} → ${PREDICATE_SPECS[op.predicate].fromLabel} → ${title(op.to)}`;
    case 'delete-edge':
      return `删除关系 ${op.id}`;
    case 'create-step':
      return `按规则「${op.rule}」从 ${op.premiseIds.map(title).join('、')} 推出${title(op.conclusionId)}`;
    case 'delete-step':
      return `删除推理步骤 ${op.id}`;
    case 'select':
      return `选中${title(op.id)}`;
    default:
      return '未知操作';
  }
}
