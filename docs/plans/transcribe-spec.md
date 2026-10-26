# 转写规约：苏科版初中物理整书 → v9 JSON

> 本文件是整书转写的**唯一标准**，不是提示词。所有转写、枚举、汇总子代理必须逐条遵守。
> 违反本规约的产出在合并阶段会被机械校验打回，不由人工求情。
>
> 相关实现：`src/lib/book-part.ts`（分章中间格式）、`src/lib/coords.ts`（坐标换算）、
> `scripts/check-book-part.ts`（单章校验）、`scripts/merge-book-parts.ts`（合并成 v9）。

---

## 0. 适用与优先级

1. 本规约约束 Pass 1（源条目枚举）、Pass 2（内容转写）、合并与校验。
2. **§0.1、§0.2、§0.3 优先于全文任何其它表述**。冲突时以本节为准。
3. 规约没覆盖的情况：选最保守的合法表达，写进例外清单，不要自行发明。

## 0.1 转写确定性条款

1. **唯一事实来源**：指定版次的 PDF 及其 sha256、版权页、目录。所有批次用同一份文件。禁止用网络资料、其他版次、其他出版社的内容补写。
2. **ID 优先级**：`branch` / `section` 用结构 ID；**其余一切内容节点用页码 ID**。同一源条目拆分用 `@1`、`@2`。已分配的 ID 永不重新分配。
3. **源条目清单冻结**：每批次开跑前 Pass 1 清单必须已冻结。Pass 2 只能映射清单内的 `srcId`，**不得新增、不得删除、不得改号**。发现清单有误，提异常，不改清单。
4. **覆盖率分母是清单**，不是子代理自述。完整映射 / 明确例外 / 遗漏 / 重复 / 无法判定分别计数，未转写不得计为完成。
5. **关系白名单**：只用 §7 的 7 种谓词。`implies`、`iff`、`proves`、`generalizes`、`refutes` 本次一律禁用。不得凭关键词共现或主观经验连边。
6. **跨批次实体**：核心概念节点以 §9 的实体注册表为准。未查证就新建重复核心概念节点 = 违规。
7. **结构合法性**：任何产出必须通过 v9 Schema 与全图约束。**不能因为原书是某种排版，就造出 Schema 不允许的父子结构**。
8. **资源完整性**：每个 `asset://` 引用必须有对应资源记录且文件存在。坐标不确定就不填 `region`，进待处理清单，**不许用零值或整页框假装定位完成**。
9. **不可判断时**：不发明类型、关系、页码、原文、图注、解释。优先保存原文，用保守合法映射，登记例外。
10. **提交前必须通过**：JSON 结构、ID 唯一、父子类型、关系端点、资源引用、`srcId` 覆盖率。不可通过的批次禁止进入合并。

## 0.2 坐标规范（不可变）

> 本节定义 `region` 与 `pdfPage` 的判定标准。任何工具、任何代理都必须按此换算，不得各写一套。

### 0.2.1 `pdfPage`

- **从 1 开始**，指 PDF 文件中的**物理页序**，不是书内印刷页码。
- `pdfPage = 1` 对应 PDF 第一页。
- 渲染页面统一以 **`/CropBox`** 为可见区域；`/CropBox` 缺失时按 PDF 规范回退（先取 `/CropBox`，无则 `/MediaBox`），不得默认 `/MediaBox`。
- **`/Rotate` 必须应用到渲染结果**（0/90/180/270）。渲染出来的图就是人翻书看到的方向。
- `citation.page` 独立保存原书印刷页码，与 `pdfPage` 无推导关系。**禁止在转写时用固定偏移量换算**（即使本套书四册偏移都是 +7，也不得硬编码）；需要映射时查 `manifest.json` 的 `pageOffset`。

### 0.2.2 `region`

