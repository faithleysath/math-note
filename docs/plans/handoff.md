# Handoff：苏科版初中物理整书转写 —— 当前状态与作业规程

> 写于八年级上下册完成时。这份文档的目的是：**新会话读完它 + `transcribe-spec.md`，就能接着干九年级，不需要任何会话历史。**
> 如果需要更早的细节（某条规则是怎么被逼出来的、某次审计说了什么），用 `vcc_recall` 捞，关键词见文末。

---

## 1. 一句话现状

苏科版初中物理**八年级上、下两册（272 页正文）已全部转写**成一份 v9 图谱，并通过结构校验 + 逐页视觉复核。
**九年级上、下两册（222 页正文）尚未开始。**

---

## 2. 交付物在哪

```
local-textbook/sukey/            （.gitignore，受版权，不进仓库）
├─ raw/            4 册 PDF（343 MB，九年级两册已就位）
├─ pages/b8a|b8b/  整页渲染 PNG（200 dpi，151 + 126 张）+ geometry.json
├─ assets/b8a|b8b/ 裁好的插图 458 张
├─ expected/       21 份 Pass 1 清单（1958 条源条目）
├─ parts/          21 份 Pass 2 中间格式 + 21 份 .report.md
├─ merged/all.json 两册合一的成品（1178 节点 / 773 边 / 458 资源）
├─ manifest.json   四册元信息 + 目录 + 页码偏移
├─ ocr/            八下、九下的逐页 OCR（无文字层的册子用来校对）
├─ review/         256 个 bbox 核对图 HTML + 11 份复核结论 JSON
├─ audit/          15 份审计报告
├─ coverage.md     结构覆盖率 / 视觉复核 两栏
└─ exceptions-b8a.md  例外清单（含已知限制 15 项）

~/Downloads/苏科版物理-八上八下/   可直接导入的成品（all.json + 458 张图）
```

**成品验证**（三条都该过）：

```bash
bun run scripts/check-examples.ts                    # 5 个内置样例
bun run scripts/merge-book-parts.ts --parts local-textbook/sukey/parts-only \
  --book local-textbook/sukey/book.json \
  --out /tmp/x.json --page-offset 7                   # 应输出 1178 节点 / 773 边 / warnings 0
bun run check:consistent                            # 21 份清单 · 1958 条 · 0 错 0 警
```

---

## 3. 流水线（按顺序，都有 `bun run` 别名）

| 步 | 命令 | 作用 | 幂等 |
|---|---|---|---|
| 1 | `render:pages --volume b8b --from 8 --to 133` | PDF → 整页 PNG + geometry.json | 会跳过已存在 |
| 2 | （子代理）Pass 1 | 逐页看图，产清单：`expected/<册>-<章>-p<起>-<止>.json` | — |
| 3 | `check:expected <清单>` | 单清单 18 条规则 | — |
| 4 | `draw:boxes --expected <清单>` | bbox 叠回页图，生成核对 HTML | 覆盖 |
| 5 | （子代理）Pass 2 | 清单 → `parts/<同名>.json` | — |
| 6 | `check:part <part> --expected <清单>` | 结构/覆盖率/资源闭合/依赖质量 | — |
| 7 | `apply:captions` | 按清单的 `captionOnImage` 把 caption 搬进 alt | 幂等 |
| 8 | `crop:figures --parts local-textbook/sukey/parts` | 按 region 裁图 + 回填 sha256/宽高 | 幂等（`--force` 重裁） |
| 9 | `merge:parts --parts <目录> --book book.json --out merged/all.json --page-offset 7` | 合并成 v9 | — |
| 10 | `report:coverage --parts <目录> --expected <目录>` | 两栏报告 | — |
| 11 | `check:consistent` | 跨批一致性（8 条规则） | — |

---

## 4. 作业规程（每条都是踩出来的，违反过就会出事）

### 4.1 枚举与转写

1. **同章两批必须串行**：先落盘前半 part，再启后半。
   否则后写的代理看不到先写的节点 ID，**跨 part 边会系统性缺失**（八下 c02b 就这样漏了 5 道题的 covers）。
   跨章可以并行。
2. **清单一旦被 Pass 2 消费就不能改条目数**。增删拆条都会让覆盖率对不上。
   确需改，必须连 part 一起改（八上 c05 拆 headline 时踩过）。
