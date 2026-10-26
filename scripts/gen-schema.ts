/**
 * 生成 examples/v8.schema.json 与 examples/v9.schema.json（外部程序用的 JSON Schema）。
 * 权威定义在 src/lib/schema.ts，这里只负责导出。
 *
 *   bun run gen:schema
 */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { graphJSONSchema, graphJSONSchemaV9 } from '../src/lib/schema';

const description =
  '约束的权威定义在 src/lib/schema.ts 与 src/lib/validate.ts；本文件由 scripts/gen-schema.ts 生成。';

const base = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
} as const;

const v8 = {
  ...base,
  $id: 'https://github.com/faithleysath/textbook-graph/examples/v8.schema.json',
  title: '教材图谱 v8 导入格式',
  description: `教材图谱知识图谱 v8 的导入/导出格式。${description}`,
  ...z.toJSONSchema(graphJSONSchema, { io: 'input', target: 'draft-2020-12' }),
};

const v9 = {
  ...base,
  $id: 'https://github.com/faithleysath/textbook-graph/examples/v9.schema.json',
  title: '教材图谱 v9 导入格式',
  description: `教材图谱知识图谱 v9 的导入/导出格式：v8 的全部字段，加上本地媒体资源（assets）与出处锚点（anchors）。v8 备份可由应用自动迁移。${description}`,
  ...z.toJSONSchema(graphJSONSchemaV9, { io: 'input', target: 'draft-2020-12' }),
};

writeFileSync(new URL('../examples/v8.schema.json', import.meta.url), JSON.stringify(v8, null, 2) + '\n');
console.log('examples/v8.schema.json 已更新');
writeFileSync(new URL('../examples/v9.schema.json', import.meta.url), JSON.stringify(v9, null, 2) + '\n');
console.log('examples/v9.schema.json 已更新');
