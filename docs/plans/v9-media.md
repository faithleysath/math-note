# 任务书：v9 数据格式 + 本地媒体资源（L1 范围）

> 执行者：子代理。阅读本文件 + `src/lib/schema.ts`、`serialize.ts`、`db.ts`、`markdown.ts`、`validate.ts`（只看相关片段）。
> **禁止创建子代理。** 禁止大范围重构。改完必须自测全绿再交付。

## 目标

在保留 v8 全部语义的前提下，引入 v9 数据交换格式与本地媒体资源（`asset://`）支持。
`SourceAnchor` 只定义类型和字段，**不实现读写 UI**。不做 `.tbg` ZIP 打包。

## 1. `src/lib/schema.ts`

保持 v8 的 `SCHEMA_VERSION = 8`、`GraphJSON`、`graphJSONSchema`、`Node`/`Edge`/`InferenceStep` 一行不改（现有测试依赖）。

新增：

```ts
export interface AssetMeta {
  id: string;            // 与 markdown 里 asset://<id> 对应
  path: string;          // 包内相对路径，如 assets/img-001.png
  mimeType: string;
  byteLength: number;
  sha256: string;        // 64 位小写 hex
  alt: string;
  originalName?: string;
}

export interface SourceAnchor {
  id: string;
  nodeId: string;
  sourceId: string;
  pageLabel: string;
  region?: { x: number; y: number; width: number; height: number }; // 归一化 0..1
  contentRange?: { start: number; end: number; contentHash: string };
}

export interface BookMetaV9 extends BookMeta {
  bookId?: string;
  publisher?: string;
  publicationYear?: number;
  isbn?: string;
  volume?: string;
  sourceRevision?: string;
}

export interface GraphJSONV9 {
  schemaVersion: 9;
  exportedAt: number;
  book: BookMetaV9;
  nodes: Node[];
  edges: Edge[];
  steps?: InferenceStep[];
  anchors: SourceAnchor[];
  assets: AssetMeta[];
}
```

对应的 zod schema 一律 `z.strictObject`：
- `assetMetaSchema`：`id`/`path`/`mimeType` 非空字符串，`byteLength` 正整数，`sha256` 用正则 `/^[0-9a-f]{64}$/`，`alt` 字符串，`originalName` 可选
- `sourceAnchorSchema`：`region` 四个数都在 0..1，`width`/`height` > 0；`contentRange` 的 `start >= 0`、`end >= start`
- `graphJSONSchemaV9`：`schemaVersion: z.literal(9)`，`anchors` / `assets` 都 `.default([])`
- `bookMetaV9Schema = bookMetaSchema.extend({...全部 optional})`

## 2. 新建 `src/lib/migrations/v8-to-v9.ts`

```ts
export function migrateV8ToV9(g: GraphJSON): GraphJSONV9
```
纯函数。只补 `schemaVersion: 9`、`anchors: []`、`assets: []`。
**nodes / edges / steps / book 的每个字段原样透传**，不重新编号、不排序、不改 `createdAt`/`updatedAt`。

## 3. `src/lib/serialize.ts`

- `serializeGraph(book, nodes, edges, steps = [], extras?: { anchors?: SourceAnchor[]; assets?: AssetMeta[] })`：默认导出 v9，`extras` 缺省补空数组
- `parseGraph` 改为按版本分发：
  - `9` → `graphJSONSchemaV9.parse`
  - `8` → `graphJSONSchema.parse` 后 `migrateV8ToV9`，并在 `warnings` 里加一条 `severity: 'warning'`、说明「已从 v8 自动迁移」
  - `7` 以及其它 → 沿用现有报错文案（v7 那句话说清「只接受 v9，v8 会自动迁移」）
- 返回的 `ParsedGraph` 增加 `anchors: SourceAnchor[]`、`assets: AssetMeta[]`
- 校验失败绝不返回部分数据，行为与现在一致

## 4. `src/lib/validate.ts`

