# 任务书：按「节点完整度审计」缺陷修复（不碰关系边）

> 执行者：子代理。**禁止创建子代理。** 只改节点内容 / 资源元信息 / region；**不改任何关系边**。
> 输入：`local-textbook/sukey/review/node-completeness/<chapter>.json` + `.md`、`audit/node-completeness/defects.json`。

## 原则

1. **先复现再修**：每条缺陷回页图 / `audit/node-completeness/<章>/sheets` / `assets` 确认；复现不了就写「误报」，不要硬改。
2. **不编原文**：补字/改字必须有页图或 OCR 原句依据。
3. **清单冻结**：不增删 expected 条目、不新增 srcId、不改 item 数量；只能改已有条目的 region / text / captionOnImage / overlaps。
4. **不碰边**：不增删/改指/改谓词；修复只落在 nodes 的 content/title/citation、assets 的 region/alt/caption、expected 的 region/flag。
5. **一处根因批量修**：同一章多处同一类问题（如「信息快递」栏目名、整批 region 偏短）用同一规则一次修完，不逐条手改。

## 按 kind 的修法

### missing-text / truncated-text / wrong-text

- 页面正文/题干/解答缺句或截断：把页图原文补进对应节点 `content` / `solution`（保持原书标点、单位、上下标）；`title` 只在标题本身缺失时改。
- 「信息快递」「读一读」「生活 物理 社会」等栏目名没落库：
  - 栏目节点是 `definition`/`proposition`/`note` 时，把 `citation.originalNumber` 设为栏目名（如 `"信息快递"`），不要重复写进 content；
  - 如果该节点没有 `citation.originalNumber` 字段，补上；不要在 title 里重复栏目名。
- 思维导图 mermaid 层级/文字错：按页图改 `content` 里的列表/mermaid，保持节点 id 不变。
- 修完在报告里写「页图原句 → 节点新内容」。

### incomplete-image / wrong-image

- 图片被切/带进正文/带进邻图：在**页图**上量出新边界，改 `expected/` 对应 item 的 `region`；再按 `srcId → 节点 → part assets[].nodeId` 同步到 part；同页同节点多图按旧 region 精确配对。
- 必须遵守：印刷图注行留在框外（除非 `captionOnImage`）、子标号 `(a)(b)(c)` 行必须包含、不要把邻图/正文框进来。
- 改完 `bun run crop:figures --parts <对应 part> --force` 重裁；目视新裁图四边。
- **manual/stitched asset**（`manual: true` 或 path 带 `-stitched`）不要按 region 重裁：先看实际交付文件是否完整；完整则不改图，只在报告里说明 region 元数据是已知例外。
- 如果页面上有内容图但完全没有 asset：先看 expected 是否有对应 figure item；有就按该 item 的 srcId/region 建 part asset（nodeId 取 srcId 对应节点），没有就登记为「无法在清单冻结下补」，不要造 srcId。

### caption-alt-wrong

- `alt` 与画面不符：按页图重写 alt（只写画面里有的；图内关键标注/数字要写进去）。
- `caption` 为空但页面上有印刷图注：
  - 图注在画面外 → 补 `caption`，并不进 alt；
  - 图注印在画面里/随 region 裁进图 → 清单 item 标 `captionOnImage: true`，part 的 `caption` 清空，图注只进 alt；跑 `apply:captions`。
- 图注在画面外却被 region 框进来 → 收紧 region（同 incomplete-image 流程）。

### source-defect

- 不改数据；在报告里登记，确认 alt 写的是事实（不描述不存在的画面）。

## 回归（每组必须跑）

```bash
bun run check:expected <改过的清单...>
bun run check:part <改过的 part...> --expected <同名清单...>
bun run crop:figures --parts <改过的 part...> --force
bun run merge:parts --parts local-textbook/sukey/parts-all --book local-textbook/sukey/book.json --out /tmp/probe-completeness.json --page-offset 7
```

- 合并前先 `cp parts/*.json parts-all/`。
- 探针不传 `--entities`；报告节点/边/资源计数、孤立 definition/proposition。
- **边总数应不变**（本轮不碰边）；若变了，说明改坏了，回退。

## 输出

`local-textbook/sukey/audit/fix-node-completeness-<组名>.md`：

1. 一句话结论 + 改动文件清单 + 节点/资源/边计数前后对比。
2. 每条缺陷：页码 → 复现 → 改前 → 改后 → 页图依据；判误报的也给证据。
3. 批量规则说明（例如「信息快递 6 处统一补 originalNumber」「本章 4 张图统一把上沿下移」）。
4. 回归汇总行；明确写「未改边」。
5. 没修/不能修的项单列。

## 纪律

- 只写数据文件和本组报告；不改审计 JSON、不改 review 其它文件、不改代码。
- 不跑 `export:entities` / `pack:exchange`。
- 禁止创建子代理。
