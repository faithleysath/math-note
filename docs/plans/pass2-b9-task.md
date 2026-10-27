# 任务书：Pass 2 内容转写（九年级上、下册）

> 执行者：子代理。**禁止创建子代理。**
> 规范：`docs/plans/transcribe-spec.md` —— 全文必读，尤其 §0.1 §0.2 §3.3 §4 §5 §6 §7 §8 §10。
> 格式：`src/lib/book-part.ts` 的 `BookPartSchema`（自己读代码，以代码为准）。
> 本文件只写九年级与八年级**不一样**的地方 + 八年级踩过的坑。

## 你的活

把已冻结的清单 `local-textbook/sukey/expected/<清单>.json` 映射成**分章 JSON**。
**分母就是清单条目数，不许增、不许删、不许改号。**

- 输出：`local-textbook/sukey/parts/<清单同名>.json`
- 报告：`local-textbook/sukey/parts/<清单同名>.report.md`

## 硬性约束（违反会被机械校验打回）

1. **不许填** `order`、`createdAt`、`updatedAt`、`edges[].id`、`steps[].id`、`assertedBy` —— 合并器生成
2. **正文原文照抄**，不改写、不概括、不润色、不补背景、不解释
3. **每个 srcId 必须被认领**：映射到节点、写进 `assets`、或被 `tags` 吸收、或写进 `exceptions`。漏一个 `check:part` 就 error
4. **不许编造**原文、编号、页码、图注、坐标
5. **正文里不许出现元话语**：不写「图中层级已结构化：…」「此处原书用表格」「该栏目属于…」这类说明给读者以外的人看的话

## 清单 kind → 产出（表里没有的查 §4.1，再没有就 `note(explanation)` + 例外清单）

| 清单 kind | 产出 |
|---|---|
| `heading`（章名） | 章节点 `phy-b9a-c11`，`type=section` `kind=chapter` `parentId='phy-b9a'`，章题名写进 `content` 首行 |
| `heading`（节名「一、杠杆」） | `section(kind='section')`，id 用 srcId，`parentId` = 章节点 |
| `heading`（节内小标题） | `section(kind='subsection')` |
| `para` | 见下「断言必须立命题」 |
| `activity-title` | `note(experiment)`，id 用该 srcId，吞掉后续步骤段落/图（见下） |
| `module`（信息快递/读一读/方法技巧/生活物理社会/国家工程） | 承载术语定义 → `definition`；否则 `note(explanation|topic|method)` |
| `figure` | **不建独立节点**，只产 `assets[]` 一条，`nodeId` 指向引用它的节点，figure 的 srcId 由该节点 `tags` 认领 |
| `table` | 不建节点，srcId 由所属节点的 `tags` 认领；表内数据用 GFM 表格写进那个节点的 content |
| `block-title`（实践与练习 / 素养进阶 等） | 建 `section(kind='topic')`，id 用该 srcId（八年级就是这么做的，照抄） |
| `exercise` | `problem(kind='exercise')`，一题一节点 |
| `question` | `problem(kind='review')`，一题一节点 |
| `summary` | `note(kind='summary')` + 整图存 asset |

## 断言必须立 `proposition`（八年级被审计打回过一次）

**可判真假的结论不许留在 `note(explanation)` 里。** 下列一律 `proposition`：

- 定律 / 原理 → `kind='law'` / `principle`
- 独立可引用的公式 → `kind='formula'`
- 原书用「大量实验表明 / 说明 / 可知 / 结论是 / 由此可知」引出的断言 → `kind='claim'`
- 「X 与 Y 有关/无关」「X 越大 Y 越大」这类定性结论 → `kind='claim'`

**为什么**：不立命题就没法挂 `supports`（实验支持结论）、`covers`（题目考查知识点），整本书会退化成一棵只有章节和段落的树。

**一段里有多种语义时必须拆**：一段同时含「断言 + 定义」→ 拆成 `proposition` + `definition`，用 `@1` `@2` 后缀。
不要整段塞进一个 `note`。

**但从「一个 srcId 拆成多个节点」要克制**：只在语义确实不同类时拆。八年级有过把一个 srcId 拆成 4 个碎节点的情况，复审判为过度切分。

### 九年级的命题密度参考

- 第十一章：`杠杆平衡条件`、`定滑轮/动滑轮特点`、`功的公式`、`功率公式`、`机械效率公式` —— 都是 `proposition(formula|law)`
- 第十三章：`串联/并联电路电流与电压的规律` —— `proposition(law)`，也是 `is-a`/`part-of` 的密集处
- 第十四章：`欧姆定律` `proposition(law)`；`电阻` `definition`
- 第十五章：`电功公式` `电功率公式` `焦耳定律` —— 全是 `proposition(formula|law)`
- 第十六章：`右手螺旋定则` `电磁感应` —— `proposition(law)`
- 第十八章：`能量守恒定律` —— `proposition(law)`

## 「活动」怎么组装（八年级最主要的结构来源）

活动标题 + 后面**连续的**步骤段落 / 图，组成**一个** `note(experiment)`：

- 节点 id = `activity-title` 那条的 srcId
- content 按原书顺序写：步骤文字、图片引用 `![图 11-1 …](asset://phy-b9a-p003-fig01)`
- 被吞掉的 srcId 全部写进 `tags`：`"tags": ["src:phy-b9a-p003-05", "src:phy-b9a-p003-06"]`
- **`module` 例外**：信息快递/方法技巧是独立节点，别吞进活动
- **活动里的结论句如果可判真假 → 单独立 `proposition`，挂到所属 `section`**，与 `note(experiment)` 同级

## 「跨学科实践」怎么摆（章末，容易做错）

