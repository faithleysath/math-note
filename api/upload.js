import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed');
  }

  try {
    const body = request.body;

    // Strict validation
    if (!body || typeof body !== 'object' || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return response.status(400).send('Invalid JSON format: "nodes" and "edges" arrays are required.');
    }

    const jsonString = JSON.stringify(body);
    const blob = await put(`notes-${uuidv4()}.json`, jsonString, {
      access: 'public',
      contentType: 'application/json',
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