3. **清单 `region` 与 part `region` 必须一致**。二者不同步过一次（第一章 30 张），
   后果是**书对、清单坏**——谁按清单重裁就退回带图注的版本。
   同步清单前先确认 part 是"已逐张看过"的那一侧。
4. **改 region 后必须重跑 `check:expected`**：`overlaps` 声明会因为框缩小而失效
   （`overlaps-phantom` / `overlaps-asymmetric` / `overlap-undeclared` 三连）。
5. **figure 的 region 不含印刷图注行，但必须含 `(a)(b)(c)` 标号行**。
   一个图注管多大范围就是一条 figure；外接框会盖到第三方内容时才拆成两条。
6. **图注印在画面上、裁不掉的**（满版出血照、图注压在照片上）→ 清单标 `captionOnImage: true`，
   Pass 2 不写 caption、图注文字放 alt。**标记要打在 figure 条目上**，打错到 heading 会被 `captionOnImage-misuse` 抓。
7. **无文字层的册子**（八下、九下）：用 `ocr/<册>/` 交叉校对虚词和数字，**以页图为准**；
   图注行/子图标号位置只能像素测量，`pdftotext -bbox` 用不上。

### 4.2 修复（最危险的一步）

8. **先改指，改不了再删**。
   八上直接删了 66 条假边 → 137 个节点变孤儿 → 事后补 41 条。
   如果依据成立、只是端点选错，**换端点**。改指时优先"把断言拆成独立命题再指过去"（八上「光能」就是这么救回来的）。
9. **修复完必须报孤立节点变化**（改前/改后、新增的逐个说明）。
10. **修复本身要复审**。八下修了 40 多处，复审抽 20 处发现 **5 处没修好（25% 错误率）**，
    其中一处是"伪定义换了个形态还没解决"。修复代理和复审代理必须是不同的实例。
11. **正文里不许出现元话语**。"图中层级已结构化：…"「mindmap 只能挂在…」这类说明是给人看的，
    模型会当成教材正文抄进去。要写就写进 `tags` 或 `.report.md`。

### 4.3 校验与复核

12. **结构覆盖率 100% 不代表没问题**。分母是清单，清单漏一页、框画小一圈，覆盖率照样 100%。
13. **视觉复核必须逐页**，而且要给它**三个输入**：页图 + 清单 + `merged/all.json`。
    只给前两个会误报（第四五章把 `extraRegions` 覆盖的页判成"整页漏块"）。
14. **审查类任务的报告要记 `from → predicate → to`，不要只记边 id**。
    边 id 每次合并都会重排，审计报告里的 id 在修复后就失效了。
15. **审计抽样的判据要可复述**。例如判"题目有没有知识落点"：
    题干含「用…知识解释/说明/计算」→ 必须有 `covers`；只有「参观/查阅/写/调查/建议/反思」→ 该孤立。

### 4.4 工具与环境

16. **ego-browser 用一个 space 名复用**：`taskSpace("math-note 教材图谱验收")`。
    每换一个名字就新建一个空间（这次开了几十个）。用完 `task.listTaskSpaces()` 清理。
17. **不要用"包含某文字"去点按钮**。这次误点过目录行的删除键，弹出了"级联删除整棵树"的确认框。
    用 `[aria-label]`、`[data-*]` 之类的精确选择器。
18. **`local-textbook/` 在 .gitignore 里**，`git status` 干净是正常的；代码和文档才进仓库。

---

## 5. 否决清单（不要重新发明）

| 已否决 | 原因 |
|---|---|
| `implies` / `iff` / `proves` / `generalizes` / `refutes` | 初中物理没有可机器判定的形式推理，用了只会造假 |
| 把栏目框（信息快递/读一读/生活物理社会）整块做成 `definition` | 栏目是容器，不是术语；正确做法是「栏目 `note` + 里面定义句单独 `definition`」 |
| 把断言留在 `note` 里 | §4.1 优先于 §4.0：可判真假的结论必须立 `proposition`，否则没有端点挂 supports/covers |
| 为消除孤立而硬连 | 零条边好过错一条边。纯实践调查题、栏目容器、编者按本来就该孤立 |
| 用固定像素窗口测 region | 会截断右边界（第九章整章这么错过） |
| 按清单重裁图 | 先核 part 的 region 是否已同步 |
| 让审查代理"顺手修一下" | 审计只读，修复另派，否则分不清谁改了什么 |

