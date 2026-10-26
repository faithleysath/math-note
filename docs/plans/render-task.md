# 任务书：整页渲染 + bbox 核对图

> 执行者：子代理。**禁止创建子代理。**
> 上位规范：`docs/plans/transcribe-spec.md` §0.2（坐标）、§3.2（清单）、§11（目录结构）。
> 已有事实：四册 PDF 在 `local-textbook/sukey/raw/`，`manifest.json` 含 `pageOffset` 与目录；
> `CropBox` 与 `MediaBox` 相同、`/Rotate = 0`。渲染用 `pdftoppm`（已装）。

## 1. `scripts/render-book-pages.ts`

```bash
bun run scripts/render-book-pages.ts --volume b8a [--dpi 200] [--from 1] [--to 158] [--force]
```

行为：

- 读 `local-textbook/sukey/manifest.json`，按 `volume` 找到对应 PDF（`b8a|b8b|b9a|b9b` → `sukey-八上|八下|九上|九下.pdf`）
- 用 `pdftoppm -r <dpi> -png -f <from> -l <to> <pdf> local-textbook/sukey/pages/<vol>/p` 渲染
- **幂等可续跑**：目标文件已存在且非 `--force` 就跳过；单页失败要报出页号并继续或中止（自行决定，但必须显式打印）
- 默认 dpi `200`（正文可读、字数与插图都够裁）
- 同时生成 `local-textbook/sukey/pages/<vol>/geometry.json`：
  ```jsonc
  { "volume": "b8a", "pdf": "sukey-八上.pdf", "dpi": 200, "pdfPageCount": 158,
    "pages": [ { "pdfPage": 1, "rotate": 0,
                 "cropBox": { "x0": 0, "y0": 0, "x1": 541.42, "y1": 754.02 },
                 "mediaBox": { "x0": 0, "y0": 0, "x1": 541.42, "y1": 754.02 },
                 "rendered": { "width": 1504, "height": 2095 } } ] }
  ```
  用 `pdfinfo -box -f N -l N` 逐页取 `MediaBox`/`CropBox`/`Rotate`（没有 Rotate 行就是 0）；`rendered` 用 PNG 实际尺寸（可用 `sips -g pixelWidth -g pixelHeight` 或解析 PNG 头 IHDR，不要装依赖）
- 结束时打印：渲染页数、跳过页数、失败页数、总耗时、输出目录大小

**为什么需要 `geometry.json`**：`src/lib/coords.ts` 的 `pdfBoxToRegion` 要 `/CropBox` 和 `/Rotate` 才能把 PDF 对象框（`pdfimages -list`、`pdftotext -bbox`）换算成 `region`。别自己算，直接存下来喂给库函数。

## 2. `scripts/draw-expected-boxes.ts`

```bash
bun run scripts/draw-expected-boxes.ts --expected <expected.json> [--out <dir>] [--thumb 1200]
```

行为：

- 读 Pass 1 冻结清单（格式见规约 §3.2：`items[].srcId / kind / pdfPage / region / regionOmittedReason / originalNumber / text`）
- 按 `pdfPage` 分组，为每一页生成一个 HTML 核对图到 `local-textbook/sukey/review/<vol>-<ch>/p<四位页序>.html`
- HTML 内容：整页 PNG 作为背景 `<img>`，按 `region` 用绝对定位的 `<div>` 叠彩色边框 + 左上角标签（`srcId` + `kind` + 序号）
- **不装依赖**：样式内联，不要引 CDN
- 未给 `region` 的条目（只有 `regionOmittedReason`）在页面右下角列成清单，红字显示「未定位：srcId（原因）」
- 终端打印：总条目、已定位、未定位、涉及页数、每页条目数的最大/最小值
- 若清单里某个 `pdfPage` 找不到对应 PNG → 打印缺失页并继续

## 3. `package.json` 增加脚本

```json
"render:pages": "bun run scripts/render-book-pages.ts",
"draw:boxes": "bun run scripts/draw-expected-boxes.ts"
```

## 4. 冒烟测试（必须真跑，贴输出）

```bash
# 只渲染 3 页，验证幂等与 geometry.json
bun run scripts/render-book-pages.ts --volume b8a --from 20 --to 22
bun run scripts/render-book-pages.ts --volume b8a --from 20 --to 22   # 第二次应该全部跳过
ls -la local-textbook/sukey/pages/b8a/
cat local-textbook/sukey/pages/b8a/geometry.json | head -40
```

核对 `geometry.json` 里 pdfPage 20 的 `rendered` 与 PNG 实际像素一致。

再**手写**一个小清单 `local-textbook/sukey/fixtures/expected-demo.json`（2 页、3 个条目，其中 1 条故意不给 region），跑：

```bash
bun run scripts/draw-expected-boxes.ts --expected local-textbook/sukey/fixtures/expected-demo.json
```

确认 HTML 生成、打印统计合理。

## 5. 自测

```bash
bun run test && bun run lint && bun run build
```

## 禁止

- 不新增依赖（禁止 sharp / canvas / pdfjs / puppeteer）
- 不改 `src/lib/**`（本任务只写脚本）
- 不改 `local-textbook/sukey/raw/` 下的 PDF
- 不渲染全册（只跑冒烟的那几页，全量渲染由我决定）
- 不创建子代理

## 汇报

两个脚本的参数面、`geometry.json` 的实际内容片段、第二次渲染是否真的跳过、HTML 核对图生成数量和打印统计。
