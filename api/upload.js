import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).send('Method Not Allowed');
  }

  try {
    const { nodes, edges, expirationInSeconds } = request.body;

    // Strict validation
    if (!nodes || !edges || !Array.isArray(nodes) || !Array.isArray(edges)) {
      return response.status(400).send('Invalid JSON format: "nodes" and "edges" arrays are required.');
    }

    // Default to 1 year if expiration is not provided or invalid
    const cacheAge = typeof expirationInSeconds === 'number' && expirationInSeconds > 0 
      ? expirationInSeconds 
      : 31536000;

    const dataToStore = { nodes, edges };
    const jsonString = JSON.stringify(dataToStore);
    const buffer = Buffer.from(jsonString, 'utf-8');
    
    const blob = await put(`notes-${uuidv4()}.json`, buffer, {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      cacheControlMaxAge: cacheAge,
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
