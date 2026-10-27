# Handoff：苏科版初中物理整书转写

> 最后更新：九年级上册 8 份 part 全部完成、校验通过之后暂停的那一刻。
> **新会话读完这份 + `transcribe-spec.md` 就能接着干，不需要任何会话历史。**
> 需要更早的细节用 `vcc_recall`，检索词见文末。

---

## 1. 一句话现状

**八年级上、下两册（272 页正文）已完整交付**（转写 + 审计 + 修复 + 逐页视觉复核 + 裁图 + 合并，`~/Downloads/苏科版物理-八上八下/`）。
**九年级上册（109 页）转写完成，8 份 part 全部通过校验，但尚未审计、未裁图、未合并。**
**九年级下册（113 页）只有 1 份 Pass 1 清单。**

---

## 2. 盘上有什么

```
local-textbook/sukey/                      （.gitignore，受版权，不进仓库）
├─ raw/                 4 册 PDF（343 MB）
├─ pages/b8a b8b b9a b9b/  整页渲染 PNG（200 dpi）：151 / 126 / 109 / 113 张 + geometry.json
├─ expected/            Pass 1 清单：八年级 21 份（1958 条）+ 九年级上 8 份（792 条）+ 九下 1 份
├─ parts/               Pass 2 中间格式：八年级 21 份（1178 节点 / 773 边 / 458 资源）
│                                              九上  8 份（421 节点 / 268 边 / 178 资源）
├─ merged/all.json      八年级成品的合并结果
├─ entities.json        跨册实体注册表（108 条，八年级定义节点导出）
├─ ocr/                 八下 138 份、九下 122 份逐页 OCR（无文字层的册子校对用）
├─ review/              bbox 核对图（HTML，按册/章分目录）
├─ audit/               八年级 15 份审计报告 + scan-parts.md（机械候选清单）
└─ coverage.md          结构覆盖率 / 视觉复核 两栏（由脚本生成，不要手改）
```

**工程脚本**（都在仓库里、已提交）：见 §7 的表。

---

## 3. 一键看状态

```bash
cd /Users/laysath/Projects/math-note

# 清单质量
bun run check:expected local-textbook/sukey/expected/<清单>.json     # 坐标合法性 / 重叠 / 暂停
bun run check:lines    --expected local-textbook/sukey/expected/<清单>.json   # 正文行有没有漏框（有文字层的册子）
bun run check:ink      --expected local-textbook/sukey/expected/<清单>.json   # 无文字层用这个

# 产物质量
bun run check:part local-textbook/sukey/parts/<part>.json --expected local-textbook/sukey/expected/<part>.json

# 批量看九上八份现状
for f in local-textbook/sukey/parts/b9a-*.json; do
  n=$(basename $f .json); printf "%-24s " $n
  bun run check:part "$f" --expected "local-textbook/sukey/expected/$n.json" 2>&1 | tail -1
done
```

当前预期：**八份全部「错误 0 → 通过」，覆盖率 100%**。告警只有两三类：`asset-pipeline-pending`（等裁图回填）、`external-endpoint`（跨 part 端点，合并时才硬校验）、个别 `depends-on-same-subsection`（已逐条在 report 里说明理由）。

---

## 4. 流水线

| 步 | 命令 / 谁做 | 作用 | 幂等 |
|---|---|---|---|
| 1 | `render:pages --volume b9b --from 8 --to 120` | PDF → 整页 PNG + geometry.json | 跳过已存在 |
| 2 | **子代理** Pass 1 | 逐页看图产清单 | — |
| 3 | `check:expected` + `check:lines`/`check:ink` | 清单两道关 | — |
| 4 | `draw:boxes --expected <清单>` | bbox 叠回页图，出核对 HTML | 覆盖 |
| 5 | **子代理** Pass 2 | 清单 → part | — |
| 6 | `check:part <part> --expected <清单>` | 结构/覆盖率/资源闭合/依赖质量 | — |
| 7 | `apply:captions` | 按 `captionOnImage` 把图注搬进 alt | 幂等 |
| 8 | `crop:figures --parts local-textbook/sukey/parts` | 按 region 裁图 + 回填 sha256/宽高 | 幂等（`--force` 重裁） |
| 9 | `merge:parts --parts <目录> --book book.json --entities entities.json --out merged/all.json --page-offset 7` | 合并成 v9 | — |
| 10 | `report:coverage --parts <目录> --expected <目录>` | 两栏覆盖报告 | — |
| 11 | `check:consistent` | 跨批一致性（8 条规则） | — |

**册分支节点不自动生成**：`phy-<册>` 必须写进**该册第一个 part**（b8a 在 c01、b8b 在 c06、b9a 在 c11 前半、b9b 在 c15 前半）。漏了整册会变成孤儿。

---

## 5. 作业规程

### 5.1 枚举与转写

