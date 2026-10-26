# 任务书：分章中间格式与合并器（`book-part.ts`）

> 上位规范：`docs/plans/transcribe-spec.md` §10（字段归属）、§0.1（确定性）、§0.3（覆盖率）。
> 执行者：子代理。**禁止创建子代理。**

## 目标

现在只有「转写规约」这份文本，没有任何机制能机械判断子代理是否遵守它。
本任务补上**中间格式的 zod schema + 合并器 + 校验器**，让「分章 JSON → 正式 v9」这条路可校验、可复现。

## 1. 新建 `src/lib/book-part.ts`

### 1.1 分章中间格式（`BookPartSchema`，全部 `z.strictObject`）

```ts
interface BookPart {
  meta: {
    volume: string;              // 'b8a' | 'b8b' | 'b9a' | 'b9b'
    chapter: string;             // 章节点 id，如 'phy-b8a-c04'（一章一份 part）
    pdfPageRange: [number, number];
    printedPageRange: [string, string];
    agent: string;
  };
  nodes: PartNode[];             // 无 order / createdAt / updatedAt / assertedBy
  edges: PartEdge[];             // 无 id / assertedBy / 时间戳
  steps: PartStep[];             // 无 id / assertedBy / 时间戳
  assets: PartAsset[];
  exceptions: PartException[];
}
```

- `PartNode`：`id / type / kind? / title / content / solution? / parentId / key? / aliases? / tags? / citation?`
  字段与 kind 枚举**复用** `src/lib/schema.ts` 的 `nodeSchema`，用 `.omit()` 去掉 `order`/`createdAt`/`updatedAt`，**不要**另抄一份字段定义。
- `PartEdge`：`from / to / predicate / condition? / note? / contextId?`
- `PartStep`：`premiseIds / conclusionId / rule / contextId? / proofId? / note?`
- `PartAsset`：
  ```ts
  { id: string; caption?: string; alt: string; pdfPage: number;
    region?: Region; regionOmittedReason?: string; nodeId: string }
  ```
  约束：`region` 与 `regionOmittedReason` **恰好二选一**（refine 实现，报错信息说清）。
- `PartException`：`{ srcId?: string; reason: string; originalText?: string }`

### 1.2 `validateBookPart(part, expected?)` → `ValidationIssue[]`

复用 `src/lib/validate.ts` 已有的 `ValidationIssue` 类型和代码风格。必须检查：

1. **越权字段**：出现 `order`/`createdAt`/`updatedAt`/`assertedBy`/`edges[].id`/`steps[].id` 直接 error（strict schema 已经会拦，但错误信息要说人话：「order 由合并器生成，转写侧不得填写」）
2. **全章图校验**：把 part 补齐成 v8 形状（补 order/时间戳/assertedBy 为占位值）后调用现成的 `validateGraphInvariants`，把父子类型、关系端点、`supports` 起点、`depends-on` 无环等**全部复用**，不要重写一套
3. **`srcId` 覆盖率**（传了 `expected` 时）：`expected.items[].srcId` 必须被 `nodes[].id` 前缀或 `tags` 里的 `src:<srcId>` 覆盖；`missing`/`duplicate` 分别报，`exceptions[].srcId` 命中算已登记例外
4. **`asset://` 闭合**：`content`/`solution` 里引用的每个 asset id 必须在本 part 的 `assets` 里；反之 `assets` 里未被引用 → warning
5. **`pdfPage` 归属**：`assets[].pdfPage` 必须落在 `meta.pdfPageRange` 内
6. **命名规范**：`id` 是否符合 §2 的格式（正则），不符合 → warning（历史数据兼容），但 `branch`/`section`/内容节点用错前缀体系 → error

### 1.3 `mergeBookParts(parts: BookPart[], book: BookMetaV9)` → `GraphJSONV9`

规则：

- **order**：同一 `parentId` 下按 part 内出现顺序，`(i + 1) * 1024`
- **时间戳**：取合并时刻，`createdAt === updatedAt`
- **edge / step id**：`${part.meta.chapter}-e${三位序号}`、`${part.meta.chapter}-i${三位序号}`，序号在合并结果里**全局递增**，与 part 输入顺序无关的确定性排序（先按 `meta.volume`、再按 `meta.chapter`、再按 part 内位置）
- **assertedBy**：一律 `'import'`
- **anchors**：从每个 `assets[]` 生成一条 `SourceAnchor`
  `{ id: '<assetId>-anchor', nodeId, sourceId: '<volume>', pageLabel: <印刷页码>, region }`
  `pageLabel` 由 `manifest` 提供的 `pageOffset` 换算不了时**留空字符串**，不许猜。`region` 缺失的 asset 不产 anchor。
- **确定性**：同样的输入必须产出**逐字节相同**的结果（`exportedAt` 除外）。为此不要用 `Math.random()`、`Date.now()` 之外的任何非确定性来源，数组顺序不依赖对象 key 顺序。
- **ID 冲突**：跨 part 出现重复 node id → 直接抛错，指出两个来源 part
- **实体注册表**：接受可选 `entities?: EntityEntry[]`，合并后返回 `{ graph, entities }`；核心概念 `key` 在原注册表里已存在但 `id` 不同 → warning（疑似重复建节点）

### 1.4 导出

```ts
export { BookPartSchema, type BookPart };
export function validateBookPart(part: unknown, expected?: ExpectedManifest): ValidationIssue[];
export function mergeBookParts(parts: BookPart[], book: BookMetaV9, opts?: { entities?: EntityEntry[] }): { graph: GraphJSONV9; entities: EntityEntry[] };
export function coverageOf(part: BookPart, expected: ExpectedManifest): {
  total: number; mapped: number; exception: number; missing: number; duplicate: number; undecided: number;
  missingSrcIds: string[];
};
```

`coverageOf` 的分子只算 `mapped + exception`，`undecided` 单列（对应规约 §0.3）。

## 2. 测试 `src/lib/book-part.test.ts`

必须覆盖：

1. 合法最小 part 通过校验
2. 出现 `order` 字段 → 报「order 由合并器生成」
3. `proposition` 挂在 `note` 下 → 父子类型报错（复用 `allowedChildTypes`）
4. `supports` 起点不是 `note(experiment)` → 报错
5. `depends-on` 成环 → 报错
6. `asset://` 引用不存在的 asset → 报错；未被引用的 asset → warning
7. `region` 与 `regionOmittedReason` 同时存在 / 同时缺失 → 报错
8. `assets[].pdfPage` 超出 `meta.pdfPageRange` → 报错
9. 覆盖率：清单 5 条，映射 3 条、例外 1 条、漏 1 条 → `mapped=3, exception=1, missing=1`，`结构覆盖率` 由调用方算
10. `mergeBookParts` 的 order 是 1024 递增、edge id 按 chapter 前缀全局递增
11. **确定性**：同一批 part 合并两次（固定 `exportedAt`），JSON 序列化结果完全一致

## 3. 自测（必须全跑，贴结果）

```bash
bun run test && bun run lint && bun run build && bun run check:examples
```

## 禁止

- 不改 `schema.ts`、`coords.ts`、`db.ts`、`validate.ts` 的既有行为（可以 import 复用）
- 不写 CLI 脚本（下一轮单独做）
- 不新增依赖
- 不实现 PDF 解析、图像裁切
- 不创建子代理

## 汇报

说明导出清单、与规约 §10 有无偏差、覆盖率六项计数的实际含义、测试数量、确定性测试怎么做的。
