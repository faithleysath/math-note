# 任务书：坐标规范层（`coords.ts` + Region 校验 + `AssetMeta.caption`）

> 执行者：子代理。**禁止创建子代理。**
> 上位规范：`docs/plans/transcribe-spec.md` 的 §0.2（坐标规范，不可变）。先完整读 §0.2。

## 背景

整书转写要用视觉模型读页面图，由模型给出插图/表格的 bbox。为了让任何工具、任何批次得到同一套判定，
坐标换算必须集中在一个模块里，禁止各自实现。现在这个模块不存在。

同时 `AssetMeta` 缺 `caption`，图注只能塞进 markdown 的 `alt`，而 `alt` 在阅读器里不可见。

## 1. `src/lib/schema.ts`

- `AssetMeta` 增加 `caption?: string`（原书图注原文；无图注时不填，不要填空串）
- 同步改 `assetMetaSchema`：`caption: z.string().optional()`
- `regionSchema` 按 §0.2.2 收紧：
  - 四个字段 `z.number().finite()`
  - `x`、`y` 在 `[0,1)`；`width`、`height` 在 `(0,1]`
  - 加 `.refine` 保证 `x + width <= 1` 与 `y + height <= 1`，容差 `1e-6`
  - 报错信息要能看懂（例如「region 超出页面右边界」）

## 2. 新建 `src/lib/coords.ts`

```ts
export interface Region { x: number; y: number; width: number; height: number }

/** 归一化坐标容差 */
export const REGION_EPS = 1e-6;

/** 合法返回 null，不合法返回中文原因 */
export function regionProblem(region: unknown): string | null;

/** 页面在 PDF 里的几何信息 */
export interface PdfPageGeometry {
  /** 可见区域；缺省时按规范回退到 mediaBox */
  cropBox?: { x0: number; y0: number; x1: number; y1: number };
  mediaBox: { x0: number; y0: number; x1: number; y1: number };
  /** 页面 /Rotate，只接受 0/90/180/270 */
  rotate: 0 | 90 | 180 | 270;
}

/** 应用 /CropBox 与 /Rotate 之后的可见页面尺寸（PDF 点数） */
export function visiblePageSize(page: PdfPageGeometry): { width: number; height: number };

/**
 * PDF 用户空间矩形 → 渲染页归一化 region。
 * PDF 用户空间：原点左下、y 向上、单位点。
 * 渲染页：原点左上、y 向下、归一化 0..1。
 */
export function pdfBoxToRegion(
  box: { x0: number; y0: number; x1: number; y1: number },
  page: PdfPageGeometry,
): Region;

/** 归一化 region → 渲染图像素矩形（整数，四舍五入） */
export function regionToPixels(
  region: Region,
  rendered: { width: number; height: number },
): { left: number; top: number; width: number; height: number };

/** 渲染图像素矩形 → 归一化 region */
export function pixelsToRegion(
  rect: { left: number; top: number; width: number; height: number },
  rendered: { width: number; height: number },
): Region;

/** 把 region 按比例叠到核对图上用的边框（整数像素，供脚本画框） */
export function regionBorder(
  region: Region,
  rendered: { width: number; height: number },
): { left: number; top: number; right: number; bottom: number };
```

### `pdfBoxToRegion` 的精确算法（必须按此实现）

设 `C = cropBox ?? mediaBox`，`W = C.x1 - C.x0`，`H = C.y1 - C.y0`。
先把 box 四角 clamp 到 `C` 内（这一步是 PDF 对象框本身可能大于 CropBox，属合法裁剪；**不要**用它来掩盖非法 region）。

1. 转成「未旋转、左上原点、归一化」：
   `u0 = (x - C.x0) / W`，`v0 = (C.y1 - y) / H`
2. 按 `/Rotate`（顺时针）变换，得到渲染页坐标：

| rotate | (u, v) |
|---|---|
| 0 | `(u0, v0)` |
| 90 | `(1 - v0, u0)` |
| 180 | `(1 - u0, 1 - v0)` |
| 270 | `(v0, 1 - u0)` |

3. 两个对角变换后取 `min/max` 组装成 `Region`。

### 边界处理

- `regionToPixels` 四舍五入后必须落在 `[0, rendered.width]` / `[0, rendered.height]` 内，
  只允许因取整产生的 **±1 像素**修正，且修正后宽高仍 ≥ 1。**不要**静默把非法 region clamp 成合法。
- 任何函数遇到 `NaN`/`Infinity` → 抛 `Error`，不要返回垃圾值。

## 3. `src/lib/assets.ts`

**只允许追加**一个导出，不要改已有函数签名：
- `regionProblem` 从 `coords.ts` 转出即可（`export { regionProblem } from './coords'` 或在 coords 外用）。

如果 `validateAssetIntegrity` 目前没校验 `region`，加一行调用 `regionProblem` 即可，别重构。

## 4. 测试 `src/lib/coords.test.ts`（重点，必须写全）

必须覆盖：

1. **四种旋转 × 三种页面长宽比**（A4 竖 595×842、Letter 横 792×612、方形 500×500、超宽 1000×300）：
   - 四角点映射正确（左上→左上 / 右上 / 右下 / 左下，按旋转顺序）
   - 页面中心点映射后仍是中心
   - 映射结果始终在 `[0,1]`
2. **CropBox 偏移**：MediaBox `0,0,595,842`，CropBox `30,60,565,800`，验证用的是 CropBox 而不是 MediaBox
3. **CropBox 缺失**：回退到 MediaBox
4. **跨页**：同一个 `nodeId` 的两个 `region` 分别绑定不同 `pdfPage` 时互不影响；单个 region 永远不超过 1（越界要报错，不是裁剪）
5. **浮点容差**：`x + width = 1 + 1e-12` 通过；`1.001` 拒绝
6. **非法值**：`NaN`、`Infinity`、负 `width`、`x = 1`、`width = 0` 全部拒绝
7. **region ↔ 像素往返**：整数像素尺寸下往返误差 ≤ 1 像素

断言用 `toBeCloseTo`，别用全等比较浮点。

## 5. 自测（必须全跑，贴结果）

```bash
bun run test && bun run lint && bun run build && bun run check:examples && bun run gen:schema
```

`gen:schema` 后 `examples/v9.schema.json` 里应出现 `caption` 字段、`region` 的边界约束。

## 禁止

- 不改 `db.ts` / `useGraphStore.ts` / `LeftSidebar.tsx` / `markdown.ts`（另一个子代理正在改这些文件）
- 不改 v8 相关代码和库名
- 不新增依赖（不要装 pdfjs / sharp）
- 不做图像裁切和 PDF 解析（那不是本任务）
- 不创建子代理

## 汇报

说明：`coords.ts` 的导出清单、旋转公式是否有与任务书不一致的地方、测试数量、以及 `gen:schema` 后 v9 schema 的实际变化。
