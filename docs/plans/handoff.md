# Handoff：苏科版初中物理四册 → v9 图谱

> 写于 2026-10-27 晚，**交接给下一个主代理**。
> 读完这份 + `transcribe-spec.md`，就能接手，不需要任何会话历史。
> 需要更早的决策细节用 `vcc_recall`，检索词见文末。

---

## 1. 一句话现状（最终，2026-10-27 夜）

**四册 536 页转写、8 章审计、8 章修复、8 章视觉复核全部完成；四册合并 2084 节点 / 1470 边 / 818 资源 / warnings 0。**
**交付已生成并做界面验证：`~/Downloads/苏科版物理-全四册/`（all.json + 818 张图）与重出的 `~/Downloads/苏科版物理-八上八下/`。**

```
                                   最终状态
Pass 1 清单（37 份，3584 条）         100%  · check:expected 0 错 0 警
Pass 2 part（37 份）                  100%  · check:part 全 0 错误
四册合并                             2084 节点 / 1470 边 / 818 资源 / warnings 0
章审计（8 章）                        100%
章修复（8 章）                        100%  · c16 的 D1–D11 已修
视觉复核（8 章 216 页）                100%  · 19/19 章 fully-reviewed
coverage / exceptions / 界面验证 / 交付   100%  · 见 §13
```

---

## 2. 盘上有什么

```
local-textbook/sukey/
├─ raw/                 4 册 PDF（343 MB）
├─ pages/b8a b8b b9a b9b/   整页 PNG（200 dpi）：151 / 126 / 109 / 113 + geometry.json
├─ expected/            16 份九年级清单（8 上 + 8 下）+ 21 份八年级
├─ parts/               37 份 part（八年级 21 + 九上 8 + 九下 8）
├─ parts-all/           parts 的逐字节副本，合并用（每次合并前 cp）
├─ merged/4vol.json     四册合并产物（**稳定路径，最终 2084 节点**；`merged/all.json` 是八年级单册旧产物，别用）
├─ entities.json        跨册实体注册表 **229 条**（merge 维护的 live 版，含 21 条非 definition key；**不要跑 export:entities**，会丢）
├─ assets/b8a b8b b9a b9b/  818 张裁好的图（b8a 260 / b8b 198 / b9a 178 / b9b 182）
├─ audit/               8 份章审计 + 8 份修复报告 + 2 份修复后验证 + add-edges-b9a/b9b + suggest-*.md
├─ review/nodes-b9a b9b/    「节点叠加图」（视觉复核的主要输入）
├─ review/b9*-c*.json/md    8 章视觉复核记录（全部 fully-reviewed）
├─ exceptions-b9a.md    九上例外清单
├─ exceptions-b9b.md    九下例外清单
├─ ocr/                 八下、九下的逐页 OCR（无文字层的册子校对用）
└─ coverage.md          两栏报告（脚本生成，别手改）
```

`/tmp/merged-4vol.json` 是临时合并产物（重启会丢）；稳定产物用 `merged/4vol.json`。

---

## 3. 怎么验证（三条都该过）

```bash
cd /Users/laysath/Projects/math-note

# 单份 part
bun run check:part local-textbook/sukey/parts/<part>.json \
  --expected local-textbook/sukey/expected/<同名>.json

# 四册合并（会就地改写 entities.json，见 §6 第 4 条）
cp local-textbook/sukey/parts/*.json local-textbook/sukey/parts-all/
bun run merge:parts --parts local-textbook/sukey/parts-all \
  --book local-textbook/sukey/book.json --entities local-textbook/sukey/entities.json \
  --out /tmp/merged-4vol.json --page-offset 7
# 期望：2084 节点 / 1470 边 / 818 锚点 / 818 资源 / warnings 0

# 跨批一致性
bun run check:consistent
```

合并后自检两条不变式（脚本没有内置这两条，要自己跑）：

```python
deg = Counter(); [deg.update([e['from'], e['to']]) for e in g['edges']]
iso = [n for n in g['nodes'] if n['type'] in ('definition','proposition') and deg[n['id']]==0]
# 期望：iso == []           ← 定义与命题必须有落点
# 期望：depends-on 无环     ← DFS 检测
```

