import { useAiConfigStore } from '../stores/useAiConfigStore';
import { useAppStore } from '../stores/useAppStore';

const PROMPT_TEMPLATE = `
You are an expert in mathematical notation and a professional note-taking assistant. Your task is to analyze an image of handwritten notes and convert it into a structured JSON format that our application can understand.

**Instructions:**

1.  **Analyze the Image:** Carefully examine the provided image and identify all distinct handwritten notes.
2.  **Structure Each Note:** For each note, determine its logical type, title, and content. The content should be transcribed into Markdown, using LaTeX for mathematical formulas (e.g., \\( E=mc^2 \\) for inline math, and \\[ \\sum_{i=1}^n i = \\frac{n(n+1)}{2} \\] for block math).
3.  **Determine Relationships:** If the notes have a clear hierarchical relationship (e.g., a main topic with sub-points), reflect this using the \`parentId\` and \`insertAfterNodeId\` fields. For the first note in a sequence, you can omit \`insertAfterNodeId\`.
4.  **Output JSON:** Your final output **must** be a valid JSON array of "AiOperation" objects. Do not include any explanatory text, code block markers (\`\`\`json\`), or any other characters outside of the JSON array.

**JSON Output Format:**

The output must be an array of objects, where each object represents a single action to be performed.

\`\`\`json
[
  {
    "type": "add_node",
    "payload": {
      "nodeData": {
        "type": "...", // Can be '定义', '定理', '笔记', '例题', etc.
        "title": "...", // A concise title for the note
        "content": "...", // The transcribed content in Markdown/LaTeX
        "parentId": "...", // The ID of the parent node this note belongs to
        "children": []
      },
      "parentId": "...", // Must be the same as nodeData.parentId
      "insertAfterNodeId": "..." // Optional: The ID of the previous sibling node
    }
  }
]
\`\`\`

**Context for the current task:**

- The user wants to add these notes under the parent node with ID: **{parentId}**.
- The last sibling node (if any) has the ID: **{lastChildId}**. Use this for the \`insertAfterNodeId\` of the *first* new note to ensure correct ordering.

Please begin processing the image now.
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
  
  const parentNode = await useAppStore.getState().setSelectedNodeById(targetParentId).then(() => useAppStore.getState().selectedNode);
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

  if (activePreset.provider === 'gemini') {
    if (!data.candidates || !data.candidates[0].content.parts[0].text) {
      console.error("Unexpected Gemini response format:", data);
      throw new Error("Failed to parse Gemini response.");
    }
    return data.candidates[0].content.parts[0].text;
  } else { // openai compatible
    if (!data.choices || !data.choices[0].message.content) {
      console.error("Unexpected OpenAI response format:", data);
      throw new Error("Failed to parse OpenAI response.");
    }
    return data.choices[0].message.content;
  }
}