只**新增**检查，不改既有逻辑：
- 从 `nodes[].content` / `solution` 里用正则扫 `asset://([\w.-]+)`，收集被引用的 asset id
  - 引用了但 `assets` 里没有 → `severity: 'error'`，message 指出哪个节点引用了哪个缺失 id
  - `assets` 里有但没人引用 → `severity: 'warning'`
- assets 内 id 重复 → error
- anchors 的 `nodeId` 必须指向现有节点 → error
- 新增的检查要能通过参数开关跳过（给老调用点加个可选 options 或单独的导出函数 `validateAssetIntegrity`），**别让现有的 `validateGraphInvariants(parsed)` 因缺少 assets 字段而崩**

## 5. `src/lib/db.ts`

- 构造函数里追加：
  ```ts
  this.version(2).stores({
    nodes: '&id, type, key, parentId',
    edges: '&id, from, to, predicate',
    steps: '&id, conclusionId, *premiseIds',
    meta: '&id',
    assets: '&id',
  });
  ```
  **库名 `textbook-graph-v8` 绝对不许改。**
- 新增 `assets!: Table<AssetRecord, string>`，`AssetRecord = AssetMeta & { data: Blob }`
- `loadAll()` 多返回 `assets: AssetMeta[]`（**不带 blob**）
- `replaceAll()` 增加可选 `assets?: AssetRecord[]`，与其它表在**同一事务**里 clear + bulkAdd
- `clearAll()` 一并清 assets
- 新增 `getAssetBlob(id)`、`putAssets(list)`、`removeAssets(ids)`

## 6. `src/lib/markdown.ts` + 渲染链路

- 模块内维护 `Map<string, string>`（asset id → Blob URL）
- 导出 `registerAssetUrl(id, url)`、`releaseAssetUrls()`（释放所有已注册 URL）
- 新增 rehype 插件 `rehypeAssetScheme`：遍历 hast，把 `img[src^="asset://"]` 的 src 换成缓存值；
  - 命中 → 正常显示
  - 未命中 → `src` 置空、加 `data-missing-asset="<id>"`、`className += ' asset-missing'`、`alt` 保留
- `markdownPlugins()` 返回值签名不变，把新插件追加进 `rehypePlugins`
- 不改各 renderer 组件（它们已经用 `markdownPlugins()`）

## 7. `scripts/gen-schema.ts`

同时产出 `examples/v8.schema.json`（保持不变）与 `examples/v9.schema.json`（`$id` 指向 v9，标题写「教材图谱 v9 导入格式」）。

## 8. 测试

新增 `src/lib/v9.test.ts`：
- 把 `examples/v8-physics.json` 读进来 → `parseGraph` → 断言得到 v9、`assets`/`anchors` 为空、且 nodes/edges/steps 的每个 id 与 content 与原始 JSON **完全一致**
- v9  serialize → parse 往返一致（忽略 `exportedAt`）
- 未知顶层字段（如 `"foo": 1`）在 v9 严格模式下被拒
- 节点里引用 `asset://img-404` 但 assets 为空 → 抛错

新增 `src/lib/assets.test.ts`（放在检查函数的纯逻辑层）：
- path 含 `..`、以 `/` 开头、含 `//` → 拒
- `mimeType` 不在白名单（`image/png`、`image/jpeg`、`image/webp`、`image/svg+xml` 先拒、留 TODO）→ 拒
- `sha256` 非 64 位 hex → 拒
- `byteLength` 超上限（建议 8 MiB）→ 拒
- 这些检查请新建 `src/lib/assets.ts` 放进去，`db.ts` / `serialize.ts` 复用

如果需要测 Dexie 单表，参考 `src/lib/persistence.test.ts` 里的 `fake-indexeddb/auto` 用法，别装新依赖。

## 验收（必须自己跑，贴结果）

```bash
bun run test
bun run lint
bun run build
bun run gen:schema
bun run check:examples
```

`check:examples` 里 5 个 v8 样例必须全部 OK（走迁移路径）。

## 禁止

- 不改 IndexedDB 库名
- 不实现 `SourceAnchor` 的读写、不做 `.tbg`
- 不新增依赖
- 不碰 `predicates.ts`、`graph.ts`、`numbering.ts`、UI 组件
- 不创建子代理
