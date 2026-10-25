/**
 * 生成 examples/v5.schema.json（外部脚本用的 JSON Schema）。
 * 权威定义在 src/lib/schema.ts，这里只负责导出。
 *
 *   bun run gen:schema
 */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { graphJSONSchema } from '../src/lib/schema';

const v5 = graphJSONSchema.extend({ schemaVersion: z.literal(5) });
const schema = z.toJSONSchema(v5, { io: 'input', target: 'draft-2020-12' });

const out = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/faithleysath/math-note/examples/v5.schema.json',
  title: 'Math Note v5 导入格式',
  description:
    'Math Note 知识图谱 v5 的导入/导出格式。约束的权威定义在 src/lib/schema.ts 与 src/lib/validate.ts；本文件由 scripts/gen-schema.ts 生成。',
  ...schema,
};

writeFileSync(new URL('../examples/v5.schema.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('examples/v5.schema.json 已更新');