---

## 4. 流水线

| 步 | 命令 / 谁做 | 作用 | 幂等 |
|---|---|---|---|
| 1 | `render:pages --volume b9b --from 8 --to 120` | PDF → 整页 PNG + geometry | 跳过已存在 |
| 2 | **子代理** Pass 1 | 逐页看图产清单 | — |
| 3 | `check:expected` + `check:lines`（有文字层）/ `check:ink`（无） | 清单关卡 | — |
| 4 | `draw:boxes --expected <清单>` | 按清单画的核对图 | 覆盖 |
| 5 | **子代理** Pass 2 | 清单 → part | — |
| 6 | `check:part` | 结构/覆盖率/资源闭合/依赖质量 | — |
| 7 | `apply:captions` | 按 `captionOnImage` 处理图注 | 幂等 |
| 8 | `crop:figures --parts .../parts` | 按 region 裁图 + 回填 sha256 | 幂等（`--force` 重裁） |
| 9 | `merge:parts` | 合并成 v9 | — |
| 10 | `report:coverage` | 两栏报告 | — |
| 11 | `check:consistent` | 跨批一致性 8 条 | — |
| 12 | `draw:nodes --volume b9b --out review/nodes-b9b` | 节点叠加图（复核用） | 覆盖 |

---

## 5. 剩下要做的事（按顺序）

### 5.1 视觉复核（最大一块，8 章 222 页）

任务书 `docs/plans/audit-b9-task.md` §E。**必须给三个输入**：节点叠加图 + 清单 + `merged/all.json`。只给前两个会误报。

已在跑的 7 章：c11 c12 c13 c14（九上）、c17 c18（九下，c15 未派、c16 待修复）。
- 输出：`review/<册>-c<章>.json`（每页一条记录，**缺页 = 没复核**）+ 同名 `.md` 摘要
- 复核完**汇总所有 defect**，按 `missing-block / wrong-region / caption-duplicated / merged-wrong / cut-off` 分类，再决定是否派修复
- 修完必须重跑 `check:part` + `check:expected`（改 region 会牵动 overlaps）

### 5.2 收尾交付

```bash
bun run report:coverage --parts local-textbook/sukey/parts --expected local-textbook/sukey/expected
```
→ 更新 `coverage.md` 两栏（结构覆盖率 / 视觉复核状态，**两个独立指标，禁止合并成一个进度数**）

写 `exceptions-b9a.md` / `exceptions-b9b.md`（格式抄 `exceptions-b8a.md`），必含 **§7 的 3 条源缺陷**。

最终合并 → 裁图 → 界面验证 → 交付：

```
~/Downloads/苏科版物理-全四册/
├─ all.json
└─ assets/b8a b8b b9a b9b/   （818 张）
```

**八年级那份交付物要重新生成**——18 张思维导图的 mermaid 全改过，旧的 `~/Downloads/苏科版物理-八上八下/` 已过时。

界面验证用 ego-browser，**单 space 名复用**：`taskSpace("math-note 教材图谱验收")`。导入流程实测可用：

1. `page.click('button[aria-label="导入"]')` 前先 `page.waitForFileChooser()`
2. 选 `/tmp/merged-4vol.json` → 弹窗点「确认导入」（用 `innerText === '确认导入'` 精确匹配，**别用「包含某文字」**）
3. 图片走 `page.setInputFiles('input[accept="image/*"]', [...])`，**靠 sha256 自动匹配**，实测 4/4 命中
4. dev server 端口可能不是 5173（`bun run dev` 会顺延），以 `/tmp/dev.log` 为准

---

## 6. 必须知道的坑（违反过就会出事）