```ts
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

- 坐标系：**应用 `/CropBox` 与 `/Rotate` 之后的完整可见渲染页面**。
- 原点在**左上角**，x 向右，y 向下，归一化到 `[0, 1]`。
- 合法条件（校验器强制，浮点容差 `EPS = 1e-6`）：

```
0 <= x < 1
0 <= y < 1
0 < width  &&  x + width  <= 1
0 < height &&  y + height <= 1
```

- 四个值都必须是有限数。`NaN`、`Infinity`、`-Infinity` 一律拒绝。
- 边界校验带容差，**禁止静默裁剪非法坐标**。越界就是错误，不是警告。
- 一个 `region` **只能属于一个 `pdfPage`**。跨页内容必须拆成多个 `SourceAnchor`，每个锚点绑定自己的 `pdfPage + region`，不许让一个 bbox 越过页边界。
- 坐标未知时**整个 `region` 省略**，并记进 `report.md` 的待处理清单（写明原因，如「矢量插图，视觉模型无法给出可靠 bbox」）。

### 0.2.3 换算职责

| 场景 | 换算 |
|---|---|
| 视觉模型读整页渲染图给出 bbox | 已在渲染页坐标系，直接用，仅做范围校验 |
| 从 PDF 对象框（`pdfimages`/`pdftotext -bbox`）反查 | 必须经 `/CropBox` + `/Rotate` 换算到渲染页坐标系 |
| 按 `region` 裁图 | 渲染页像素尺寸 × region → 像素矩形，四舍五入到整数 |

换算函数统一放 `src/lib/coords.ts`，**禁止在各批次脚本里重写**。

## 0.3 覆盖率与复核状态（两个独立指标）

**结构覆盖率**（可机械计算）：

```
结构覆盖率 = 已映射 srcId 数 / 清单中 srcId 总数
```
分类计数：`mapped`（完整映射）/ `exception`（有据可查的例外）/ `missing`（遗漏）/ `duplicate`（一个 srcId 映射到多个互不相关的节点）/ `undecided`（无法判定）。
**只有 `mapped + exception` 计入分子**，`missing`/`undecided` 必须显式列出。

**视觉复核状态**（不可由代码宣称）：

- `unreviewed` / `spot-checked`（人工或独立视觉抽查，记录抽查页）/ `fully-reviewed`
- 结构覆盖率 100% **不代表**视觉复核完成。两者在报告里分两栏写，禁止合并成一个「完成度」。

`pdfimages -list` 的内嵌图对象数**只作为辅助指标**，不等价于页面可见插图数（存在重复图像对象、遮罩、矢量插图）。它异常时提示复查，不当作通过/失败的判据。

---

## 1. 全局结构

一本教材 = 一个 v9 图。四册是 `branch` 节点，不是四本书。

```
初中物理（苏科版）              ← book.title, stage='junior', subject='physics'
├─ branch 八年级上册            ← id: phy-b8a
│   └─ section(chapter) 第一章 声现象
│       └─ section 一、声音是什么
│           ├─ note(experiment) 活动 1.2 探究声音的传播
│           ├─ proposition(law) 声音的传播需要介质   ← 兄弟，不是 note 的子节点
│           └─ problem(exercise) 实践与练习 第 1 题
├─ branch 八年级下册            ← id: phy-b8b
├─ branch 九年级上册            ← id: phy-b9a
└─ branch 九年级下册            ← id: phy-b9b
```

### 1.1 已核实的事实（直接来自 PDF 原文，可直接引用）

| 项 | 值 |
|---|---|
| 版次 | 2024 年第 4 版，江苏凤凰科学技术出版社 |
| 四册页数 | 八上 158 / 八下 138 / 九上 118 / 九下 122（共 536 页） |
| 章号 | **全书连续 1–18**：八上 1–5、八下 6–10、九上 11–14、九下 15–18 |
| 页码偏移 | 四册均为 `pdfPage = printedPage + 7`；PDF 1–7 为无页码前置页（封面/书名/版权/致同学/目录×2/空白） |
| 文字层 | 八上、九上有；八下、九下为逐页图重建，**无文字层**（已另备 OCR 作辅助） |

章 ID 用全局章号：八下第 7 章 = `phy-b8b-c07`。

父容器的合法子类型（`allowedChildTypes`，硬约束）：

| 父 | 允许的子 |
|---|---|
| `branch` | `section`、`note` |
| `section` | `section`、`definition`、`proposition`、`proof`、`problem`、`note`、`counterexample` |
| `note` | **只有 `note`** |

推论：**实验结论、活动里的知识点，一律挂到所属 `section` 下当兄弟节点**，不能挂在 `note(experiment)` 下面。`branch` 下也不能直接挂 `proposition`。

## 2. ID 规则

| 对象 | 格式 | 示例 |
|---|---|---|
| 册分支 | `phy-<册>` | `phy-b8a` |
| 章 | `phy-<册>-c<两位章号>` | `phy-b8a-c04` |
| 节 | `<章id>-s<两位节号>` | `phy-b8a-c04-s02` |
| 子节 | `<节id>-ss<两位序号>` | `phy-b8a-c04-s02-ss01` |
| 内容节点（note/definition/proposition/problem） | `phy-<册>-p<印刷页码三或四位>-<两位页内序>` | `phy-b8a-p045-02` |
| 拆分节点 | 上一条 + `@n` | `phy-b8a-p045-02@1` |
| 边 | `<章id>-e<三位序号>` | `phy-b8a-c04-e007` |
| 推理步骤 | `<章id>-i<三位序号>` | `phy-b8a-c04-i001` |
| 资源 | `phy-<册>-p<页码>-fig<两位>` | `phy-b8a-p045-fig01` |

**优先级（消除双轨）：**

- `branch` / `section` 用结构 ID。
- **一切实际内容节点用页码 ID**，包括活动、实验、例题、讲解、定义、命题。
- 栏目号（「活动 4.2」「例题 3」）**不进节点 ID**，只进 `citation.originalNumber` 和 `srcId`。
- 页内序按页面从上到下、从左到右，Pass 1 分配；**分配后不改**。
- `@1`/`@2` 必须源自同一个 `srcId`，拆分顺序一次定死，后续编辑不得重排。
- ID 撞车：后到的批次必须**报异常**，不得自行改名或加后缀。

## 3. 源条目清单（Pass 1）

### 3.1 定义什么算一个源条目

- 一个自然段 = 1 条
- 一个小标题所在的整块讲解 = 1 条（不按句子切）
- 一道题（题干 + 选项 + 答案区整体）= 1 条
- 一张图 + 它的图注 = 1 条（登记为 `figure`）
- 一张表格 = 1 条
- 一个活动/实验 = 1 条（内部器材清单不另计）
- 目录、版权页、页眉页脚、页码 = **不计**
- **双栏排版按栏顺序**：先左栏自上下，再右栏自上下
- **旁注/页边批注**：附属于所在正文条目，不单独计，内容写进该条目的 `note`
- **跨页内容**：在起始页登记 1 条，标注 `continuesOn` 下一页；下一页面不再重复登记

### 3.2 清单格式

Pass 1 只产出清单，**不产节点、不写内容、不建关系**。

```jsonc
{
  "volume": "b8a",
  "pdfPageRange": [14, 32],
  "printedPageRange": ["1", "18"],
  "pageOffset": { "formula": "pdfPage = printedPage + 13" },
  "items": [
    {
      "srcId": "phy-b8a-p045-02",
      "kind": "figure",
      "pdfPage": 58,
      "region": { "x": 0.12, "y": 0.30, "width": 0.70, "height": 0.35 },
      "originalNumber": "图 4-2",
      "text": "图 4-2 用电压表测电压",
      "continuesOn": null
    }
  ]
}
```

- 每条必须带 `bbox`（`region`）或显式 `regionOmittedReason`。
- 清单冻结后存入 `local-textbook/sukey/expected/`，Pass 2 只读。
- 校验器会把 `region` 叠回页图生成核对图（`local-textbook/sukey/review/`），供人工抽查漏读。

### 3.3 Pass 2 的边界

Pass 2 只做映射：`srcId → 一个或多个节点`。
一个 `srcId` 拆成多个节点时，节点 id 用 `@1`/`@2`，并在节点 `tags` 里保留 `src:<srcId>`。
一个 `note` 吞并了多个连续源条目时，只登记第一个 `srcId` 为节点 id，其余写进 `tags`（`src:phy-b8a-p045-03`）。

## 4. type / kind 映射

### 4.0 苏科版 2024 第 4 版的实际栏目（已核对 PDF 原文，不是推测）

全书只有 **10 个栏目**。旧版的「WWW」「本章小结」**在这一版不存在**，别按记忆写。

| 原书栏目 | 位置 | type | kind |
|---|---|---|---|
| （章） | 全书 | `section` | `chapter` |
| 一、二、三… | 章内 | `section` | `section` |
| **活动** | 节内 | `note` | `experiment` |
| **学生实验** | 节内 | `note` | `experiment` |
| **信息快递** | 节内 | `note` | `explanation` |
| **方法技巧** | 节内 | `note` | `method` |
| **读一读** | 节内 | `note` | `topic` |
| **生活 物理 社会** | 节内 | `note` | `topic` |
| **国家工程** | 节内 | `note` | `topic` |
| **实践与练习** | 节末 | `problem` | `exercise`（逐题一节点） |
| **跨学科实践** | 章末 | `note` | `topic` |
| **素养进阶 · 内容梳理** | 章末 | `note` | `summary` |
| **素养进阶 · 反思提升** | 章末 | `problem` | `review`（逐题一节点） |
| **素养进阶 · 问题解决** | 章末 | `problem` | `review`（逐题一节点） |

补充规则：

- 「活动」按章连续编号（如 `活动 7.1`），内部子类为 试一试 / 猜一猜 / 做一做 / 议一议。**子类写进 `content` 正文，不进 kind**；编号进 `citation.originalNumber`。
- 「活动」和「学生实验」一律 `note(experiment)`：栏目是实验/探究型材料，与是不是学生动手无关。不要按「是不是学生自己做」去区分 `note` 和 `problem`——本版原书没有这种栏目。
- 「内容梳理」是**思维导图**（结构化图示）。用 `note(kind='summary')` 存文字节点，同时把导图整图存成 asset。图的层级关系图谱表达不了，写进例外清单。
- 「素养进阶」是一个章末大栏目，内部三块必须拆成独立节点，不要塞进一个 `note`。

### 4.1 通用映射

表里没有 → `note(explanation)` 兜底 + 写例外清单。

| 教材内容 | type | kind |
|---|---|---|
| 正文讲解段落 / 框内说明 | `note` | `explanation` |
| 确属科学史内容 | `note` | `history` |
| 例题 | `problem` | `example` |
| 学生自己探究并得出条件 | `problem` | `exploration` |
| 物理量、单位、术语定义 | `definition` | 无 |
| 定律 / 原理 / 规律 | `proposition` | `law` / `principle` |
| 独立可引用的公式 | `proposition` | `formula` |
| 实验得出的可引用断言 | `proposition` | `claim` |
| 物理模型 | `note` | `model` |
| 现象描述 | `note` | `phenomenon` |
| 技术过程 | `note` | `process` |
| 器件结构 | `note` | `structure` |
| 编者说明、承上启下 | `note` | `context` |

红线：

- 一般叙述段落**不许**建 `proposition`。命题必须是可判真假的断言。
- 实验结论若立 `proposition`，**挂到所属 `section`**，与 `note(experiment)` 同级。
- 不建 `proof`（初中物理无形式证明，推导写进 `note(explanation)`）、不建 `attempt`、不建 `counterexample`。
- 纯代数变形不立 `formula`。只有作为独立可引用陈述时才立。

## 5. content 写法

- 纯 Markdown，**不要在 content 里重复 `title`**
- 层级从 `####` 起（`##` 留给渲染器）
- 行内 `$...$`，独立 `$$...$$`；物理量带单位写 `$5\ \mathrm{m/s}$`，可用 `\pu{}`
- 表格用 GFM，实验数据表保留原表头文字与结构
- 图：`![图片替代文本](asset://phy-b8a-p045-fig01)`
- **图注不进 alt**。图注原文写进 `assets[].caption`（见 §10），由阅读器渲染成 `<figcaption>`
- 原书编号保留在正文，同时填 `citation.originalNumber`
- 不写原书没有的话：不补背景、不解释、不润色、不改写
- 图注缺失 → `caption` 留空，`report.md` 记「p45 图无图注」

