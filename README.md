# 教材图谱（Textbook Graph）

把一本初高中数学、物理、化学、生物或综合科学教材转成一份独立知识图谱的纯前端编辑器：按目录保存原文，用带语义的关系把定义、命题、证明、实验、题目连成网，数据存在自己的浏览器里。

仓库：<https://github.com/faithleysath/textbook-graph>

线上示例：<https://pi.laysath.cn>

## 一教材一知识库

- 每本教材 = 一份独立的 JSON（或含图片的 `.tbg` 交换包）/ 一套独立的节点、关系、推理步骤。不同教材之间没有共享节点、统一知识 ID 或自动去重。
- `id` 和 `key` 只在**当前知识库内部**唯一；两本教材各有一个 `pythagorean-theorem` 完全合法。
- 软件一个数据库只保存一个活动知识库，导入或新建即整库替换；切换教材靠导入各自的 JSON / `.tbg`。
- 所有搜索、编号、校验都只在当前活动知识库内进行。

## 教材元信息（v8）

每份图必须带 `book`，用来选择学科配置和显示规则：

```ts
interface BookMeta {
  subject: 'math' | 'physics' | 'chemistry' | 'biology' | 'science';
  stage: 'junior' | 'senior';
  title: string;
  edition?: string;
}
```

`book` 只是这一本教材自己的身份，不是跨教材统一 ID。相同 `title` 的两份 JSON 仍然是两个互不相通的库。

## 模型：9 种节点 + 12 种关系 + 可选推理步骤

### 节点

| `type` | 语义 | `kind` |
|---|---|---|
| `branch` | 根知识分支 | — |
| `section` | 任意深度知识目录 | `chapter` / `section` / `subsection` / `topic` |
| `definition` | 概念及其定义 | `notation` |
| `proposition` | 有真假意义的断言 | `theorem` / `lemma` / `corollary` / `property` / `formula` / `criterion` / `claim` / `law` / `principle` / `reaction` |
| `proof` | 独立证明或理论推导文本 | `direct` / `contradiction` / `induction` / `geometric` / `other` |
| `problem` | 例题、练习、探究题 | `example` / `exercise` / `exploration` / `review` |
| `note` | 讲解、实验、模型、现象、过程、结构、语境 | `explanation` / `method` / `summary` / `history` / `context` / `topic` / `remark` / `experiment` / `model` / `phenomenon` / `process` / `structure` |
| `counterexample` | 否定某一断言的反例 | `numerical` / `geometric` / `other` |
| `attempt` | 一次个人解题过程 | `personal` / `review` |

`proposition` 承载定律、原理、独立化学反应式等科学断言；实验、模型、现象、过程、结构放在 `note` 的对应 kind 里，不新增底层 type。
`proof` 只用于理论证明/推导，实验不能拿来当 `proof`。

`kind` 是强类型属性：新建/编辑只能从对应枚举里选；导入历史数据时未知 `kind` 会暂存并告警。
学科配置只改变推荐顺序，不禁止跨学科 kind；数学教材里合法的实验笔记仍然可以保存。

### 学科配置

`src/lib/subjects.ts` 为五门学科提供：

- 推荐的 kind 顺序（编辑器里优先显示，其余放进「更多分类」）
- 推荐的关系顺序
- 编号策略：数学自动生成；其他理科原书编号优先，且不为 `proposition` / `note` 强行生成「定律 1.2.1」「实验 3.1」

选中「综合科学」时，五门学科的 kind 与关系都可以正常使用。

### 关系

统一 `from → predicate → to`，方向永远是主语 → 宾语。

| 谓词 | 起点 → 终点 | 说明 |
|---|---|---|
| `depends-on` | 可学习内容 → section / definition / proposition / note | 学习前置；**要求无环**；不等于数学蕴含 |
| `covers` | problem → definition / proposition / note | 题目考查的知识点；不传递 |
| `uses` | proof / attempt / problem / note → definition / proposition / note | 证明、实验或解法实际用到的依据；不传递 |
| `proves` | proof → proposition | 理论证明归属；不代表证明过程已被机器检查 |
| `refutes` | counterexample → proposition | 反例针对明确命题 |
| `implies` | proposition → proposition | 有条件蕴含；允许双向与合法环 |
| `iff` | proposition ↔ proposition | 同一语境下的等价；单条规范化存储、双向查看 |
| `generalizes` | definition → definition 或 proposition → proposition | 推广；不自动当作蕴含 |
| `cites` | 任意非 branch 内容 → 任意非 branch 内容 | 弱引用；不传递 |
| `supports` | `note(kind=experiment/phenomenon)` → proposition | 实验/观察支持科学陈述，不等于严格证明 |
| `is-a` | definition → definition | 子类属于上位类，如「哺乳动物属于脊椎动物」 |
| `part-of` | definition → definition | 部分—整体，如「细胞核是细胞的组成部分」 |