1. **同章两批 Pass 2 串行**。后写的看不到先写的节点 ID，跨 part 边会系统性缺失。
2. **清单冻结的信号是 Pass 1 代理的完工报告，不是 `check:expected` 通过**。有一次我在 Pass 1 代理还在改的时候就派了 Pass 2，清单从 129 条变成 125 条，part 得整份重建。
3. **清单 region 与 part 一致**。Pass 2 把 figure 的 region 原样复制进 `assets[]`。清单事后重测就必须让**同一个 Pass 2 代理**做同步：按「同页第 N 张图」配对，**并排图按 srcId 顺序，不按 y**（实测两图 y 差 0.0037 就会互换 caption）。
4. **`merge:parts --entities` 会就地改写 entities.json**——它不是只读的。用探针跑合并时要么不传 `--entities`，要么事后还原。
5. **`export:entities` 默认读 `merged/all.json`（八年级单册）**，会把注册表缩回 108 条。必须 `--graph /tmp/merged-4vol.json`。
6. **`captionOnImage` 只存在于清单 item**，part 的 `assets[]` 里填它是越权字段，合并会拒（`unknown-field`）。
7. **`uses` 的起点只能是 `note` / `problem`**。命题或定义当起点 → `invalid-endpoint-type`。命题引用原理时用 `depends-on`。
8. **`note` 下只能挂 `note`**；`branch` 下不能直接挂命题。栏目内部小标题永远不是 `heading`（会建出非法 section）。
9. **`is-a` / `part-of` 两端都必须是 `definition`**。定义降级为 note 时，这两类边要改成 `cites`。
10. **先改指，改不了再删**。八年级直接删了 66 条假边 → 137 个孤儿 → 事后补 41 条。
11. **修复本身有 20–25% 错误率**。修复代理与审计代理必须是不同实例；大批修复后要抽检。
12. **新增节点后要查度数**。修复轮引入的新命题如果不接边，就成了零度节点（第十二章踩过一次，`p031-01` 漂了一轮）。

---

## 7. 三条源 PDF 缺陷（别当裁图失败修）

| 图 | 位置 | 情况 |
|---|---|---|
| 图 16-50 白鹤滩水电站 | 九下 pdfPage 63 | 整页压平为单张 JPEG，该处照片丢版；`pdfimages -list` 只有 1 个全页对象 |
| 图 18-5 海上风力发电场 | 九下 pdfPage 95 | 同上，只剩印在浅青空框里的白色图注 |
| 图 12-32 | 九上 pdfPage 56（印刷 49） | PDF 里就是半截图：stencil 墨迹从第 0 列起，页面 830–867 无墨 |

处理：保留 asset 与图号，`alt` 陈述事实（不描述不存在的画面），登记进 exceptions。

---

## 8. 已定的两条政策（审计会引用来反驳你，别推翻）

**① 栏目内陈述立不立命题**（`transcribe-spec.md` §4.1）：
- **立**：物理结论，且后续会被依赖或被题目考查
- **不立**：历史 / 工程 / 生活实例 / 装置叙述（例：「中国天眼是目前最大的单口径射电望远镜」）
- 判据：这条陈述将来会被谁引用？没有答案就不立

**② 栏目节点的 `originalNumber` 写栏目标题**（§6）：`numberDisplayFor()` 有它就显示它，否则退回 UI 自动编号（会显示「1.2.3」这种原书不存在的编号）。**审计不要把它当「填错编号」报**。

---

## 9. 工程工具一览（这轮新增）

| 命令 | 作用 | 校准/基线 |
|---|---|---|
| `check:lines` | PDF 文字层逐行做探针，查 region 漏没漏正文 | 八上 0–3 行（全是图注残留） |
| `check:ink` | 只统计**文字墨迹**（形态学开运算减掉照片），给无文字层册子兜底 | 八上 86–90% / 九上 94% |
| `page:bands` | 页面墨迹条带 → 每块归一化矩形，代替 `pdftotext -bbox` | — |
| `draw:nodes` | 清单条目按「变成了哪个节点」上色画回页图 | 视觉复核主输入 |
| `scan:parts` | 把判断类要求变机械候选（断言引导词/伪定义/公式/元话语） | **命中率 0/4（c13 实测），别按候选数排人力** |
| `suggest:edges` | 跨章依赖候选 | **召回差**：九下 90 条新边里只有 40 条来自候选 |
| `check:figure-edges` | 图框切边候选（外侧条带方差） | 八年级 44/458 误报 10%，**候选不是关卡** |
| `check:recall` | 句级召回，拿 PDF 原文反查完整度 | 八上 91.0% / 九上 91.2%（先还原 LaTeX 符号再比） |
| `export:entities` | 从合并产物导出实体注册表 | 记得 `--graph` |