## 6. citation

```json
"citation": { "source": "苏科版初中物理八年级上册", "page": "45", "originalNumber": "4.2" }
```

- `page`：**正文的印刷页码**（纯数字字符串）。**章节节点用该章正文起始页，不是目录所在页。**
- `branch` 册节点没有对应印刷页 → **允许不填 `page`**，填 `originalNumber`（如「八年级上册」）。禁止编造页码。
- 无印刷页码的前言、插页、封面 → 不填 `page`，在 `report.md` 记例外。
- `originalNumber`：原书自带编号（活动号/题号/图号），没有就不填。

## 7. 关系（只用这 7 种）

| 谓词 | 方向 | 依据要求 |
|---|---|---|
| `depends-on` | 后学 → 先学 | **仅限原书明写**「需要用到…」「在前面学过…」「根据…可知」。禁止凭「离开这节就听不懂」的主观判断。**必须无环** |
| `uses` | 实验/题目 → 定义/命题 | 原书明确用到某个公式或量的定义 |
| `supports` | `note(experiment/phenomenon)` → `proposition` | 原书用该实验/现象的数据或观察支持某结论 |
| `covers` | `problem` → 知识点 | 该题直接考查的概念 |
| `cites` | 任意 → 任意 | 弱引用；跨册回顾旧知识用这个 |
| `part-of` | `definition` → `definition` | 部分—整体，严格区分于 `is-a` |
| `is-a` | `definition` → `definition` | 子类属于上位类 |