`is-a` / `part-of` 不允许自指；可疑环只警告，不会像 `depends-on` 那样硬判错误。`supports` 的起点 kind 限制在 UI、单边校验和整图导入校验中完全共用。
`is-a` 与 `part-of` 严格区分「属于某一类」和「构成某个整体」。首版不提供 `causes` 等容易标错的因果关系。

每条关系还可以带：

- `condition`：文本化前提（LaTeX），原样保存与展示，不做语义解析
- `contextId`：指向 `note(kind='context')`，可选；缺省表示未说明语境
- `note`：给这条关系自己的备注

去重键是「谓词 + 端点（`iff` 无序）+ 语境 + 规范化条件」。端点相同但条件不同的两条边都会保留。

### 推理步骤（超边）

二元边只能表达 OR（任一前提足够）。需要多个前提同时成立时（AND）用独立的 `InferenceStep`：

```jsonc
{
  "premiseIds": ["uuid-continuous", "uuid-closed-interval"],
  "conclusionId": "uuid-bounded",
  "rule": "紧集上连续函数有界",
  "contextId": "uuid-context",
  "proofId": "uuid-proof"
}
```

它不参与目录树、没有位置和编号，只是把「几个命题一起才能推出另一个」这件事记下来。
前提和结论都必须是 `proposition`；界面只做增删查，不会拿它自动推导新结论。

### 编号与来源

- 所有节点都可以填 `citation.page` / `citation.originalNumber`。原书编号有值时优先显示，并标成「原书编号」。
- 数学配置沿用自动编号：`section(kind=chapter)` → `第 n 章`；其余 section → `1.2`、`1.2.3`；定义/命题/题目按 kind 计数。
- 其他理科默认只为章节、定义、题目生成软件编号，不伪造教材里不存在的定律/实验编号。
- 引用只能靠 `id` / `key`，不要依赖会随移动变化的编号。

### 化学记号

KaTeX 的 `mhchem` 扩展已启用，编辑预览与阅读视图共用同一套 Markdown/KaTeX 配置。行内和块级都可以写：

```md
$\ce{2H2 + O2 -> 2H2O}$

$$\ce{2KMnO4 ->[\Delta] K2MnO4 + MnO2 + O2 ^}$$

$\pu{3 mol // L}$
```

反应条件（加热、催化剂、反应环境）必须和方程式一起保存，不能只留化学计量式。

### Mermaid 图

正文里可以直接写 ```` ```mermaid ```` 代码块，编辑预览与阅读视图都会渲染成图（主题与关系图一致）：

````md
```mermaid
mindmap
  root((声现象))
    声音的产生
    声音的传播