---

## 10. 数据画像（判断新内容是否异常的参照）

```
                      节点   边   资源   命题  定义
九上（c11–c14）        433   339   178   58   55
九下（c15–c18）        475   358   182   88   50
合计（九年级）          908   697   360  146  103
八年级（最终）         1175   773   458  139  124
四册合计              2084  1470   818  286  225

边/节点：八年级 0.66 · 九上 0.78 · 九下 0.75
命题占比：八年级 11.8% · 九上 13.4% · 九下 18.5%（九年级定律/公式更密，正常）
```

九下命题密度高，是因为电学有大量「电流/电压/电阻/电功/电功率/焦耳定律」的可判真假结论。

---

## 11. 需要更深上下文时，用 vcc_recall 捞

```
"电压 空心定义"       c13 那条伪定义（只有符号+单位），c14 三条边指着它
"参数表 表头"          c15 自造表头，全项目最严重的一类（编造结构）
"非清洁能源"           entities 里语义反了的别名
"=> 不是边标签"        18 张导图 mermaid 通病，实测渲染只有 3 个节点
"活动 12.5 劈成两个"    同名双节点，合并要跨 part 挪
"45 行"               C 那份清单整批 region 偏短
"137 孤儿"            八年级删边事故
"并排图 12-15"         y 差 0.0037 导致 caption 互换
"图 16-50 / 图 18-5"  源 PDF 缺图
```

---

## 12. 停掉子代理那一刻的状态（2026-10-27 夜）

全部子代理已停止。**名下工作以磁盘为准**——`parts/`、`audit/`、`review/` 里已有的就是完成的。

### 已验证（停止后重跑过）

```
37 份 part          全部 JSON 可解析 · check:part 全部 0 错误
四册合并            2084 节点 · 1470 边 · 818 资源 · 818 锚点 · warnings 0
不变式             孤立定义/命题 = 0 · depends-on 无环 · 推理步骤 0
```

### 停止时的任务状态

| 任务 | 状态 | 说明 |
|---|---|---|
| 章审计 ×8 | **全部完成** | 报告在 `audit/b9a-c11…c14.md`、`b9b-c15…c18.md`，共 340+ 行/份 |
| 章修复 ×7 | **完成** | `audit/fix-b9a-c11…c14.md`、`fix-b9b-c15/17/18.md` |
| 修复 c16（九下电和磁） | **未开始** | 代理刚读完报告就被停；审计报告已就绪（340 行，11 条缺陷） |
| 视觉复核 ×8 | **0 章产出** | 7 个代理都在「刚读完任务书」阶段被停，`review/` 下没有任何 `b9*-c*.json` |

### 恢复方式

- 目录里已有的 agent 会话仍可续：`send_agent_prompt(agentId, "继续")`。但视觉复核那 7 个基本没进展，**建议直接重新派**（一次派 2–4 章，别忘了给节点叠加图 + 清单 + merged 三个输入）。
- 修复 c16 的 prompt 我写在 `/tmp/prompt-fix-c16.md`（重启机器会丢，可按 §5 的规则重写：核心是「35 处 region 同一根因，按四组规则一次性重裁，不要逐条手改」）。

### 下一步（建议顺序）

1. **修复 c16**（唯一还没修的章）
2. **视觉复核 8 章 222 页** —— 这是最大的一块，也是唯一的空白
3. 复核汇总 → 有缺陷的派修复 → 修完重跑 `check:part` / `check:expected`
4. `report:coverage` 重生成两栏
5. `exceptions-b9a.md` / `exceptions-b9b.md`（含 §7 的三条源缺陷）
6. 最终合并 → 裁图 → 界面验证 → 交付（**八年级那份也要重新生成**，导图改过）

---

## 13. 最终交付记录（2026-10-27 夜）

### 13.1 最终校验

