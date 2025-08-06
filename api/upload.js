import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await request.json();

    // Strict validation
    if (!body || typeof body !== 'object' || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return new Response('Invalid JSON format: "nodes" and "edges" arrays are required.', { status: 400 });
    }

    const jsonString = JSON.stringify(body);
    const blob = await put(`notes-${uuidv4()}.json`, jsonString, {
      access: 'public',
      contentType: 'application/json',
    });

    return new Response(JSON.stringify({ url: blob.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Upload failed:', error);
    if (error instanceof SyntaxError) {
      return new Response('Invalid JSON body.', { status: 400 });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}