```
````

图源写错时不会炸掉整页：原代码块照常显示，下面补一行错误信息和「重试」按钮。
只支持 `mermaid` 这一种围栏语言，其他代码块仍走原有的高亮与复制。

## 结构与推理是两回事

- **目录不是逻辑**：`parentId` 只决定内容排在哪里，不代表依赖或蕴含。
- **引用不是依赖**：`cites` 只是提到，`depends-on` 是学习前置，`uses` 才是真正用到。
- **关系即事实**：建立了 `A depends-on B`、`P covers K`、`A implies B` 就表示知识库正在表达这件事；
  不存在「先建边再标记真伪」的状态机。关系不成立就不该建。
- **不自动推导**：编辑器不会从已有关系里替你推出新结论。`implies` / `iff` / 推理步骤只是结构化记录，不是自动证明器。
- **证明不是验证**：`proof --proves--> proposition` 只表示存在一份声称证明的文档，不代表证明过程已被机器检查。
- **实验不是证明**：实验或观察用 `supports` 连接科学陈述；`proves` 只用于理论证明。
- **改 kind 不能悄悄弄坏关系**：已经有 `supports` 边时，把起点从实验改成普通讲解会被拒绝，必须先把那条关系删掉或调整。

## 数据

- 全部存在浏览器 IndexedDB（数据库 `textbook-graph`，**DB version 与数据格式版本对齐，当前 9**），不联网、不登录。旧库 `textbook-graph-v8` 不再读取，也不做兼容迁移。
- 「导出」下载 `.tbg` 交换包（v9 图 + 所有图片）；「导入」支持 `.tbg` 和旧版 `.json`，整份替换（二次确认，失败不改动原数据）。v8 JSON 会自动迁移到 v9，v7 及更早拒绝。
- 新建教材时选择学科、学段、名称和可选版本说明；点教材卡片上的铅笔可随时修改这些信息，学科/学段变更会立即切换分类推荐与编号策略。
- 还没有教材时不能添加分支或节点，避免录入一份无法导出为合法 v9 的无主数据。
- `book + nodes + edges + steps` 在同一个事务里替换；新建教材会覆盖当前活动库，修改教材信息只动 `book`（必要时同步默认根分支名）。

### 导入格式

当前主格式是 v9。`.tbg` 交换包 = ZIP（`manifest.json` + `graph.json` + `assets/` 图片），导入时逐张校验大小与 sha256，任何一张不对就整包拒绝；旧版 `.json` 仍然可以导入，但图片要另外载入。`schemaVersion` 不是 9（v8 会先自动迁移，v7 及更早直接拒绝）、出现未知字段、结构不对或全图校验不通过，导入会被整个拒绝，现有数据不会变。格式细节见 `docs/EXCHANGE-FORMAT.md`。
数据库名固定为 `textbook-graph`，版本号只由 DB version 区分（Dexie 内部把版本号 ×10 存进 IndexedDB，DevTools 里看到 90 对应逻辑版本 9）；旧库 `textbook-graph-v8` 原样保留，不会被读取或删除。

```jsonc
{
  "schemaVersion": 8,
  "exportedAt": 0,
  "book": {
    "subject": "physics",
    "stage": "junior",
    "title": "九年级物理",
    "edition": "人教版"
  },
  "nodes": [],
  "edges": [],
  "steps": []
}
```

身份规则：`id` 在同一知识库内稳定唯一（不要每次重新 `randomUUID`）；`key` 只给可复用的核心知识点；
标题可以重名，不能作为去重依据。`solution` 只给 `problem` 用（标准解答），命题的证明请建独立的 `proof` 节点。
图片用 `![描述](https://...)` 直接写进 `content` / `solution`，图床失效只会导致图片不显示，不影响数据。

### 给外部脚本的格式

- `examples/v8.schema.json`：JSON Schema（由 `bun run gen:schema` 从 `src/lib/schema.ts` 生成）
- `examples/v8-math.json`：集合、定义、命题、证明、例题、原书编号
- `examples/v8-physics.json`：欧姆定律、实验数据表、电路图、`supports`
- `examples/v8-chemistry.json`：制取氧气、实验安全、`mhchem` 化学方程式
- `examples/v8-biology.json`：细胞结构、`part-of`、`is-a`、光合作用过程
- `examples/v8-science.json`：一本综合科学库里的跨学科内容
- `docs/ACCEPTANCE-v8.md`：五科人工验收记录与截图

## 开发

```bash
bun install
bun dev          # http://localhost:5173
bun run test     # 编号、图算法、校验、导入导出、样例验收（vitest）
bun run lint
bun run build
bun run gen:schema
bun run check:examples
```

技术栈：React 19 + TypeScript 6 + Vite 8 + Tailwind 4 + shadcn/ui + Zustand 5 + Dexie 4 + zod + KaTeX 0.19（mhchem）。

```
src/lib/schema.ts      9 种节点 / kind 枚举 / 12 种谓词 / book / 推理步骤 / zod
src/lib/subjects.ts    五门学科配置、kind 推荐、筛选器、编号策略
src/lib/predicates.ts  谓词注册表（方向、kind 约束、传递性、显示文案）
src/lib/graph.ts       纯函数：索引、递归编号、显示编号、遍历、covers 反查、搜索
src/lib/validate.ts    全图不变式、book、新关系端点与单条校验
src/lib/serialize.ts   v9 导入校验、导出
src/lib/exchange.ts    `.tbg` 交换包打包 / 解包
src/lib/markdown.ts    编辑与阅读共用的 Markdown/KaTeX 配置
src/lib/citation.ts    来源字段合并（source / page / originalNumber）
src/lib/db.ts          Dexie 持久化（book + 图数据同事务）
src/stores/useGraphStore.ts  活动教材 + 内存图 + 写穿
examples/              五门学科的 v8 验收样例
docs/DEPENDENCIES.md   依赖升级与版本约束记录
```

## 性能（本机实测，`bun run bench`）

| 规模 | 建索引 | 搜索 | 导入校验 | JSON | 堆内存 |
|---|---|---|---|---|---|
| 5.5k 节点 / 4.5k 边 | 4 ms | 1.2 ms | 20 ms | 1.8 MB | 16 MB |
| 22k 节点 / 18k 边 | 15 ms | 4.1 ms | 35 ms | 7.3 MB | 54 MB |

全量内存 + 写穿的架构在万级节点下仍然可用；再往上（十万级）需要改增量索引。

## 已知限制

- 关系只表达「知识库主张它成立」；软件不判断科学真假，也不给关系打质量分。
- `condition` 只做保存与展示，不会自动判断两条条件是否等价。
- 不做教材/PDF 解析、图床管理、小问实体、实验步骤实体、反应式解析或化学配平。
- 不做跨教材知识合并、自动证明、学生诊断/推荐。
- 搜索是全量线性扫描，二十万级以上需要倒排索引。

## 部署

推到 Vercel 即可，纯前端构建，不需要服务端环境变量。
