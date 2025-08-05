export const config = {
  runtime: 'edge',
};

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com';

export default async function handler(req) {
  try {
    const { search, pathname } = new URL(req.url);
    
    // 1. 移除代理前缀，获取真实的 Gemini API 路径
    const slug = pathname.replace('/api/geminiProxy', '');

    // 2. 优先从 URL query 获取 key，否则回退到环境变量
    const apiKey = new URL(req.url).searchParams.get('key') || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key is missing. Provide it via ?key=... or set GEMINI_API_KEY environment variable.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. 构建目标 Gemini API URL，并移除我们自己的 'key' 参数
    const searchParams = new URLSearchParams(search);
    searchParams.delete('key');
    const geminiUrl = `${GEMINI_API_BASE_URL}${slug}?${searchParams.toString()}`;

    // 4. 判断请求是流式还是标准
    const isStreaming = slug.includes(':streamGenerateContent');

    // 5. 使用 fetch 将请求转发到 Gemini API
    const geminiResponse = await fetch(geminiUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      // 直接传递客户端的请求体
      body: req.body,
    });

    // 6. 根据请求类型处理响应
    if (isStreaming) {
      // 对于流式请求，直接返回 Gemini 的 ReadableStream
      return new Response(geminiResponse.body, {
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    } else {
      // 对于标准请求，创建一个新的流来规避 Vercel 超时
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // 等待完整的响应
            const data = await geminiResponse.json();
            // 将完整数据作为单个块推入流
            controller.enqueue(new TextEncoder().encode(JSON.stringify(data)));
            controller.close();
          } catch (error) {
            console.error('Error processing standard Gemini response:', error);
            // 尝试获取文本错误信息
            const errorText = await geminiResponse.text();
            controller.error(new Error(`Failed to process Gemini response: ${errorText}`));
          }
        },
      });

      return new Response(stream, {
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }
  } catch (error) {
    console.error('Error in Gemini proxy handler:', error);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
