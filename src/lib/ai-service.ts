import { useAiConfigStore } from '../stores/useAiConfigStore';
import { useAppStore } from '../stores/useAppStore';
import { getNode } from './data-provider';

const TYPES_DEFINITION = `
// TypeScript 类型定义

/**
 * 代表知识图谱中的一个内容单元。
 */
export interface Node {
  id: string;
  type: '分支' | '主章节' | '子章节' | '定义' | '定理' | '引理' | '推论' | '例题' | '笔记' | '练习' | '解题记录';
  title: string;
  content: string;
  solution?: string;
  parentId: string | null;
  children: string[];
}

/**
 * 定义了节点之间所有可能的关系类型。
 */
export type EdgeLabel = 
  | '是...的定义' | '是...的定理' | '引用' | '依赖' | '证明' | '是...的例题' 
  | '是...的练习题' | '是...的解法' | '充分条件' | '必要条件' | '充要条件';

/**
 * 代表两个节点之间的有向连接。
 */
export interface Edge {
  id: string;
  source: string;
  target: string;
  label: EdgeLabel;
  description?: string;
}

/**
 * AI 操作的统一接口。
 */
export interface AiOperation {
  type: 'add_node' | 'update_node' | 'delete_node' | 'add_edge' | 'delete_edge' | 'select_node';
  payload: AddNodePayload | UpdateNodePayload | DeleteNodePayload | AddEdgePayload | DeleteEdgePayload | SelectNodePayload;
}

// --- Payloads for each operation type ---

export interface AddNodePayload {
  nodeData: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>;
  parentId: string;
  insertAfterNodeId?: string | null;
}

export interface UpdateNodePayload {
  nodeId: string;
  updates: Partial<Omit<Node, 'id' | 'createdAt' | 'updatedAt'>>;
}

export interface DeleteNodePayload {
  nodeId: string;
}

export interface AddEdgePayload {
  edgeData: Omit<Edge, 'id'>;
}

export interface DeleteEdgePayload {
  edgeId: string;
}

export interface SelectNodePayload {
  nodeId: string;
}
`;

const PROMPT_TEMPLATE = `
您是一位精通数学符号和专业笔记的AI助手。您的任务是分析手写笔记的图像，并将其转换为我们的应用程序可以理解的一系列操作指令。

**核心指令:**

1.  **分析图像**: 仔细检查提供的图像，识别所有独立的手写笔记条目以及它们之间可能存在的操作关系（如“更新”、“关联”等）。
2.  **生成操作序列**: 根据分析，生成一个操作（operation）数组。主要操作是 \`add_node\`，但如果内容明确指示，也可以使用其他操作。
    *   **创建节点 (\`add_node\`)**:
        *   **类型 (\`type\`)**: 为每个笔记确定其逻辑类型。必须从以下允许的类型中选择：\`'分支' | '主章节' | '子章节' | '定义' | '定理' | '引理' | '推论' | '例题' | '笔记' | '练习' | '解题记录'\`。
        *   **标题 (\`title\`)**: 为笔记创建一个简洁的标题。
        *   **内容 (\`content\`)**: 将手写内容转录为Markdown格式。
            *   **数学公式**: 必须使用LaTeX语法。
                *   **行内公式**: 使用 \`$...$\`。
                *   **块级公式**: 必须独占一行并用换行符包裹，格式为 \`\\n$$\\n[equation]\\n$$\\n\`。
            *   **重要**: 在最终的JSON字符串中，所有LaTeX命令的**反斜杠都必须转义**。例如, \`\\alpha\` 必须写成 \`\\\\alpha\`。
            *   **示例**:
                *   行内公式: \`"这是一个行内公式 $y=x^\\\\alpha$"\`
                *   块级公式: \`"这是一个块级公式\\n$$\\nx\\\\in S \\\\implies x\\\\in T\\n$$\\n这是公式后的文本。"\`
    *   **其他操作**: 如果笔记内容清晰地表达了更新、删除或链接等意图，您可以使用 \`update_node\`, \`delete_node\`, 或 \`add_edge\` 等操作。
3.  **确定层级关系**:
    *   对于 \`add_node\` 操作，如果笔记之间有明显的层级关系，请使用 \`parentId\` 和 \`insertAfterNodeId\` 字段来反映这一点。
    *   所有新笔记的 \`parentId\` 都应该是当前任务的父节点ID。
    *   对于序列中的第一个新笔记，使用提供的 \`lastChildId\` 作为其 \`insertAfterNodeId\`。后续笔记应以上一个刚创建的笔记ID作为其 \`insertAfterNodeId\`。
4.  **生成JSON输出**:
    *   您的最终输出**必须**是一个严格遵循以下格式的JSON对象：\`{ "operations": [...] }\`。
    *   **绝对不要**在JSON对象之外包含任何解释性文本、代码块标记（如 \`\`\`json\`）或任何其他字符。

**JSON 输出格式:**

输出必须是一个JSON对象，其中包含一个名为 "operations" 的键，其值是一个对象数组。

\`\`\`json
{
  "operations": [
    {
      "type": "add_node",
      "payload": {
        "nodeData": {
          "type": "...",
          "title": "...",
          "content": "...",
          "parentId": "...", // 必须与 payload.parentId 相同
          "children": []
        },
        "parentId": "...", // 必须是当前任务的父节点ID
        "insertAfterNodeId": "..." // 可选：前一个兄弟节点的ID
      }
    }
  ]
}
\`\`\`

**类型定义参考:**

为了帮助您理解数据结构，这里是相关的TypeScript类型定义：
\`\`\`typescript
${TYPES_DEFINITION}
\`\`\`

**当前任务上下文:**

*   用户希望在父节点 (ID: **{parentId}**) 下添加这些笔记。
*   该父节点下的最后一个兄弟节点 (如有) 的ID是: **{lastChildId}**。请将此ID用作您创建的*第一个*新笔记的 \`insertAfterNodeId\`，以确保顺序正确。

请立即开始处理图像。
`;