| 项 | 结果 |
|---|---|
| 37 份 part | `check:part` 全部 exit 0（告警与各章基线相同） |
| 37 份清单 | `check:expected` 0 错 0 警；`check:consistent` 37 份 / 3584 条 0 错 0 警 |
| 四册合并 | **2084 节点 / 1470 边 / 818 资源 / 818 anchors / 0 推理步骤 / warnings 0** |
| 不变式 | 孤立 definition·proposition = 0；depends-on 无环；无自环；无悬空端点 |
| 资源完整性 | 818/818 文件存在且 sha256 与 part 记录一致；全量 `crop:figures` 0 裁剪 / 818 跳过 / 0 失败 |
| 结构覆盖率 | 3584/3584（mapped 3582 + exception 2；missing/duplicate/undecided 0） |
| 视觉复核 | 19/19 章 `fully-reviewed`；九上 106 页 + 九下 110 页逐页有记录 |
| 实体注册表 | `entities.json` **229 条**，与 229 个带 key 节点一一对应；含 21 条非 definition key |

### 13.2 视觉复核与修复

| 章 | 页 | 复核缺陷 | 处置 |
|---|---|---|---|
| b9a-c11 | 28 | 7 | 5 修好、2 误报/可接受 |
| b9a-c12 | 26 | 3 | 3 修好 |
| b9a-c13 | 28 | 9 | 8 修好、1 条结构性限制（图 13-12 不拆） |
| b9a-c14 | 24 | 1 | 1 修好 |
| b9b-c15 | 28 | 17 | 12 修好、5 误报（p027 五题，叠加图框线误判） |
| b9b-c16 | 34 | 1 | 图 16-50 源缺图，alt + 例外登记 |
| b9b-c17 | 22 | 1 | 1 修好 |
| b9b-c18 | 26 | 0 | — |

- b9a 修复后独立验证：15 真修好 / 1 半修 / 0 修坏 / 2 误报 / 2 按政策保留（`audit/verify-b9a-c11-c14.md`）。
- b9b c15/c17 修复后独立验证：13 真修好 / 5 误报成立 / 0 返工（`audit/verify-b9b-c15-c17.md`）。
- c16 修复后复核：34/34 页，资产类只剩图 16-50 源缺图；25 处文本 bbox 偏差登记为不影响交付（`review/b9b-c16.json` 的 `textBbox`）。

### 13.3 最终元数据批次

- 全书 40 个空 `originalNumber` 的 topic 栏目节点已补齐（= 栏目标题），c18 `s04` 章节号补「四」。交付图里栏目不再出现 UI 自动编号（「2.6. 实践与练习」这类）。
- 各章「跨学科实践」subsection 仍按全库统一口径：栏目名落在子 note 的 `originalNumber`，subsection 本身由 UI 自动编号（全库一致，不是本章缺陷）。

### 13.4 交付物

```
~/Downloads/苏科版物理-全四册/
├─ all.json                 2084 节点 / 1470 边 / 818 资源
├─ assets/b8a b8b b9a b9b/  818 张
├─ coverage.md              两栏
├─ exceptions-b9a.md        九上例外清单（26 条）
├─ exceptions-b9b.md        九下例外清单（26 条）
└─ exceptions-b8a.md        八年级既有清单

~/Downloads/苏科版物理-八上八下/   已重出（旧版导图 mermaid 过时）
├─ all.json                 1175 节点 / 773 边 / 458 资源
├─ assets/b8a b8b/          458 张
├─ coverage.md
└─ exceptions-b8a.md
```

### 13.5 界面验证（ego-browser，单 space `math-note 教材图谱验收`）

1. 导入 `~/Downloads/苏科版物理-全四册/all.json` → 弹窗「确认导入」→ 成功，显示「初中物理（苏科版·全册）」。
2. 图片按卷分批 `setInputFiles('input[accept="image/*"]', [...])`，**sha256 自动匹配 818/818**，状态从「缺 818 张」到「资源 818 张」。
3. 抽查九年级下册第十六章：图 16-32 裁图完整（含 (a)(b)(c) 子注），`figcaption` 只出现一次；图 16-31/16-33 等正常渲染。
4. 修复后重新导入并重传 818 张，仍 818/818 命中；栏目「实践与练习」「素养进阶」不再显示自动编号。

### 13.6 仍存在的已知项（不阻断交付）