- **禁用**：`implies`、`iff`、`proves`、`generalizes`、`refutes`
- `supports` 起点只能是 `note(kind=experiment|phenomenon)`
- 每条边必须能指着原书某句话说清依据，把依据原话写进 `note`
- **零条边好过错一条边**

## 8. 推理步骤

只在原书存在明确、可引用的推理，且前提与结论**都是独立 `proposition` 节点**时创建：

```json
{ "id": "phy-b8b-c10-i001", "premiseIds": ["…A", "…B"], "conclusionId": "…C", "rule": "液体压强与密度关系" }
```

- 前提必须 ≥ 1，且都是 `proposition`（Schema 约束）
- 初中物理真 AND 推理极少，宁缺毋滥
- 不因为「原书用了因为…所以…」就建，要有独立成节点的命题

## 9. 跨册实体注册表

文件：`local-textbook/sukey/entities.json`（由合并器维护，**不由转写批次随意写**）

```jsonc
{ "entities": [ { "id": "phy-b8b-p032-01", "key": "pressure", "title": "压强", "aliases": ["压强"], "firstSeen": "phy-b8b-c10-s01" } ] }
```

规则：

- 批次开跑前先查注册表。命中 → 用已有节点 ID 做 `cites`/`depends-on` 目标，**不新建**。
- 未命中且确属核心概念（跨章会被引用）→ `key` 按英文小写连字符命名，`key` 全书唯一。
- 同一概念后续册次再出现：主节点归首次出现处，别处建 `note(explanation|context)` + `cites`。
- 只有「确实不是同一知识实体」才新建节点。
- 册与册之间的合并**串行**（b8a → b8b → b9a → b9b），保证注册表始终最新；册内批次可并行。