/**
 * Processes a handwritten note image using the configured AI model.
 * @param imageBase64 The base64 encoded image data.
 * @param parentId The ID of the parent node for the new notes.
 * @returns A promise that resolves to the AI's response text.
 */
export async function processHandwritingImage(imageBase64: string, parentId: string): Promise<string> {
  const { getActivePreset } = useAiConfigStore.getState();
  const { rootNodes, expandedBranchId } = useAppStore.getState();

  const activePreset = getActivePreset();
  if (!activePreset) {
    throw new Error("No active AI preset configured.");
  }
  if (!activePreset.apiKey) {
    throw new Error(`API key for preset "${activePreset.name}" is missing.`);
  }

  const targetParentId = parentId || expandedBranchId || rootNodes[0]?.id;
  if (!targetParentId) {
    throw new Error("Cannot determine a parent node to add the notes to.");
  }
  
  const parentNode = await getNode(targetParentId);
  const lastChildId = parentNode?.children[parentNode.children.length - 1] || null;

  const filledPrompt = PROMPT_TEMPLATE
    .replace('{parentId}', targetParentId)
    .replace('{lastChildId}', lastChildId || 'null');

  const headers: { [key: string]: string } = {
    'Content-Type': 'application/json',
  };
  let body;
  
  const imageData = imageBase64.split(',')[1]; // Remove the "data:image/jpeg;base64," prefix

  let finalUrl = '';

  if (activePreset.provider === 'gemini') {
    // For Gemini, the API key is in the query params
    finalUrl = `${activePreset.baseUrl}/${activePreset.modelName}:generateContent?key=${activePreset.apiKey}`;
    body = {
      contents: [{
        parts: [
          { text: filledPrompt },
          { inline_data: { mime_type: 'image/jpeg', data: imageData } }
        ]
      }],
      generationConfig: { response_mime_type: "application/json" }
    };
  } else if (activePreset.provider === 'openai') {
    // For OpenAI compatible, the key is in the header
    finalUrl = `${activePreset.baseUrl}/chat/completions`;
    headers['Authorization'] = `Bearer ${activePreset.apiKey}`;
    body = {
      model: activePreset.modelName,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: filledPrompt },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }
      ],
      max_tokens: 4096,
      response_format: { type: "json_object" }
    };
  } else {
    throw new Error(`Unsupported provider type: ${activePreset.provider}`);
  }

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("AI API Error:", errorBody);
    throw new Error(`AI API request failed with status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();

  // For both providers, we now expect a JSON object with an "operations" key.
  // The actual content is a string that needs to be parsed again.
  let responseContent;
  if (activePreset.provider === 'gemini') {
    if (!data.candidates || !data.candidates[0].content.parts[0].text) {
      console.error("Unexpected Gemini response format:", data);
      throw new Error("Failed to parse Gemini response.");
    }
    responseContent = data.candidates[0].content.parts[0].text;
  } else { // openai compatible
    if (!data.choices || !data.choices[0].message.content) {
      console.error("Unexpected OpenAI response format:", data);
      throw new Error("Failed to parse OpenAI response.");
    }
    responseContent = data.choices[0].message.content;
  }

  try {
    // The response itself is a JSON string, which we parse to get the object.
    const parsedObject = JSON.parse(responseContent);
    if (parsedObject && Array.isArray(parsedObject.operations)) {
      // We return the stringified version of the operations array to the caller.
      return JSON.stringify(parsedObject.operations);
    } else {
      throw new Error("The 'operations' key was not found or is not an array in the AI response.");
    }
  } catch (e) {
    console.error("Failed to parse the inner JSON from AI response:", e);
    console.error("Raw response content:", responseContent);
    throw new Error("AI response was not in the expected format: { \"operations\": [...] }");
  }
}
