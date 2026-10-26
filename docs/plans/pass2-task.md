# 任务书：Pass 2 内容转写（八上第一章 p18–25）

> 执行者：子代理。**禁止创建子代理。**
> 规范：`docs/plans/transcribe-spec.md`（尤其 §0.1 §0.2 §3.3 §4 §5 §6 §7 §10）。
> 格式：`src/lib/book-part.ts` 的 `BookPartSchema`（自己读，以代码为准）。

## 你的活

把已冻结的清单 `local-textbook/sukey/expected/b8a-c01-p018-025.json`（55 条）映射成**分章 JSON**。

**分母就是这 55 条，不许增、不许删、不许改号。**

输出：`local-textbook/sukey/parts/b8a-c01-p018-025.json`
报告：`local-textbook/sukey/parts/b8a-c01-p018-025.report.md`

## 硬性约束

1. **不许填** `order`、`createdAt`、`updatedAt`、`edges[].id`、`steps[].id`、`assertedBy` —— 由合并器生成，填了 `check:part` 直接报错
2. **正文原文照抄**，不许改写、概括、润色、补背景。公式用 `$...$`，化学/物理单位写法见 §5
3. **每个 srcId 必须被认领**：映射到节点，或写进 `exceptions`（带理由）。漏一个 `check:part` 就 error
4. **不许编造**原文、编号、页码、图注

## 清单里各 kind 怎么处理（已定，不要再讨论）

| 清单 kind | 产出 |
|---|---|
| `heading`（章名，p011-01） | 章节点 `phy-b8a-c01`，`type=section` `kind=chapter` `parentId='phy-b8a'`，章题名「奇特的声音」写进 `content` 首行 |
| `heading`（节名，如「一、声音是什么」） | `section` 节点，`kind='section'`，id 用 srcId，`parentId` = 章节点 |
| `heading`（节内小标题，如「声音的产生」） | `section` 节点，`kind='subsection'` |
| `para`（正文段落） | `note(explanation)`，id 用 srcId |
| `activity-title` | `note(experiment)` 节点，id 用该 srcId；**它后面的步骤段落、图、文字由这一个节点认领**（见下） |
| `module`（信息快递等） | **承载术语定义时建 `definition`**（例：p012-09 定义「振动」）；否则 `note(explanation)` / `note(topic)` |
| `figure` | **不建独立节点**。产出 `assets[]` 一条，`nodeId` 指向引用它的那个节点，该 figure 的 srcId 由那个节点的 `tags` 认领 |
| `block-title`（实践与练习） | **不建节点**，srcId 由紧跟其后的第一个 `exercise` 节点的 `tags` 认领 |
| `exercise` | `problem(exercise)`，一题一节点 |
| `table` / `summary` / `question` | 本批无 |

## 「活动」怎么组装（最容易做错的地方）

活动标题 + 后面连续的步骤段落 / 图 / 栏目，组成**一个** `note(experiment)` 节点：

- 节点 id = `activity-title` 那条的 srcId
- `content` 里按原书顺序写：标题（`#### 活动 1.1 感受发声物体的振动`）、步骤文字、图片引用
- 图片引用写成 `![图 1-1 感受发声物体的振动](asset://phy-b8a-p012-fig01)`
- **步骤段落和图的 srcId 全部写进该节点的 `tags`**，形如 `"tags": ["src:phy-b8a-p012-05", "src:phy-b8a-p012-06"]`
- **但 `module`（信息快递）例外**：它是独立节点，不属于活动，别吞进去

## assets 怎么写

```json
{
  "id": "phy-b8a-p012-fig01",
  "caption": "图 1-1 感受发声物体的振动",
  "alt": "男生指着喉部、女生拿着音叉接触面颊的两幅小图",
  "pdfPage": 19,
  "region": { "x": ..., "y": ..., "width": ..., "height": ... },
  "nodeId": "phy-b8a-p012-04"
}
```

- `id`：`phy-<册>-p<印刷页码>-fig<两位>`，一页内按顺序编号
- `caption`：**原文图注一字不改**。没有图注就省略字段，并在 report 记「无图注」
- `alt`：你自己写的一句话描述（这是唯一允许你生成的内容）
- `region` / `pdfPage`：从清单里 figure 那条**原样复制**，不许重算、不许改
- `path`/`sha256`/`byteLength`/`mimeType` **不填**（由裁图流水线回填）

## 边与推理

- 只用 7 种谓词：`depends-on` `uses` `supports` `covers` `cites` `part-of` `is-a`
- **禁用** `implies` `iff` `proves` `generalizes` `refutes`
- 每条边必须能在原书找到依据，**把依据原话写进 `note`**
- 本批 8 页大概率**零条边**是对的。零条边好过错一条边
- 不建 `InferenceStep`

## 交付前必须自己跑

```bash
bun run scripts/check-book-part.ts local-textbook/sukey/parts/b8a-c01-p018-025.json \
  --expected local-textbook/sukey/expected/b8a-c01-p018-025.json; echo "exit=$?"
```

**必须 exit=0**。有 `missing-srcid` 就去补认领，不许改清单来消错。

## report.md 要写什么

- 55 条各自的归宿（一条一行：srcId → 节点 id 或 asset id 或 exception）
- 结构覆盖率那一行的实际输出
- 你做的所有判断（例如哪条 module 建成了 definition、哪段该并进活动）
- 表达不了的内容（原话 + 为什么）

## 禁止

- 改清单文件
- 改 `src/lib/**` 任何文件
- 新增依赖
- 创建子代理