- 图 16-50（九下 pdf 63）、图 18-5（pdf 95）源 PDF 缺图，asset 空白，alt 写实；图 12-32（九上 pdf 56）源半截图。
- 图 13-12 (b) 灯泡玻璃顶切 15px（单矩形无解，拆图需新增 srcId+asset）。
- 图 16-28(a)/(b) 仍是两条 `figure`（清单冻结，不合并）。
- c16 的 25 处文本 bbox 偏差、`p012-fig02` 左缘 1px、既有贴线；不影响交付图。
- `entities.json` 必须保留 229 条 live 版；**不要跑 `export:entities`**（只收 definition，会丢 21 条非 definition key）。

### 13.7 第二轮复审与内容修复（2026-10-27 深夜）

在交付后补做了 handoff §D 的「修复后复审」，三类独立代理：

| 复审 | 结论 |
|---|---|
| b9a 语义复审 `audit/reaudit-b9a.md` | 26 处语义改动：24 真修好 / 2 半修 / 0 修错；另发现半导体假定义、4 对兄弟节点重复、6 条边引文错位等 16 条新问题 |
| b9b 语义复审 `audit/reaudit-b9b.md` | c15–c18 点名项全部落地；0 高/中语义错误；1 中（77 个 `@n` 缺 `src:` tag）+ 4 轻 + 9 极轻 |
| 四册图谱总审计 `audit/audit-4vol-graph.md` | 30 项机械检查 24 项全绿（其余 7 项均有解释）；抽样 26/30 节点、29/31 边成立；原文回查 95.7% / 97.5% |

修复（`audit/fix-b8-content.md`、`fix-b9-content.md`，由 `verify-content-fixes.md` 独立验证）：

- **b8**：电子/夸克 definition 换原书界定句；质子/中子无界定句 → 降 note，4 条 `part-of→cites`（全库 part-of 15→11）；虚像/竖直方向/扩散 三组重复 note 并入 definition；图 4-33 补 caption；图 1-17/1-22 标 `captionOnImage`；`p078-01` 3 条 `depends-on→uses`。
- **b9**：`p010-04` 引出句移出定义；`p087-01` 半导体拆成 definition + `@1` note（图 14-6 改挂）；`p071-05` 电压按「原书因果式定义」登记例外；`p003-09` 重复 note 并入 definition 并保留「信息快递」；85 个 `@n` 补 `src:` tag；发电机 `depends-on→cites`；c18 补回 3 处「这是因为」、2 个栏目 `originalNumber`、69 个 `citation.page` 去零；c15 `p003-02` 顺序修正；4 条 `depends-on→uses`。
- **验证发现 1 条返工**：c16 part2 的图 16-45 例外条目被覆盖、两条发电机说明矛盾；已恢复并按 `cites` 统一。另 2 条 b8b 边注里的 `part-of` 字样已改为 `cites`。

最终图：**2084 节点 / 1470 边 / 818 资源**；definition 225、note 713、proposition 286、problem 430、section 426、branch 4；谓词 covers 651 / depends-on 277 / uses 225 / supports 112 / cites 171 / is-a 23 / part-of 11。b8 合计 1175 / 773 / 458。

已知未做（不影响交付）：4 个未登记 key、跨学科实践 12 处口径、活动 9.7 双节点、原子/电子 ID 页码、6 个定义不纯、2 张表挂在命题/说明、气泡插画重复。这些在 `audit/reaudit-b9a.md`、`reaudit-b9b.md`、`audit-4vol-graph.md` 的「未做/已知」里已逐条登记。

### 13.8 交换数据格式 `.tbg`（2026-10-28）

为「一个文件搞定图 + 图片」，新增教材交换包 `.tbg`（ZIP，MIME `application/x-textbook-graph`）。

