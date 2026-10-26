# 数学笔记

把一本初中/高中数学教材转成一份独立知识图谱的纯前端编辑器：按目录组织内容，用带语义的关系把定义、命题、证明、题目连成网，数据存在自己的浏览器里。

线上示例：<https://math-note-delta.vercel.app>

## 一教材一知识库

- 每本教材 = 一份独立的 JSON / 一套独立的节点、关系、推理步骤。不同教材之间没有共享节点、统一知识 ID 或自动去重。
- `id` 和 `key` 只在**当前知识库内部**唯一；两本教材各有一个 `pythagorean-theorem` 完全合法。
- 软件一个数据库只保存一个活动知识库，导入即整库替换；切换教材靠导入各自的 JSON。
- 所有搜索、编号、校验、推理都只在当前活动知识库内进行。

## 模型：9 种节点 + 9 种关系 + 可选推理步骤

### 节点

| `type` | 语义 | `kind` |
|---|---|---|
| `branch` | 根知识分支 | — |
| `section` | 任意深度知识目录 | `chapter` / `section` / `subsection` / `topic` |
| `definition` | 概念及其定义 | `notation` |
| `proposition` | 有真假意义的数学断言 | `theorem` / `lemma` / `corollary` / `property` / `formula` / `criterion` / `claim` |
| `proof` | 独立证明文本 | `direct` / `contradiction` / `induction` / `geometric` / `other` |
| `problem` | 例题、练习、探究题 | `example` / `exercise` / `exploration` / `review` |
| `note` | 讲解、方法、总结、数学文化、语境 | `explanation` / `method` / `summary` / `history` / `context` / `topic` / `remark` |
| `counterexample` | 否定某一断言的反例 | `numerical` / `geometric` / `other` |
| `attempt` | 一次个人解题过程 | `personal` / `review` |

「定理 / 引理 / 推论」不再是独立类型，而是 `proposition.kind`；「例题 / 练习」是 `problem.kind`；
「章节 / 小节」是 `section.kind`。`section` 可以任意嵌套，不设固定两层。

`kind` 是强类型属性：新建/编辑只能从对应枚举里选；导入历史数据时未知 `kind` 会暂存并告警。

### 关系

统一 `from → predicate → to`，方向永远是主语 → 宾语。

| 谓词 | 起点 → 终点 | 说明 |
|---|---|---|
| `depends-on` | 可学习内容 → section / definition / proposition / note | 学习前置；用于拓扑排序；**要求无环**；不等于数学蕴含 |
| `covers` | problem → definition / proposition / note | 题目考查的知识点；不传递 |
| `uses` | proof / attempt / problem / note → definition / proposition / note | 证明或解法实际用到的依据；不传递 |
| `proves` | proof → proposition | 证明归属；不代表证明过程已被验证 |
| `refutes` | counterexample → proposition | 反例针对明确命题 |
| `implies` | proposition → proposition | 有条件蕴含；允许双向与合法环 |
| `iff` | proposition ↔ proposition | 同一语境下的等价；单条规范化存储、双向查看 |
| `generalizes` | definition → definition 或 proposition → proposition | 推广；不自动当作蕴含 |
| `cites` | 任意非 branch 内容 → 任意非 branch 内容 | 弱引用；不传递 |

每条关系还可以带：

- `condition`：文本化前提（LaTeX），原样保存与展示，不做语义解析
- `contextId`：指向 `note(kind='context')`，可选；缺省表示未说明语境
- `note`：给这条关系自己的备注

选中一个定义或命题时，右侧会列出「考查此知识点的题目」（`covers` 反向查询）；选中一道题则列出「本题考查的知识点」。
搜索框下方可以按类型 / 细分筛选，只选筛选器不输关键词时就是按类型浏览。

去重键是「谓词 + 端点（`iff` 无序）+ 语境 + 规范化条件」。端点相同但条件不同的两条边是两条断言，都会保留，不会互相删除。

### 推理步骤（超边）

二元边只能表达 OR（任一前提足够）。需要多个前提同时成立时（AND）用独立的 `InferenceStep`：

```jsonc
{
  "premiseIds": ["uuid-continuous", "uuid-closed-interval"],  // 全部成立才够
  "conclusionId": "uuid-bounded",
  "rule": "紧集上连续函数有界",
  "contextId": "uuid-context",
  "proofId": "uuid-proof"
}
```

它不参与目录树、没有位置和编号。推理引擎是前向链式：先走 `implies`/`iff`，再看哪些步骤的所有前提都成立；
每条结果都带「依据 + 路径上的文字条件 + 语境」。前提和结论都必须是 `proposition`。

### 编号