---

## 6. 已知限制（不打算修，别当 bug 报）

1. 栏目框整框一条，框内正文没有独立条目 → 核对图上像"整段无框"
2. `extraRegions` 不被 `draw-expected-boxes` 绘制 → 跨页续接区在核对图上看不见
3. 双栏例题的「分析/解答/反思」框只覆盖左栏（约 6 处）→ 只影响核对图，正文完整
4. 章首页的节目录导航列表在框内但不单独登记（按目录处理）
5. 思维导图的四类结构 mindmap 表达不了：多父汇流 / 双中心 / 有环 / 无落点 → 记在节点 `tags` 的 `mindmap:*` 里
6. 12 道题零 `covers`（已逐题判定为纯实践题）
7. 图 4-38 是跨书脊拼接图，`manual: true`，裁图脚本会跳过它

---

## 7. 本机环境

```
bun 1.4 / node 26 · vitest · vite 8
pdftoppm / pdfimages（poppler）· python3 + PIL 13 · sips
ego-browser（ego lite，单 space 复用）
仓库：/Users/laysath/Projects/math-note（package name: textbook-graph）
dev server: bun run dev → localhost:5173
```

---

## 8. 九年级怎么开工

**前提**：先读 `docs/plans/transcribe-spec.md`（567 行，全部规则 + 每个规则背后的真实页面案例）。

### 8.1 两册的实际结构（已从 manifest 核过，不用再查）

```
pageOffset 全四册一致：pdfPage = printedPage + 7（正文 pdf 8 起；附录之后是后记/封底，无页码）
章号全书连续：八上 1–5、八下 6–10、九上 11–14、九下 15–18
```

| 册 | 章 | 章名 | 印刷页 | PDF 页 | 页数 | 节 | 建议批数 |
|---|---|---|---|---|---|---|---|
| 九上 | 11 | 简单机械和功 | 1–28 | 8–35 | 28 | 5+跨学科 | 2 |
| 九上 | 12 | 机械能和内能 | 29–54 | 36–61 | 26 | 4 | 2 |
| 九上 | 13 | 简单电路 | 55–82 | 62–89 | 28 | 5+跨学科 | 2 |
| 九上 | 14 | 欧姆定律 | 83–106 | 90–113 | 24 | 4+跨学科 | 2 |
| 九上 | 附 | 常用物理量+中英文索引 | 107–109 | 114–116 | 3 | — | **不转** |
| 九下 | 15 | 电功和电热 | 1–28 | 8–35 | 28 | 4+跨学科 | 2 |
| 九下 | 16 | 电和磁 | 29–62 | 36–69 | 34 | 4+跨学科 | 2 |
| 九下 | 17 | 电磁波与现代通信 | 63–84 | 70–91 | 22 | 3 | 1 |
| 九下 | 18 | 能源与可持续发展 | 85–110 | 92–117 | 26 | 4+跨学科 | 2 |
| 九下 | 附 | 常用物理量+中英文索引 | 111–113 | 118–120 | 3 | — | **不转** |

合计 **15 批 Pass 1 + 15 批 Pass 2**，正文 222 页。

**附录不转写**：与八上八下同一处理，已在 `exceptions-b8a.md` 头部记过理由（工具性参考页，非教学内容）。
但 `manifest.json` 的 toc 里它是个 chapter，合并时**不要**给它建 branch，否则会出现空章节点。

### 8.3 开工前必须先补的一件事：`entities.json` 不存在

规约 §9 要求批次开跑前查跨册实体注册表，`merge:parts` 也有 `--entities` 参数——
**但八上八下从来没传过，`local-textbook/sukey/entities.json` 不存在。**

后果已经能量到：八下 parts 里指向八上节点的边只有 **4 条**（而八下第七章「力」到处在用八上第五章的「速度」）。
八年级还能靠“子代理读过前一份 part”蒙混，**九年级会直接崩**：九下第十五章「电功和电热」整章建立在九上的电压/电流/电阻上，
没有注册表就会在九下重量产一批重复概念节点。

开工前做这两件事：

