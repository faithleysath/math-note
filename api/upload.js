import { put } from '@vercel/blob';

/**
 * 把一份图谱快照传到 Blob，返回只读分享用的地址。
 *
 * 这是唯一一个公开的写接口，所以必须自己把关：
 * - 只接受 JSON
 * - 限制大小（默认 2MB）
 * - 如果配置了 SHARE_TOKEN，则必须带上
 */
const MAX_BYTES = 2 * 1024 * 1024;

export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } },
};

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed');
  }

  const expectedToken = process.env.SHARE_TOKEN;
  if (expectedToken) {
    const provided = request.headers['x-share-token'];
    if (provided !== expectedToken) {
      return response.status(401).json({ error: '分享口令不正确。' });
    }
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;

    if (!body || typeof body !== 'object' || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return response.status(400).send('Invalid JSON format: "nodes" and "edges" arrays are required.');
    }

    if (body.nodes.length > 50000 || body.edges.length > 100000) {
      return response.status(413).send('Snapshot too large.');
    }

    const buffer = Buffer.from(JSON.stringify(body), 'utf-8');
    if (buffer.byteLength > MAX_BYTES) {
      return response.status(413).send(`Snapshot larger than ${MAX_BYTES} bytes.`);
    }

    const blob = await put(`notes-${crypto.randomUUID()}.json`, buffer, {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
    });

    return response.status(200).json({ url: blob.url });
  } catch (error) {
    console.error('Upload failed:', error);
    if (error instanceof SyntaxError) {
      return response.status(400).send('Invalid JSON body.');
    }
    return response.status(500).send('Internal Server Error');
  }
}
