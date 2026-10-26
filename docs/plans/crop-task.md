# 任务书：裁图流水线（`crop-figures.ts`）

> 执行者：子代理。**禁止创建子代理。**
> 规范：`docs/plans/transcribe-spec.md` §0.2（坐标）、§10（字段归属）、§11（目录结构）。
> 现状：Pass 2 已产出 `local-textbook/sukey/parts/b8a-c01-p018-025.json`（34 节点 + 13 资源），
> 13 个资源只有 `id/caption/alt/pdfPage/region/nodeId`，缺 `path/mimeType/byteLength/sha256`，
> 导致 `merge:parts` 拒绝合并。

## 目标

按清单里的 `region` 把每个插图裁出来、算哈希、回填字段，让 `merge:parts` 能过。

## 1. 新建 `scripts/crop-figures.ts`

```bash
bun run scripts/crop-figures.ts --parts <目录或单个 part> [--dpi 200] [--force] [--dry-run]
```

流程（对每个 `assets[]` 条目）：

1. 读 `local-textbook/sukey/pages/<册>/geometry.json` 拿到该 `pdfPage` 的 `rendered: {width,height}`
2. `regionProblem(region)` 校验，不合法直接报错跳过该条（**不许裁剪非法坐标**）
3. 用 `src/lib/coords.ts` 的 `regionToPixels(region, rendered)` 算出整数像素矩形
4. 调 **`pdftoppm` 自带的裁剪参数**，不要先渲染整页再裁：
   ```
   pdftoppm -r <dpi> -f <pdfPage> -l <pdfPage> -x <left> -y <top> -W <width> -H <height> -png -singlefile <pdf> <out>
   ```
   （`-singlefile` 让它直接输出 `<out>.png`，不用再改名）
5. 输出到 `local-textbook/sukey/assets/<册>/<assetId>.png`
6. 算 `sha256`（`node:crypto`）、`byteLength`、`mimeType`（本项目一律 `image/png`）
7. **回填到 part JSON**（原地写回，`JSON.stringify(...,2)`）：
   ```json
   "path": "assets/b8a/phy-b8a-p012-fig01.png",
   "mimeType": "image/png",
   "byteLength": 123456,
   "sha256": "…64位小写hex…"
   ```
   只加这四个字段，**不许改其它任何内容**（尤其不要动 caption/region/nodeId）
8. 校验输出 PNG 的 IHDR 尺寸与请求的 width/height 一致，不一致报错

要求：

- **幂等**：`sha256` 已存在且文件存在 → 跳过（除非 `--force`）
- `--dry-run` 只打印计划，不写文件不改 JSON
- 一个失败不影响其它，最后汇总打印失败清单，有失败则 `exit 1`
- 打印：裁剪数/跳过数/失败数、总字节、最大与最小图尺寸

## 2. 新增 `scripts/crop-figures.ts` 的核对图输出

同一次运行顺带产出 `local-textbook/sukey/review/<册>-<章>/figures.html`：

- 一页 HTML，网格排列所有裁出的图
- 每张图下方标：`assetId`、`caption`、`pdfPage`、像素尺寸、字节数
- 图按 `assetId` 排序
- **不要引 CDN**，纯内联样式，图片用相对路径 `../../assets/<册>/<file>.png`
- 这个文件是给人眼扫「有没有裁歪、有没有把相邻内容吃进来」的

## 3. `package.json` 增加

```json
"crop:figures": "bun run scripts/crop-figures.ts"
```

## 4. 冒烟测试（必须真跑，贴输出）

```bash
bun run scripts/crop-figures.ts --parts local-textbook/sukey/parts/b8a-c01-p018-025.json --dry-run
bun run scripts/crop-figures.ts --parts local-textbook/sukey/parts/b8a-c01-p018-025.json
ls -la local-textbook/sukey/assets/b8a/ | head
bun run scripts/crop-figures.ts --parts local-textbook/sukey/parts/b8a-c01-p018-025.json   # 第二次应全跳过
bun run scripts/check-book-part.ts local-textbook/sukey/parts/b8a-c01-p018-025.json --expected local-textbook/sukey/expected/b8a-c01-p018-025.json; echo "exit=$?"
bun run scripts/merge-book-parts.ts --parts local-textbook/sukey/parts-only --book local-textbook/sukey/book.json --out /tmp/merged-b8a-c01.json --page-offset 7; echo "exit=$?"
```

（`local-textbook/sukey/parts-only/` 已存在，里面是这份 part 的副本；如果它和 parts 目录不同步，自己 `cp` 一份。）

**最后两条必须 exit=0**，且 `check:part` 的 13 条 `asset-pipeline-pending` 告警应全部消失。

## 5. 自测

```bash
bun run test && bun run lint && bun run build
```

## 禁止

- 不新增依赖（禁止 sharp / canvas / ImageMagick）
- 不改 `src/lib/**`（`coords.ts` 已有的函数直接用）
- 不改 `region` / `caption` / `nodeId`，只准补那四个资源字段
- 不裁剪全册（只跑这一份 part）
- 不创建子代理

## 汇报

裁剪数/跳过数/失败数、`merge:parts` 与 `check:part` 的最终退出码、
`review/b8a-c01/figures.html` 的生成情况、以及有没有哪张图你看着像裁歪了（自己看一遍核对图再说）。
