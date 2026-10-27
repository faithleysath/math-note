# 任务书：节点完整度 + 图片正确性审计（逐页、逐图，不查关系边）

> 执行者：子代理。**禁止创建子代理。只读，不改任何数据。**
> 目标不是抽样：一章内的**每一页、每一条资源**都要有记录。

## 背景

上一轮审计/视觉复核已经闭环，但用户抽查仍发现「节点缺字、图片错误或不完整」。这一轮只查两件事：

1. **节点完整度**：教材页面上每一个字都存在——正文、表格单元格、公式、图注、题干/解答，逐字核对；不能缺句、截断、错字。
2. **图片正确性**：页面上每一张内容性图片都有一条 asset，且裁图内容正确、四边完整、不是别处的图；图内标注/数值应在 `alt` 或 caption 里读得到。

**完全不检查关系边、谓词、节点类型/kind 的语义判断**（除非类型错误直接导致内容缺失）。

## 输入（由 PM 预先生成）

`local-textbook/sukey/audit/node-completeness/<chapter>/`

- `README.md`：本章范围
- `fact.md`：页数、节点数、资源数、每页资源数
- `pages/pXXXX.png`：页图 + 该页资源 region 红框（编号 `#N`）
- `sheets/pXXXX.png`：**主输入**——左边整页，右边该页所有资源裁图（`#N` 与页图红框对应）
- `assets/<id>.png`：按 region 裁出来的原图（需要放大看细节时用）
- `text-diff.md`：页面文字 vs 节点文字的自动候选（OCR/pdftotext 噪声，**只当线索**）
- `nodes.md`：该页节点全文 + 资源 caption/alt

原始数据：`parts/<chapter>-*.json`、`expected/<chapter>-*.json`、`pages/<vol>/pXXXX.png`、`merged/4vol.json`（只读）。

## 逐页检查步骤

对本章 pdfPage 范围内的每一页：

1. 打开 `sheets/pXXXX.png`，确认页图上的**所有内容性图片**都在右侧有裁图；页图上应有红框和编号。没框的图片 = `missing-image`。
2. 逐张裁图对比页图对应位置：
   - 是不是这张图（不是别的图/别的页）？→ `wrong-image`
   - 四边有没有切掉画面、标注、子图 `(a)(b)(c)`、引线？→ `incomplete-image`
   - 图注/alt 是否对得上？→ `caption-alt-wrong`
3. 打开 `nodes.md` 该页，逐段对照页图文字：
   - 正文/题干/解答/表格/公式/图注，逐字比对；缺整段/整句 → `missing-text`
   - 句子被截断、少几个字、单位/上下标错 → `truncated-text` / `wrong-text`
4. `text-diff.md` 的「整段未命中 / 字符缺口 / 未命中窗口」逐条回页图确认。**不要把自动候选直接当缺陷**；页眉、页码、章首页栏目导航、装饰性图标不算内容文字。
5. 每页记一条：`verdict: ok | defect`，以及 `textOk` / `imagesOk`。缺页 = 没审。

## 整章资源清单

`assets/` 下每个文件、`fact.md` 里每个资源都要在 `assetChecks` 中有一条记录（id + verdict）。没有图片的页也要有 `pages` 记录。

## 输出

### `/Users/laysath/Projects/math-note/local-textbook/sukey/review/node-completeness/<chapter>.json`

```jsonc
{
  "chapter": "phy-b8a-c01",
  "status": "fully-checked",
  "pages": [
    {"pdfPage": 18, "printedPage": 11, "verdict": "ok", "textOk": true, "imagesOk": true, "notes": ""}
  ],
  "assets": [
    {"id": "phy-b8a-p018-fig01", "pdfPage": 18, "verdict": "ok", "notes": ""}
  ],
  "defects": [
    {
      "pdfPage": 18,
      "printedPage": 11,
      "kind": "missing-text|truncated-text|wrong-text|missing-image|wrong-image|incomplete-image|caption-alt-wrong|source-defect",
      "severity": "high|medium|low",
      "nodeId": "phy-b8a-p018-03",
      "assetId": "phy-b8a-p018-fig01",
      "excerpt": "页图上的原文/应存在的节点文字",
      "detail": "哪一句/哪一块缺了什么、图切了哪里、错成什么",
      "evidence": "sheets/pXXXX.png 编号 #N / 页图坐标 / nodes.md 位置"
    }
  ]
}
```

- `pages` 必须覆盖本章 pdfPage 起点到终点，连续无缺。
- `assets` 必须覆盖本章所有资源，一条不漏；每条 `verdict` 只能是 `"ok"` 或 `"defect"`，不要把缺陷 kind 写进 verdict。
- 缺陷按页记录；同一页多处可多条。`kind` 必须严格用上面 8 个值之一，不要自造 `dirty-crop` / `caption-missing` 这类别名。
- `source-defect` 只用于源 PDF 本身的问题（如整页压平、半截图），并在 detail 写清楚。

### `review/node-completeness/<chapter>.md`

- 一句话结论：本章能不能过、缺多少字/多少图。
- 逐页表：pdfPage / 印刷页 / 文字 / 图片 / 结论。
- 缺陷清单：页、节点/资源 id、缺什么、证据。
- 最后写「已覆盖 N 页 / M 张资源」，与 JSON 一致。

## 纪律

- 只写上述两个文件；不改 parts/expected/assets/merged/review 其它文件/代码。
- 不跑 `export:entities` / `merge:parts` / `crop:figures` / `pack:exchange`。
- 每页都要真的打开图看；不确定的写 notes，不要猜成缺陷。
- 禁止创建子代理。