1. **导出初始注册表**：从 `merged/all.json` 取全部 `type=definition` 且有 `key` 的节点，
   写成 `entities.json`（`{id, key, title, aliases, firstSeen}`）。这是机械导出，不用重新判断。
2. 之后**每次合并都传 `--entities local-textbook/sukey/entities.json`**，让它自己长。

### 8.4 九上 → 九下 必须串行

规约 §9：“册与册之间的合并**串行**（b8a → b8b → b9a → b9b）”。
具体到九年级就是：

- 九上 4 章全部 Pass 2 完成、合并进 `all.json` 之后，**才能开九下的 Pass 2**
- 九下的 Pass 1（枚举）可以提前并行跑，因为它不建边

如果九下 Pass 2 里出现指向 `phy-b9a-*` 的边但九上还没合并，
`check:part` 会把它降级成 `external-endpoint` 警告——**这不是错误，合并时才是硬校验**。

### 8.5 步骤

1. `render:pages --volume b9a --from 8 --to 116`（再 `--volume b9b --from 8 --to 120`）
2. 每册 7–8 批 Pass 1（按章切，章 22–34 页，每批 11–17 页），**跨章可并行**
3. `check:expected` + `draw:boxes` 逐批过
4. Pass 2 按章派，**同章两批串行**
5. 四章审计 + 关系审计（这次要专门看 `InferenceStep`：九上电学是全书唯一有"多前提共同推出结论"的地方，八上八下 0 条是因为内容里确实没有）
6. 修复 → **修复后复审**（换实例）
7. 视觉复核逐页（三个输入：页图 + 清单 + merged）
8. 合并 → 界面验证 → 更新 coverage / exceptions → 提交

**九年级的预期新问题**

- **电路图**：全书图形密度最高。元件符号密集、引线细，region 要按整体电路图框，
  不能框到单个元件；`(a)(b)` 子图、电路图旁边的“图 13-5”标注行都需像素测量
- **公式推导**：九上 14.3 欧姆定律、九下 15.3 焦耳定律是 `InferenceStep` 的首次真实素材。
  要先把前提建成 `proposition`，再建超边；**前提必须是可判真假的断言**，不能是短语
- **串并联**：13.5“串、并联电路的特点”是 `is-a` / `part-of` 的密集处，也容易出现一命题挂十几条 `covers` 的星形
- **单位与量纲**：新出现 `\text{A}`、`\text{V}`、`\Omega`、`\text{kW·h}`，`\Omega` 写法要与已有节点统一
- **图片量的估计**：这两册图密度高于八上八下，total 条目可能到 1500–1800，子代理单批负载要控制
- **无文字层**：九上**有**文字层，九下**没有**（用 `ocr/九下/` 逐页校对）；九上可直接 `pdftotext -bbox` 量位置

---

## 9. 词汇表

| 词 | 意思 |
|---|---|
| **清单 / expected** | Pass 1 产物，覆盖率的分母：一条 srcId 对应版面上一块 |
| **srcId** | 源条目 ID，形如 `phy-b8a-p045-02`（册 + 印刷页码 + 页内序） |
| **part** | Pass 2 产物，分章中间格式（无 order/时间戳/边 id，由合并器补） |
| **node id** | 图谱节点 ID：结构节点用 `phy-b8a-c01-s02`，内容节点也用页码派生 `phy-b8a-p045-02` |
| **`@1`/`@2`** | 同一源条目拆成多个节点时的后缀 |
| **`captionOnImage`** | 图注印在画面上、裁不掉 → 不写 caption，图注放 alt |
| **`manual: true`** | 手工装配的 asset（跨页拼接），裁图脚本跳过 |
| **fully-reviewed** | 该章每一页都人工看过核对图（不是抽样） |
| **结构覆盖率** | 已映射 srcId / 清单条目数；与"视觉复核"是两个独立指标 |

---

## 10. 需要 deeper context 时，用 vcc_recall 捞这些词

```
"transcribe-spec 第几版"      规则是怎么一版版改出来的
"图 7-28" / "图 1-11"         拆与并的判据出自哪两个真实页面
"孤儿" / "137"                八上删边事故
"元话语"                      说明性指令被当成教材正文
"covers 星形"                 同一命题挂 7 条 covers
"captionOnImage"              图注重复显示的两轮排查
"region 不一致"               清单与 part 不同步
```
