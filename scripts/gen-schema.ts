/**
 * 生成 examples/v8.schema.json（外部程序用的 JSON Schema）。
 * 权威定义在 src/lib/schema.ts，这里只负责导出。
 *
 *   bun run gen:schema
 */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { graphJSONSchema } from '../src/lib/schema';

const schema = z.toJSONSchema(graphJSONSchema, { io: 'input', target: 'draft-2020-12' });

const out = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/faithleysath/textbook-graph/examples/v8.schema.json',
  title: '教材图谱 v8 导入格式',
  description:
    '教材图谱知识图谱 v8 的导入/导出格式。约束的权威定义在 src/lib/schema.ts 与 src/lib/validate.ts；本文件由 scripts/gen-schema.ts 生成。',
  ...schema,
};

writeFileSync(new URL('../examples/v8.schema.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('examples/v8.schema.json 已更新');