八年级的做法（照抄）：建 `section(kind='subsection')`，标题「跨学科实践 自制天文望远镜」，挂在章下；
框内内容按清单的 `module` 条目建 `note(topic)`。

**不要让整个章都变成 note**，也不要把它塞进最后一节的实践与练习。

## 册分支节点谁来建（只有本册第一个 part 负责）

v9 的根是自己那一册的 `branch` 节点，**它不自动生成**，必须写进 part 的 `nodes` 里。
八年级的做法：写进**本册第一章那个 part**（b8a 写在 c01，b8b 写在 c06）。九年级照做：

- **九上**：写在 `b9a-c11-p008-022.json`（批次 A）
- **九下**：写在 `b9b-c15-p008-022.json`（批次 I）

```json
{ "id": "phy-b9a", "type": "branch", "title": "九年级上册", "content": "", "parentId": null,
  "citation": { "source": "苏科版初中物理九年级上册", "originalNumber": "九年级上册" } }
```

- `citation.page` **不填**（册节点没有对应印刷页，§6 明确允许）
- **不要**每条边都从分支出发；分支只是根，不挂关系

## 章末「素养进阶」结构（八年级模式，照抄）

```
section(topic)   phy-b9a-c11-s06        素养进阶
├─ section(topic) …-s06-ss01            内容梳理      ← note(kind='summary') + 导图 asset
├─ section(topic) …-s06-ss02            反思提升      ← problem(kind='review') 逐题
└─ section(topic) …-s06-ss03            问题解决      ← problem(kind='review') 逐题
```

「实践与练习」同样建 `section(kind='topic')` 挂在该节下，题作为子节点。

## assets 怎么写

```json
{
  "id": "phy-b9a-p003-fig01",
  "caption": "图 11-1 用开瓶器开瓶盖",
  "alt": "……（一句话描述，这是唯一允许你生成的内容）",
  "pdfPage": 10,
  "region": { "x": 0.1, "y": 0.2, "width": 0.5, "height": 0.3 },
  "nodeId": "phy-b9a-p003-02"
}
```

- `caption`：**原文图注一字不改**；无图注就省略字段并在 report 记一条
- **清单里标了 `captionOnImage: true` 的 figure → 不写 `caption`**，图注文字只放 `alt`。
  否则阅读器会在图上已印着的字下面再渲染一遍同样的字
- `region` / `pdfPage` 从清单**原样复制**，不许重算、不许改
- `path`/`sha256`/`byteLength`/`mimeType`/`width`/`height` **不填**（裁图流水线回填）

## 关系（只用这 7 种）

`depends-on` `uses` `supports` `covers` `cites` `part-of` `is-a`
**禁用** `implies` `iff` `proves` `generalizes` `refutes`

连边前先查 `transcribe-spec.md` §7.0 的决策表。要点：

- **「用到了」是 `uses`，不是 `depends-on`**。装置的原理、技术应用、生活实例一律 `uses`
- **`depends-on` 必须无环**，且目标不能是本节的主题概念（`check:part` 报 `depends-on-hub` 就是这种情况）
- **`covers` 每题 1–3 条**，综合题连所有被考查点；不要凑数
- **`supports` 起点只能是 `note(experiment|phenomenon)`**
- 每条边的依据原句写进 `note` 字段
- **零条边好过错一条边**

### 九年级专项：跨册 / 跨章引用用已有 ID

开工前查 `local-textbook/sukey/entities.json`（108 条八年级概念）：

- 命中 → 用注册表里的 `id` 做 `cites` / `depends-on` 目标，**不新建节点**
- 九年级核心概念（电流、电压、电阻、电能、电功率…）在本批**首次出现**时正常新建，并在 `report.md` 里列出来，供合并时进注册表
- 九下批次引用九上概念时，直接用 `phy-b9a-*` 的节点 id 做端点（跨 part 边允许）
- **同一概念不许在多个 part 里各建一个节点**。拿不准就查 `entities.json` 和已合并的 `merged/all.json`

## 推理步骤（九年级首次有真实素材）

只有原书存在**明确可引用的推理**，且**前提与结论都是独立 `proposition` 节点**时才建：

```json
{ "id": "phy-b9a-c14-i001", "premiseIds": ["…A", "…B"], "conclusionId": "…C", "rule": "欧姆定律与串联电路电流规律" }
```

- 前提 ≥ 1 且都是 `proposition`
- **宁缺毋滥**：不因为原书写了「因为…所以…」就建，必须前提结论各自独立成节点
- 八年级全书 0 条是正常的；九年级如果建了，在 report 里逐条说明依据原句

## 交付前必须自己跑

```bash
cd /Users/laysath/Projects/math-note
bun run check:part local-textbook/sukey/parts/<清单同名>.json \
  --expected local-textbook/sukey/expected/<清单同名>.json; echo "exit=$?"
```

**必须 exit=0**。有 `missing-srcid` 就去补认领，**不许改清单来消错**。
告警逐条看：能改就改，改不了在 report 里说明。

## report.md 要写什么

1. 条目数 · 节点数 · 边数 · asset 数 · exception 数
2. `check:part` 最终输出（原样贴汇总行）
3. 每个 srcId 的归宿（一条一行：srcId → 节点 id / asset id / exception）
4. 你做的所有判断：哪条 module 建成了 definition、哪段并进了活动、哪个 srcId 拆成了 `@n` 及理由
5. 本批新建的核心概念节点（id · key · 标题），供合并进实体注册表
6. 表达不了的内容（原话 + 为什么）

## 禁止

- 改清单文件、改 `src/lib/**`、新增依赖
- **创建子代理**
