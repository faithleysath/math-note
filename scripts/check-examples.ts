import { readFileSync, readdirSync } from 'node:fs';
import { parseGraph } from '../src/lib/serialize';

for (const file of readdirSync(new URL('../examples', import.meta.url)).filter(
  (name) => name.endsWith('.json') && name !== 'v8.schema.json',
)) {
  const parsed = parseGraph(
    JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8')),
  );
  console.log(file, 'OK', parsed.book.subject, parsed.nodes.length, 'nodes', parsed.warnings.length, 'warnings');
  for (const warning of parsed.warnings) console.log('  warning:', warning.code, warning.message);
}