## 10. 分章中间格式与字段归属

分章 JSON 是**中间格式，不是 v9 `GraphJSON`**，schema 见 `src/lib/book-part.ts`：

```jsonc
{
  "meta": { "volume": "b8a", "pdfPageRange": [14, 32], "printedPageRange": ["1", "18"], "agent": "…" },
  "nodes": [ … ],
  "edges": [ … ],
  "steps": [ … ],
  "assets": [
    {
      "id": "phy-b8a-p045-fig01",
      "caption": "图 4-2 用电压表测电压",
      "alt": "两名学生用电压表测量小灯泡两端电压",
      "pdfPage": 58,
      "region": { "x": 0.12, "y": 0.30, "width": 0.70, "height": 0.35 },
      "regionOmittedReason": null,
      "nodeId": "phy-b8a-p045-02"
    }
  ],
  "exceptions": [ { "srcId": "phy-b8a-p045-07", "reason": "…", "originalText": "…" } ]
}
```

**字段归属（硬性）**

| 字段 | 谁填 |
|---|---|
| `id`、`type`、`kind`、`title`、`content`、`solution`、`parentId`、`key`、`aliases`、`tags`、`citation` | Pass 2 |
| `order`、`createdAt`、`updatedAt` | **合并器**（按清单顺序 ×1024 生成 order，时间戳取合并时刻） |
| `edges[].id`、`steps[].id`、`assertedBy` | **合并器** |
| `assets[].path`、`sha256`、`byteLength`、`mimeType` | 资源流水线（裁图后回填），Pass 2 不填 |