- 规范：`docs/EXCHANGE-FORMAT.md`（v1）
- 结构：`manifest.json` + `graph.json`（v9）+ `assets/...`（graph.assets[].path 指向的原图）+ 可选 `documents/...`
- 版本：容器 `formatVersion=1`，数据 `schemaVersion=9`；两者独立演进
- 完整性：导入逐张校验路径、字节数、sha256；任何一张不对整包拒绝，现有数据不动
- 应用：导出按钮直接生成 `.tbg`；导入支持 `.tbg` 和旧版 `.json`（JSON 只有数据，图片另载）
- CLI：`bun run pack:exchange --graph ... --root ... --out ... [--doc ...]`
- 已生成：
  - `~/Downloads/苏科版物理-全四册.tbg`：2084 节点 / 1470 边 / 818 图 / 4 份文档，153.8 MiB
  - `~/Downloads/苏科版物理-八上八下.tbg`：1175 / 773 / 458 / 2 份文档，96.3 MiB
- 实测（本地 + 线上 `pi.laysath.cn`）：`.tbg` 导入约 3.1 s，818/818 资源落库，图片正常渲染

### 13.9 节点完整度 + 图片正确性全量审计（2026-10-28）

用户抽查发现仍有缺字/错图，于是补了一轮**只查节点完整度与图片、完全不查关系边**的全量审计。

- 范围：四册 19 章 / 488 页 / 818 张资源，逐页逐图，**不抽样**。
- 工作台：`local-textbook/sukey/audit/node-completeness/<章>/`（页图+红框、页图+裁图对照 sheet、节点全文、自动文字候选）。
- 结论：**88 条缺陷**（incomplete-image 29、caption-alt-wrong 29、missing-text 15、wrong-image 10、wrong-text 1、source-defect 4）；无 high，10 medium，78 low。
- 修复：A–G 七组 + 1 次返工；独立验证 AB / CDE / FG / rework 四份。**数据侧 0 条必须返工**；边 1470 一条没动，节点 2084、资源 818 不变。
- 修掉的代表项：11+ 处「信息快递」栏目名、图 4-42 左右 1px 页框虚线、图 2-26/2-27 边界错位、图 4-33 冰凌、图 6-8 氢/氮、图 6-27 车筐数、图 15-21 接地插片、图 17-18/17-24/18-8 alt、图 12-36 导图层级等。
- 仍未闭合（结构性/源缺陷）：图 13-12 (b) 泡顶 15px、图 11-31 手部与正文行矩形交错、图 6-14 正文行与量筒口交错、图 10-32 顶弧 9 行、图 9-4 手顶 10 行、图 4-23 电源线在扫描页边出框；图 16-50 / 18-5 / 12-32 源缺图；`b8b-c07 p045-03` 清单/part region 既有 61px 漂移（asset 更紧、不切内容）。
- 交付：重新合并 2084/1470/818；重打 `.tbg`（全四册 153.9 MiB / 八上八下 96.4 MiB）；线上导入 2.0 s、818/818，图片正常。

### 13.10 语义质量清理（2026-10-28）

按评审意见做了一轮**不改 Schema**的语义清理：

- 全量审计：`depends-on` 277 条、`supports` 112 条、`law/principle/phenomenon/model/experiment/exploration` 176 个、多结论候选 120 个（其中 32 条判 multi）。
- `supports`：112→100；12 条类比/模型/反事实/弱举例降 `cites`，起点 kind 改 `model/context/explanation`。
- `depends-on`：277→253；contains/mentions/题目误用改 `cites`/`covers`/`part-of`；`p009-05` 四要素 4 条改 `cites`。
- kind：19 处；`p066-06` law→note、`p033-01` law→claim、`p076-07/08` principle→claim、`p121-02`/`p071-03` phenomenon→model、反事实→context、调查/辩论/填图→explanation、制作→process。
- **拆分 `p068-08`**：凸透镜/凹透镜两条结论分开，`p076-07@1` 改指凹透镜 `@1`，`p070-02` 补凹侧 covers。
- 多结论拆分 32 条**未做**（清单在 `audit/semantic-kinds.json`），留待下一轮；`p057-05` 生活实例 supports 按「事实表明归纳」保留。
- 最终：**2085 节点 / 1473 边 / 818 资源**；supports 100 / depends-on 253 / cites 203 / uses 227 / covers 655 / is-a 23 / part-of 12；孤立定义·命题 0，depends-on 无环。
- 验证：`audit/verify-semantic-b8a/b8b/b9/rework.md`，逐条成立、无越界、回归全绿。