1. **同章两批 Pass 2 必须串行**：先落盘前半 part，再启后半，否则后写的看不到先写的节点 ID，跨 part 边会系统性缺失。跨章可以并行。
2. **清单一旦被 Pass 2 消费就不能改条目数**。确需改，必须连 part 一起改。
3. **清单 `region` 与 part `region` 必须一致**。Pass 2 把 figure 的 region 原样复制进 `assets[]`；
   清单事后被重测，必须让**同一个 Pass 2 代理**做一次同步（按「同页第 N 张图」配对），否则裁出来的图全是旧框。
4. **改 region 后必须重跑 `check:expected`**：框长大/缩小会让 `overlaps` 声明失效
   （`overlaps-phantom` / `overlap-undeclared` / `overlaps-is-containment`）。
5. **`figure` 的 region 不含印刷图注行，但必须含 `(a)(b)(c)` 标号行**。
   一个图注管多大范围就是一条 figure；外接框会盖到第三方内容时才拆成两条。
6. **图注印在画面上、裁不掉的** → 清单标 `captionOnImage: true`，Pass 2 不写 caption、图注文字放 alt。
   **标记要打在 figure 条目上**。
7. **region 不要目测**。有文字层的册子用 `pdftotext -bbox`（除以 `<page width height>` 即归一化坐标）；
   没文字层的用 `page:bands`。目测的后果实测过：整批 region 偏短 1–3 行，45 行正文落在框外，
   而 `check:expected` 完全看不出来。

### 5.2 修复（最危险的一步）

8. **先改指，改不了再删**。八年级直接删了 66 条假边 → 137 个节点变孤儿 → 事后补 41 条。
9. **修复完必须报孤立节点变化**（改前/改后、新增的逐个说明）。
10. **修复本身要复审**，且复审必须与修复是**不同实例**。八下实测修复错误率 **25%**。
11. **正文里不许出现元话语**。「图中层级已结构化：…」这类说明会被当成教材正文。

### 5.3 校验与复核

12. **结构覆盖率 100% 不代表没问题**。分母是清单，清单漏页、框画小，覆盖率照样 100%。
    `check:lines`（有文字层）/ `check:ink`（无）就是补这个缺口的。
13. **视觉复核必须逐页**，且必须给**三个输入**：页图 + 清单 + `merged/all.json`。只给前两个会误报。
14. **审查类报告要记 `from → predicate → to`，不要只记边 id**。边 id 每次合并都会重排。
15. **抽样判据要可复述**（「N 个节点里等距取 floor(i·N/k)」），不许写「抽查了若干」。

### 5.4 子代理与环境

16. **并发上限 3 个**。超了会出现整批请求同时超时的现象，返工比排队慢。队列见 `b9-queue.md`。
17. **网络超时 / 连接错误 → 原样发「继续」，不换模型**。实测 deepseek-flash 偶发超时，续上即可。
18. **不要让代理「像素级对齐」**。给它 `page:bands` 的条带表和页图，±0.005 就收工，剩下交给核对图那一轮。
19. **`use` 之类的校验器硬约束会打回设计**：`uses` 的起点不能是 `proposition`（实测），
    `note` 下只能挂 `note`，`branch` 下不能直接挂命题。
20. **`local-textbook/` 在 .gitignore 里**，`git status` 干净是正常的。

---

## 6. 否决清单（不要重新发明）

| 已否决 | 原因 |
|---|---|
| `implies` / `iff` / `proves` / `generalizes` / `refutes` | 初中物理没有可机器判定的形式推理 |
| 把栏目框整块做成 `definition` | 栏目是容器；正确做法是「栏目 note + 里面定义句单独 definition」 |
| 把断言留在 `note` 里 | 可判真假的结论必须立 `proposition`，否则没有端点挂 supports/covers |
| 为消除孤立而硬连 | 零条边好过错一条边 |
| 用固定像素窗口测 region | 会截断右边界（第九章整章这么错过） |
| 给 figure 加**同页** `extraRegions` 去「声明覆盖」图注行 | `extraRegions` 语义是跨页续接区；这么干只是骗过检查器 |
| 并排图按 `region.y` 排序配对 | 两图 y 差 0.0037 就互换；**按页内 srcId 顺序配对**，配完裁图核对 |
| 让审查代理「顺手修一下」 | 审计只读，修复另派，否则分不清谁改了什么 |

---

## 7. 这轮新增的工程工具