Pass 2 **不许**填 `order`/`createdAt`/`updatedAt`/`assertedBy`，填了校验器直接报错。

## 11. 资源文件约定

```
local-textbook/sukey/
├─ raw/<册>.pdf
├─ pages/<册>/p0001.png          # 整页渲染，按 /CropBox + /Rotate，1-based
├─ assets/<册>/<assetId>.png     # 按 region 裁好的插图
├─ expected/<册>-<章>.json       # Pass 1 冻结清单
├─ parts/<册>-<章>.json          # Pass 2 中间格式
├─ parts/<册>-<章>.report.md     # 例外 / 待处理 / 复核状态
├─ review/<册>-<章>/             # bbox 叠加核对图
└─ entities.json                 # 跨册实体注册表
```

- 裁图：`pages/<册>/p<条数>.png` × `region` → 像素矩形，整数像素裁切，不缩放
- `AssetMeta.path` 写包内相对路径 `assets/<册>/<assetId>.png`，与磁盘结构一致
- 每张裁好的图同时产一条 `SourceAnchor`（`pageLabel` = 印刷页码，`region`，`nodeId`），合并器生成 `anchors`
- `.tbg` 打包本次不做

## 12. 合并与校验工序

```
Pass 1 枚举 → 清单冻结 → 人工/视觉抽查 bbox 核对图
      ↓
Pass 2 转写 → scripts/check-book-part.ts（必须全绿）
      ↓
scripts/merge-book-parts.ts（生成 order/时间戳/边 id/anchors）
      ↓
scripts/report-book-coverage.ts（结构覆盖率 + 视觉复核状态 分栏输出）
      ↓
UI 导入 → 导出 → 再导入 → 对比
```

单章校验必须检查：JSON 结构、ID 唯一性、父子类型合法、关系端点与谓词合法性（含 `supports` 起点限制、`depends-on` 无环）、`asset://` 引用闭合、`srcId` 覆盖率、`region` 合法性与 `pdfPage` 绑定、禁用字段是否被越权填写。

## 13. 禁止清单

- 禁止编造原书没有的内容、编号、页码、图注、坐标
- 禁止把 `pdftotext` 输出直接粘进 content 而不还原版面
- 禁止跨批次改别人的 ID
- 禁止用 `region: {0,0,1,1}` 或零值伪装定位
- 禁止把「结构覆盖率」和「视觉复核」合并成一个进度数字
- 禁止创建子代理