- `section(kind=chapter)` → `第 n 章`；其余 section 按祖先 section 路径 → `1.2`、`1.2.3`
- `definition` / `proposition` / `problem` → `${kind 标签} ${章节路径}.${同类序号}`，例如 `性质 2.1.1`、`例题 2.1.3`
- 引用只能靠 `id` / `key`，不要依赖会随移动变化的编号

## 结构与推理是两回事

- **目录不是逻辑**：`parentId` 只决定内容排在哪里，不代表依赖或蕴含。
- **引用不是依赖**：`cites` 只是提到，`depends-on` 是学习前置，`uses` 才是证明里真正用到。
- **关系即事实**：建立了 `A depends-on B`、`P covers K`、`A implies B` 就表示知识库正在表达这件事；
  不存在「先建边再标记真伪」的状态机。关系不成立就不该建。
- **不自动推导**：编辑器不会从已有关系里替你推出新结论，界面只展示你亲手录入的内容。
  `implies` / `iff` / 推理步骤是结构化记录，留给以后按需查询，不是自动证明器。
- **证明不是验证**：`proof --proves--> proposition` 只表示存在一份声称证明的文档，不代表证明过程已被机器检查。

## 数据

- 全部存在浏览器 IndexedDB（数据库 `math-note-graph-v6`），不联网、不登录。
- 「导出」下载 v6 JSON，「导入」整份替换（二次确认，失败不改动原数据）。
- 「分享」把快照传到 Vercel Blob，生成只读链接 `?note_url=…`。

### 导入格式

只有 v6 一种格式。`schemaVersion` 不是 6、结构不对或全图校验不通过，导入会被整个拒绝，现有数据不会变。
旧版本（v5 及更早）不做迁移，直接拒绝；旧数据库也不会被读取。

### 给外部脚本的格式

- `examples/v6.schema.json`：JSON Schema（由 `bun run gen:schema` 从 `src/lib/schema.ts` 生成）
- `examples/v6-minimal.json`：最小样例
- `examples/v6-gaokao-sample.json`：覆盖 9 种节点与 9 种关系的完整样例

```jsonc
{
  "schemaVersion": 6,
  "exportedAt": 0,
  "nodes": [],
  "edges": [],
  "steps": []
}
```

身份规则：`id` 在同一知识库内稳定唯一（不要每次重新 `randomUUID`）；`key` 只给可复用的核心知识点；
标题可以重名，不能作为去重依据。`solution` 只给 `problem` 用（标准解答），命题的证明请建独立的 `proof` 节点。
图片用 `![描述](https://...)` 直接写进 `content` / `solution`，
图床失效只会导致图片不显示，不影响数据。

## 开发

```bash
bun install
bun dev          # http://localhost:5173
bun run test     # 编号、图算法、校验、推理（vitest）
bun run lint
bun run build
```

技术栈：React 19 + TypeScript + Vite 7 + Tailwind 4 + shadcn/ui + Zustand 5 + Dexie 4 + zod + KaTeX。

```
src/lib/schema.ts      9 种节点 / kind 枚举 / 9 种谓词 / 推理步骤 / zod
src/lib/predicates.ts  谓词注册表（方向、传递性、类型白名单、显示文案）
src/lib/graph.ts       纯函数：索引、递归编号、遍历、推理、拓扑排序、搜索
src/lib/validate.ts    全图不变式与单条校验
src/lib/serialize.ts   导入校验、导出
src/lib/citation.ts    来源字段合并（只改 source，保留 page / originalNumber）
src/lib/db.ts          Dexie 持久化
src/stores/useGraphStore.ts  内存图 + 写穿
examples/              可直接导入的 v6 样例
```

## 性能（本机实测，`bun run bench`）

| 规模 | 建索引 | 搜索 | 前置排序（1000 候选） | 导入校验 | JSON | 堆内存 |
|---|---|---|---|---|---|---|
| 5.5k 节点 / 4.5k 边 | 4 ms | 1.2 ms | 6 ms | 20 ms | 1.8 MB | 19 MB |
| 22k 节点 / 18k 边 | 17 ms | 5.7 ms | 17 ms | 44 ms | 7.3 MB | 73 MB |

全量内存 + 写穿的架构在万级节点下仍然可用；再往上（十万级）需要改增量索引。

## 已知限制

- 未形式化验证的推理只是**带依据的候选关系**，不承诺从自由文本判断真假。
- `condition` 只做保存与展示，不会自动判断两条条件是否等价。
- 不做教材/PDF 解析、图床管理、小问实体、增量合并。
- 搜索是全量线性扫描，二十万级以上需要倒排索引。

## 部署

推到 Vercel 即可。可选环境变量：

| 变量 | 作用 |
|---|---|
| `SHARE_TOKEN` | 设置后，`/api/upload` 要求请求头 `x-share-token` 匹配才允许上传 |
