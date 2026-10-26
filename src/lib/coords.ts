/**
 * 坐标换算的唯一实现层。
 *
 * 规范见 `docs/plans/transcribe-spec.md` §0.2：
 * - `region` 的坐标系是**应用 `/CropBox` 与 `/Rotate` 之后的完整可见渲染页面**，
 *   原点左上、x 向右、y 向下、归一化到 `[0, 1]`。
 * - PDF 用户空间是原点左下、y 向上、单位点，且 `/Rotate` 为**顺时针**角度。
 *
 * 两个方向的 y 轴相反，`/Rotate` 又是顺时针，这里写错整本书的图都会错位。
 * 所有批次脚本都必须调这里的函数，禁止各写一套。
 *
 * 本模块不依赖任何库，也不读 File/PDF，纯算术 + 校验。
 */

/** 归一化到页面的矩形区域；原点左上、y 向下。 */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 归一化坐标容差：只用来吸收浮点噪声，不用来放过真正越界的坐标。 */
export const REGION_EPS = 1e-6;

/** PDF 用户空间里的矩形（单位点，原点左下）。 */
export interface PdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 渲染页的像素尺寸。 */
export interface RenderedSize {
  width: number;
  height: number;
}

/** 整数像素矩形。 */
export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 供核对图上画框用的四条边（整数像素，右/下开区间）。 */
export interface PixelBorder {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 页面在 PDF 里的几何信息 */
export interface PdfPageGeometry {
  /** 可见区域；缺省时按规范回退到 mediaBox */
  cropBox?: PdfBox;
  mediaBox: PdfBox;
  /** 页面 /Rotate，只接受 0/90/180/270，顺时针 */
  rotate: 0 | 90 | 180 | 270;
}

const REGION_KEYS = ['x', 'y', 'width', 'height'] as const;
const ROTATIONS = [0, 90, 180, 270] as const;

function formatNumber(value: number): string {
  // 报错信息里不要出现 0.30000000000000004 这种噪声
  return String(Number(value.toFixed(6)));
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 必须是有限数，收到 ${String(value)}。`);
  }
  return value;
}

/** 把任意方向的矩形整理成 x0 <= x1、y0 <= y1 的形式，并检查退化 */
function normalizeBox(box: PdfBox | undefined, label: string): PdfBox {
  if (typeof box !== 'object' || box === null) throw new Error(`${label} 缺失。`);
  const ax = assertFiniteNumber(box.x0, `${label}.x0`);
  const ay = assertFiniteNumber(box.y0, `${label}.y0`);
  const bx = assertFiniteNumber(box.x1, `${label}.x1`);
  const by = assertFiniteNumber(box.y1, `${label}.y1`);
  const normalized = {
    x0: Math.min(ax, bx),
    y0: Math.min(ay, by),
    x1: Math.max(ax, bx),
    y1: Math.max(ay, by),
  };
  if (normalized.x1 - normalized.x0 <= 0) throw new Error(`${label} 的宽度必须大于 0。`);
  if (normalized.y1 - normalized.y0 <= 0) throw new Error(`${label} 的高度必须大于 0。`);
  return normalized;
}

function assertRenderedSize(rendered: RenderedSize): RenderedSize {
  if (typeof rendered !== 'object' || rendered === null) {
    throw new Error('rendered 必须是 { width, height } 形式的像素尺寸。');
  }
  const width = assertFiniteNumber(rendered.width, 'rendered.width');
  const height = assertFiniteNumber(rendered.height, 'rendered.height');
  if (!Number.isInteger(width) || width < 1) {
    throw new Error(`rendered.width 必须是 ≥ 1 的整数像素值，收到 ${String(width)}。`);
  }
  if (!Number.isInteger(height) || height < 1) {
    throw new Error(`rendered.height 必须是 ≥ 1 的整数像素值，收到 ${String(height)}。`);
  }
  return { width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 校验 region；合法返回 null，不合法返回一句中文原因 */
export function regionProblem(region: unknown): string | null {
  if (typeof region !== 'object' || region === null) {
    return 'region 必须是含 x / y / width / height 的对象。';
  }
  const values = region as Record<string, unknown>;
  for (const key of REGION_KEYS) {
    const value = values[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `region.${key} 必须是有限数（NaN / Infinity 一律拒绝）。`;
    }
  }

  const { x, y, width, height } = region as Region;

  if (x < 0) return `region.x 不能为负（当前 ${formatNumber(x)}）。`;
  if (x >= 1) return `region.x 必须小于 1（当前 ${formatNumber(x)}）。`;
  if (y < 0) return `region.y 不能为负（当前 ${formatNumber(y)}）。`;
  if (y >= 1) return `region.y 必须小于 1（当前 ${formatNumber(y)}）。`;
  if (width <= 0) return `region.width 必须大于 0（当前 ${formatNumber(width)}）。`;
  if (height <= 0) return `region.height 必须大于 0（当前 ${formatNumber(height)}）。`;
  // 不做 width > 1 的单独判断：x ≥ 0 时 x + width ≤ 1 已经蕴含 width ≤ 1，
  // 多一条带容差的判断只会在边界上给出模棱两可的结论。
  if (x + width > 1 + REGION_EPS) {
    return `region 超出页面右边界：x + width = ${formatNumber(x + width)}，必须 ≤ 1。`;
  }
  if (y + height > 1 + REGION_EPS) {
    return `region 超出页面下边界：y + height = ${formatNumber(y + height)}，必须 ≤ 1。`;
  }
  return null;
}

function toRegion(region: Region): Region {
  const problem = regionProblem(region);
  if (problem) throw new Error(`region 不合法：${problem}`);
  return region;
}

interface CropGeometry extends PdfBox {
  rotate: 0 | 90 | 180 | 270;
}

/**
 * 取出实际可见区域：`/CropBox` 优先，缺失时回退 `/MediaBox`。
 *
 * 这里不做 CropBox ∩ MediaBox 的额外裁剪——§0.2 的换算公式就定义在
 * 「CropBox，缺失时 MediaBox」之上，改口径会让所有批次的结果对不上。
 */
function cropGeometryOf(page: PdfPageGeometry): CropGeometry {
  if (typeof page !== 'object' || page === null) {
    throw new Error('page 必须是 PdfPageGeometry（mediaBox + rotate）。');
  }
  const rotate = page.rotate;
  if (!(ROTATIONS as readonly unknown[]).includes(rotate)) {
    throw new Error(`页面 /Rotate 只能是 0 / 90 / 180 / 270，收到 ${String(rotate)}。`);
  }
  const mediaBox = normalizeBox(page.mediaBox, 'mediaBox');
  const visible = page.cropBox === undefined ? mediaBox : normalizeBox(page.cropBox, 'cropBox');
  return { ...visible, rotate };
}

/** 应用 /CropBox 与 /Rotate 之后的可见页面尺寸（PDF 点数） */
export function visiblePageSize(page: PdfPageGeometry): { width: number; height: number } {
  const crop = cropGeometryOf(page);
  const width = crop.x1 - crop.x0;
  const height = crop.y1 - crop.y0;
  return crop.rotate % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** PDF 用户空间的一个点 → 渲染页归一化坐标（左上原点、y 向下） */
function toRenderedPoint(
  x: number,
  y: number,
  crop: CropGeometry,
  width: number,
  height: number,
): { u: number; v: number } {
  // 1. 未旋转、左上原点、归一化
  const u0 = (x - crop.x0) / width;
  const v0 = (crop.y1 - y) / height;
  // 2. /Rotate 为顺时针，按任务书的映射表旋转
  switch (crop.rotate) {
    case 90:
      return { u: 1 - v0, v: u0 };
    case 180:
      return { u: 1 - u0, v: 1 - v0 };
    case 270:
      return { u: v0, v: 1 - u0 };
    default:
      return { u: u0, v: v0 };
  }
}

/**
 * PDF 用户空间矩形 → 渲染页归一化 region。
 *
 * PDF 用户空间：原点左下、y 向上、单位点。
 * 渲染页：原点左上、y 向下、归一化 0..1。
 *
 * 传入的 PDF 框允许超出 CropBox（PDF 图像对象框本身可能比可见区域大，
 * 属合法的视觉裁剪），会先 clamp 到 CropBox 内；**不会**用它来掩盖非法的 region。
 */
export function pdfBoxToRegion(box: PdfBox, page: PdfPageGeometry): Region {
  const crop = cropGeometryOf(page);
  const bounds = normalizeBox(box, 'PDF 框');
  const width = crop.x1 - crop.x0;
  const height = crop.y1 - crop.y0;

  const x0 = clamp(bounds.x0, crop.x0, crop.x1);
  const x1 = clamp(bounds.x1, crop.x0, crop.x1);
  const y0 = clamp(bounds.y0, crop.y0, crop.y1);
  const y1 = clamp(bounds.y1, crop.y0, crop.y1);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) {
    throw new Error('PDF 框完全落在可见区域（CropBox）之外，无法换算 region。');
  }

  // 旋转围绕可见区域中心进行，取两个对角点再重新组装即可
  const a = toRenderedPoint(x0, y0, crop, width, height);
  const b = toRenderedPoint(x1, y1, crop, width, height);

  const left = clamp(Math.min(a.u, b.u), 0, 1);
  const right = clamp(Math.max(a.u, b.u), 0, 1);
  const top = clamp(Math.min(a.v, b.v), 0, 1);
  const bottom = clamp(Math.max(a.v, b.v), 0, 1);

  const region: Region = { x: left, y: top, width: right - left, height: bottom - top };
  // 正面积框在 90° 倍数旋转下不可能退化；到这里还 ≤ 0 说明输入本身有问题
  if (region.width <= 0 || region.height <= 0) {
    throw new Error('PDF 框换算后的 region 宽或高为 0，请检查框的坐标。');
  }
  return region;
}

/**
 * 把归一化区间 [start, end] 变成整数像素区间。
 *
 * mode = 'round'：四舍五入（裁图用）；mode = 'out'：向外取整（画核对框用）。
 * 只做取整造成的 ±1 像素修正，绝不静默把非法区域 clamp 成合法区域。
 */
function pixelSpan(start: number, end: number, total: number, mode: 'round' | 'out'): { from: number; to: number } {
  let from = mode === 'round' ? Math.round(start * total) : Math.floor(start * total);
  let to = mode === 'round' ? Math.round(end * total) : Math.ceil(end * total);

  // 取整可能把窄区间压成 0 宽：保留至少 1 像素
  if (to <= from) to = from + 1;
  if (from < 0) from = 0;
  if (to > total) to = total;
  if (to - from < 1) {
    to = Math.min(total, from + 1);
    from = Math.max(0, to - 1);
  }
  return { from, to };
}

/** 归一化 region → 渲染图像素矩形（整数，四舍五入） */
export function regionToPixels(region: Region, rendered: RenderedSize): PixelRect {
  toRegion(region);
  const size = assertRenderedSize(rendered);
  const horizontal = pixelSpan(region.x, region.x + region.width, size.width, 'round');
  const vertical = pixelSpan(region.y, region.y + region.height, size.height, 'round');
  return {
    left: horizontal.from,
    top: vertical.from,
    width: horizontal.to - horizontal.from,
    height: vertical.to - vertical.from,
  };
}

/**
 * 渲染图像素矩形 → 归一化 region。
 *
 * 像素矩形超出画布会**报错**，不会裁剪：越界说明上游换算错了。
 */
export function pixelsToRegion(rect: PixelRect, rendered: RenderedSize): Region {
  const size = assertRenderedSize(rendered);
  if (typeof rect !== 'object' || rect === null) {
    throw new Error('rect 必须是 { left, top, width, height } 形式的像素矩形。');
  }
  const left = assertFiniteNumber(rect.left, 'rect.left');
  const top = assertFiniteNumber(rect.top, 'rect.top');
  const width = assertFiniteNumber(rect.width, 'rect.width');
  const height = assertFiniteNumber(rect.height, 'rect.height');
  if (width <= 0 || height <= 0) {
    throw new Error('像素矩形的 width / height 必须大于 0。');
  }

  const region: Region = {
    x: left / size.width,
    y: top / size.height,
    width: width / size.width,
    height: height / size.height,
  };
  return toRegion(region);
}

/** 把 region 按比例叠到核对图上用的边框（整数像素，供脚本画框） */
export function regionBorder(region: Region, rendered: RenderedSize): PixelBorder {
  toRegion(region);
  const size = assertRenderedSize(rendered);
  const horizontal = pixelSpan(region.x, region.x + region.width, size.width, 'out');
  const vertical = pixelSpan(region.y, region.y + region.height, size.height, 'out');
  return { left: horizontal.from, top: vertical.from, right: horizontal.to, bottom: vertical.to };
}