| 命令 | 作用 | 基线 |
|---|---|---|
| `check:lines` | 用 PDF 文字层**每一行**做探针，查 region 漏没漏正文 | 八年级 0–3 行（全是图注残留） |
| `check:ink` | 只统计**文字墨迹**（形态学开运算减掉照片），给无文字层册子兜底 | 八上 86–90% / 九上 94% |
| `page:bands` | 页面墨迹条带 → 每块归一化矩形，代替 `pdftotext -bbox` | — |
| `scan:parts` | 把「判断类」要求变机械候选：断言引导词 / 伪定义 / 公式散落 / 元话语 | 八年级 21 份扫出 82 条 |
| `check:recall` | 句级召回，拿 PDF 原文反查图谱完整度 | 八上 91.0%（未命中多为双栏并行的产物） |
| `export:entities` | 从 `all.json` 导出跨册实体注册表 | 108 条 |

**为什么加这些**：八年级审计的结论是「写成『必须/禁止』的规则执行准确率接近满分，
写成『应该这样判断』的地方只有一半」。所以能机械识别的绝不靠代理人肉判断。

---

## 8. 恢复顺序

**先读三个文件**：`b9-status.md`（暂停快照 + 逐批数字）、`b9-queue.md`（13 条队列，带解锁关系）、`b9-issues.md`（问题单）。

### 第一批（并发 3）

1. **章审计 ×3**：十一、十二、十三章（十四章随后）
   - 任务书 `audit-b9-task.md` §A，输入是两份 part + 清单 + **逐页页图**，只读
   - 先读 `bun run scan:parts` 的候选，逐条去页图核实
   - 输出 `audit/b9a-c<章号>.md`，缺陷必须写位置 → 问题 → 页图证据
2. **Pass 1 K**（`b9b-c16-p036-053`）：清单已有，只差 p0042 三处框
   - 第 2 题 region 短一行；第 4 题的框是 y≈0.444 的空条带（题干在 0.4849）；图 16-13 的 region 盖住题干却没盖住图片（图片在 0.65–0.84，标号行 0.8301，图注行 0.8530）

### 之后

- 九下 Pass 1 剩 7 批（I / J / L / M / N / O / P），每批 ~15 页
- 九下 Pass 2：只挂**已裁剪好 region 的** part（九下没有文字层 + 十四页以后的区域，务必用 `page:bands` 当标尺），同章两批串行
- 九上 audits 完成后 → 修复 → 复审（换实例）→ 视觉复核逐页
- 全部 part 齐 → **跨章补边**（见 §9 第 1 条）→ 裁图 → 合并 → 界面验证 → 更新 coverage/exceptions → 提交 → 交付到 `~/Downloads/`

---

## 9. 欠账（不做完不算完成）

1. **跨章 / 跨册补边**。九上各批落盘时别的批还没写，拿不到对方节点 ID，所以委托给后续批次补。
   实测九上目前**几乎没有**「十三 章电流电压 → 十四 章欧姆定律 → 十五 章电功」这条链上的边。
   全部 part 齐后单跑一轮，用**合并后的** `all.json` 查真实 ID。
2. **region 同步**。c12、c14 已做完（分别 22 条、20 条 asset）。九下每批若清单事后重测，同样要做。
3. **`entities.json` 只含八年级 108 条**。九上各批报告里列了新建的核心概念（约 60 个 key），
   合并时要用 `merge:parts --entities entities.json` 让它自己长。
4. **视觉复核一页都还没做**（九上）。八年级是逐页三个输入过的。
5. **附录不转写**（九上 107–109 / 九下 111–113：单位表 + 索引）。`manifest.json` 的 toc 里它是 chapter，
   合并时**不要**给它建 branch。

---

## 10. 词汇表

| 词 | 意思 |
|---|---|
| **清单 / expected** | Pass 1 产物，覆盖率的分母：一条 srcId 对应版面上一块 |
| **srcId** | `phy-b9a-p045-02`（册 + 印刷页码 + 页内序） |
| **part** | Pass 2 产物，分章中间格式（无 order/时间戳/边 id，由合并器补） |
| **`@1`/`@2`** | 同一源条目拆成多个节点时的后缀 |
| **`captionOnImage`** | 图注印在画面上、裁不掉 → 不写 caption，图注放 alt |
| **`extraRegions`** | **跨页续接区**，不是「再框一块」的通用字段 |
| **`manual: true`** | 手工装配的 asset（跨页拼接），裁图脚本跳过 |
| **fully-reviewed** | 该章每一页都人工看过核对图（不是抽样） |
| `assets 数` | = 清单里 `figure` 条数 + `summary` 条数（思维导图也存 asset） |

---

## 11. 需要更深上下文时，用 vcc_recall 捞

```
"45 行"             C 那份清单整批 region 偏短的事故
"extraRegions"      F 用同页 extraRegions 骗检查器、被撤回
"并排图" / "12-15"  按 y 排会互换，改按 srcId
"557 / 554 / 超时"   网络抖动，一律原样继续不换模型
"图 7-28" / "图 1-11"  拆与并的判据出自哪两个真实页面
"孤儿" / "137"      八上删边事故
"元话语"            说明性指令被当成教材正文
"invalid-endpoint-type"  uses 起点不能是 proposition
```
