import { describe, expect, it } from 'vitest';
import {
  type PdfBox,
  type PdfPageGeometry,
  REGION_EPS,
  type Region,
  type RenderedSize,
  pdfBoxToRegion,
  pixelsToRegion,
  regionBorder,
  regionProblem,
  regionToPixels,
  visiblePageSize,
} from './coords';

// =============================================================================
// 工具
// =============================================================================

type Corner = 'tl' | 'tr' | 'br' | 'bl';
type Rotate = 0 | 90 | 180 | 270;

/** 归一化渲染页上的四角 */
const RENDERED_CORNER: Record<Corner, { x: number; y: number }> = {
  tl: { x: 0, y: 0 },
  tr: { x: 1, y: 0 },
  br: { x: 1, y: 1 },
  bl: { x: 0, y: 1 },
};

/**
 * PDF 四角在应用 /Rotate（顺时针）后落到渲染页的哪个角。
 * 这张表是手工按任务书的映射公式推出来的，不是从实现里抄的：
 *   rotate  0 → (u0, v0)
 *   rotate 90 → (1 - v0, u0)
 *   rotate 270 → (v0, 1 - u0)
 * 其中 u0 向右、v0 向下（未旋转、左上原点），所以 PDF 左下 = (0, 1)。
 */
const CORNER_AFTER_ROTATE: Record<Rotate, Record<Corner, Corner>> = {
  0: { tl: 'tl', tr: 'tr', br: 'br', bl: 'bl' },
  90: { tl: 'tr', tr: 'br', br: 'bl', bl: 'tl' },
  180: { tl: 'br', tr: 'bl', br: 'tl', bl: 'tr' },
  270: { tl: 'bl', tr: 'tl', br: 'tr', bl: 'br' },
};

const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl'];

function pageOf(media: { width: number; height: number }, rotate: Rotate = 0): PdfPageGeometry {
  return { mediaBox: { x0: 0, y0: 0, x1: media.width, y1: media.height }, rotate };
}

/** PDF 里某个角上的小方块（边长 side 点，向页面内缩进） */
function cornerBox(media: { width: number; height: number }, corner: Corner, side: number): PdfBox {
  const { width: w, height: h } = media;
  const left = corner === 'tl' || corner === 'bl' ? 0 : w - side;
  const bottom = corner === 'bl' || corner === 'br' ? 0 : h - side;
  return { x0: left, y0: bottom, x1: left + side, y1: bottom + side };
}

const PAGE_SIZES = [
  { name: 'A4 竖版 595×842', width: 595, height: 842 },
  { name: 'Letter 横版 792×612', width: 792, height: 612 },
  { name: '方形 500×500', width: 500, height: 500 },
  { name: '超宽 1000×300', width: 1000, height: 300 },
];

const ROTATIONS: Rotate[] = [0, 90, 180, 270];

const expectRegionInRange = (region: Region) => {
  expect(regionProblem(region)).toBeNull();
  for (const value of [region.x, region.y, region.width, region.height]) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
};

// =============================================================================
// regionProblem
// =============================================================================

describe('regionProblem', () => {
  it('合法 region 返回 null', () => {
    expect(regionProblem({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
    expect(regionProblem({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBeNull();
    expect(regionProblem({ x: 0, y: 0.999, width: 1, height: 0.001 })).toBeNull();
  });

  it('浮点容差 1e-6：1 + 1e-12 通过，1.001 拒绝', () => {
    expect(REGION_EPS).toBe(1e-6);
    // 浮点加法本身就会给出 1 + 1e-12 量级的噪声
    expect(regionProblem({ x: 0.25, y: 0.25, width: 0.75 + 1e-12, height: 0.75 })).toBeNull();
    expect(regionProblem({ x: 0, y: 0, width: 1, height: 1 + 1e-12 })).toBeNull();
    expect(regionProblem({ x: 0.5, y: 0, width: 0.501, height: 0.5 })).toMatch(/右边界/);
    expect(regionProblem({ x: 0, y: 0.5, width: 0.5, height: 0.501 })).toMatch(/下边界/);
    expect(regionProblem({ x: 0.5, y: 0.5, width: 1, height: 1 })).toMatch(/边界/);
  });

  it('NaN / Infinity / 负值 / 边界值全部拒绝', () => {
    const bad: Array<[string, unknown, RegExp]> = [
      ['NaN', { x: Number.NaN, y: 0, width: 0.5, height: 0.5 }, /有限数/],
      ['Infinity', { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 0.5 }, /有限数/],
      ['-Infinity', { x: 0, y: 0, width: 0.5, height: Number.NEGATIVE_INFINITY }, /有限数/],
      ['负数 width', { x: 0, y: 0, width: -0.1, height: 0.5 }, /width 必须大于 0/],
      ['负数 x', { x: -0.0001, y: 0, width: 0.5, height: 0.5 }, /x 不能为负/],
      ['负数 y', { x: 0, y: -0.5, width: 0.5, height: 0.5 }, /y 不能为负/],
      ['x = 1', { x: 1, y: 0, width: 0, height: 0.5 }, /x 必须小于 1/],
      ['y = 1', { x: 0, y: 1, width: 0.5, height: 0 }, /y 必须小于 1/],
      ['width = 0', { x: 0.2, y: 0.2, width: 0, height: 0.5 }, /width 必须大于 0/],
      ['height = 0', { x: 0.2, y: 0.2, width: 0.5, height: 0 }, /height 必须大于 0/],
      ['width > 1', { x: 0, y: 0, width: 1.5, height: 0.5 }, /右边界/],
      ['height > 1', { x: 0, y: 0, width: 0.5, height: 1.5 }, /下边界/],
      ['缺字段', { x: 0, y: 0, width: 0.5 }, /有限数/],
      ['不是对象', 'region', /必须是/],
      ['null', null, /必须是/],
    ];
    for (const [name, value, pattern] of bad) {
      const problem = regionProblem(value);
      expect(problem, name).not.toBeNull();
      expect(problem, name).toMatch(pattern);
    }
  });
});

// =============================================================================
// 旋转
// =============================================================================

describe('pdfBoxToRegion：四种旋转 × 四种页面长宽比', () => {
  for (const size of PAGE_SIZES) {
    for (const rotate of ROTATIONS) {
      const page = pageOf(size, rotate);
      const rendered = visiblePageSize(page);
      const side = Math.min(size.width, size.height) * 0.002;

      it(`${size.name} / rotate ${rotate}：四角落到正确的渲染角`, () => {
        for (const corner of CORNERS) {
          const region = pdfBoxToRegion(cornerBox(size, corner, side), page);
          expectRegionInRange(region);

          const target = RENDERED_CORNER[CORNER_AFTER_ROTATE[rotate][corner]];
          const dx = side / rendered.width;
          const dy = side / rendered.height;
          const expectedX = target.x === 0 ? 0 : 1 - dx;
          const expectedY = target.y === 0 ? 0 : 1 - dy;

          expect(region.x, `${corner} x`).toBeCloseTo(expectedX, 9);
          expect(region.y, `${corner} y`).toBeCloseTo(expectedY, 9);
          expect(region.width, `${corner} width`).toBeCloseTo(dx, 9);
          expect(region.height, `${corner} height`).toBeCloseTo(dy, 9);
        }
      });

      it(`${size.name} / rotate ${rotate}：页面中心仍映射到中心`, () => {
        const half = 5;
        const cx = size.width / 2;
        const cy = size.height / 2;
        const region = pdfBoxToRegion({ x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half }, page);
        expectRegionInRange(region);
        expect(region.x + region.width / 2).toBeCloseTo(0.5, 9);
        expect(region.y + region.height / 2).toBeCloseTo(0.5, 9);
        expect(region.width).toBeCloseTo((2 * half) / rendered.width, 9);
        expect(region.height).toBeCloseTo((2 * half) / rendered.height, 9);
      });

      it(`${size.name} / rotate ${rotate}：整页框映射成 0,0,1,1`, () => {
        const region = pdfBoxToRegion({ x0: 0, y0: 0, x1: size.width, y1: size.height }, page);
        expect(region.x).toBeCloseTo(0, 9);
        expect(region.y).toBeCloseTo(0, 9);
        expect(region.width).toBeCloseTo(1, 9);
        expect(region.height).toBeCloseTo(1, 9);
      });
    }
  }

  it('旋转 90 / 270 交换可见页的宽高，180 不交换', () => {
    const media = { width: 595, height: 842 };
    expect(visiblePageSize(pageOf(media, 0))).toEqual({ width: 595, height: 842 });
    expect(visiblePageSize(pageOf(media, 90))).toEqual({ width: 842, height: 595 });
    expect(visiblePageSize(pageOf(media, 180))).toEqual({ width: 595, height: 842 });
    expect(visiblePageSize(pageOf(media, 270))).toEqual({ width: 842, height: 595 });
  });

  it('同一 PDF 位置在 90° 旋转后横向与纵向互换', () => {
    const media = { width: 600, height: 300 };
    const box = { x0: 0, y0: 0, x1: 120, y1: 60 }; // 左下角，宽 20% 高 20%
    const flat = pdfBoxToRegion(box, pageOf(media, 0));
    const turned = pdfBoxToRegion(box, pageOf(media, 90));
    // 未旋转：左下
    expect(flat.x).toBeCloseTo(0, 9);
    expect(flat.y).toBeCloseTo(0.8, 9);
    // 顺时针 90°：左下转到左上
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.y).toBeCloseTo(0, 9);
    // 宽高的像素比例跟着页面尺寸走：80px × 30px
    expect(flat.width * 600).toBeCloseTo(120, 9);
    expect(flat.height * 300).toBeCloseTo(60, 9);
    expect(turned.width * 300).toBeCloseTo(60, 9);
    expect(turned.height * 600).toBeCloseTo(120, 9);
  });
});

// =============================================================================
// CropBox
// =============================================================================

describe('pdfBoxToRegion：CropBox', () => {
  const mediaBox = { x0: 0, y0: 0, x1: 595, y1: 842 };
  const cropBox = { x0: 30, y0: 60, x1: 565, y1: 800 };
  const page: PdfPageGeometry = { mediaBox, cropBox, rotate: 0 };

  it('可见尺寸用 CropBox 的宽高', () => {
    expect(visiblePageSize(page)).toEqual({ width: 535, height: 740 });
    expect(visiblePageSize({ mediaBox, rotate: 0 })).toEqual({ width: 595, height: 842 });
  });

  it('以 CropBox 为原点归一化，而不是 MediaBox', () => {
    // CropBox 左上角往内 10%，用 MediaBox 归一化会算出 x = 0.0504…
    const region = pdfBoxToRegion({ x0: 30, y0: 726, x1: 83.5, y1: 800 }, page);
    expect(region.x).toBeCloseTo(0, 9);
    expect(region.y).toBeCloseTo(0, 9);
    expect(region.width).toBeCloseTo(0.1, 9);
    expect(region.height).toBeCloseTo(0.1, 9);
    // 用 MediaBox 会得到 x = 30 / 595 = 0.0504…，这里必须不是
    expect(region.x).not.toBeCloseTo(30 / 595, 3);
  });

  it('超出 CropBox 的 PDF 对象框先被 clamp（合法的视觉裁剪）', () => {
    const region = pdfBoxToRegion({ x0: -100, y0: -100, x1: 800, y1: 900 }, page);
    expect(region.x).toBeCloseTo(0, 9);
    expect(region.y).toBeCloseTo(0, 9);
    expect(region.width).toBeCloseTo(1, 9);
    expect(region.height).toBeCloseTo(1, 9);
  });

  it('完全落在 CropBox 之外的框报错，不产生零面积 region', () => {
    expect(() => pdfBoxToRegion({ x0: 0, y0: 0, x1: 10, y1: 10 }, page)).toThrowError(/CropBox/);
  });

  it('CropBox 与 Rotate 同时生效', () => {
    const rotated: PdfPageGeometry = { ...page, rotate: 270 };
    expect(visiblePageSize(rotated)).toEqual({ width: 740, height: 535 });
    const region = pdfBoxToRegion({ x0: 30, y0: 60, x1: 565, y1: 800 }, rotated);
    expect(region.x).toBeCloseTo(0, 9);
    expect(region.y).toBeCloseTo(0, 9);
    expect(region.width).toBeCloseTo(1, 9);
    expect(region.height).toBeCloseTo(1, 9);
  });

  it('CropBox 缺失时回退到 MediaBox', () => {
    const bare: PdfPageGeometry = { mediaBox, rotate: 0 };
    const region = pdfBoxToRegion({ x0: 0, y0: 0, x1: 59.5, y1: 84.2 }, bare);
    expect(region.x).toBeCloseTo(0, 9);
    expect(region.y).toBeCloseTo(0.9, 9);
    expect(region.width).toBeCloseTo(0.1, 9);
    expect(region.height).toBeCloseTo(0.1, 9);
  });
});

// =============================================================================
// 跨页 / 越界
// =============================================================================

describe('跨页与越界', () => {
  const pageA: PdfPageGeometry = { mediaBox: { x0: 0, y0: 0, x1: 595, y1: 842 }, rotate: 0 };
  const pageB: PdfPageGeometry = {
    mediaBox: { x0: 0, y0: 0, x1: 595, y1: 842 },
    cropBox: { x0: 30, y0: 60, x1: 565, y1: 800 },
    rotate: 270,
  };

  it('同一个 nodeId 的两个 region 分属不同 pdfPage，互不影响', () => {
    const box = { x0: 0, y0: 0, x1: 200, y1: 400 };
    const anchors = [
      { nodeId: 'n1', pdfPage: 3, region: pdfBoxToRegion(box, pageA) },
      { nodeId: 'n1', pdfPage: 7, region: pdfBoxToRegion(box, pageB) },
    ];
    // 独立换算：重算 pageA 的结果不会因为算过 pageB 而变
    expect(pdfBoxToRegion(box, pageA)).toEqual(anchors[0].region);
    expect(pdfBoxToRegion(box, pageB)).toEqual(anchors[1].region);
    // 两个 region 各自都在页面内，没有任何一个跨页
    for (const anchor of anchors) expectRegionInRange(anchor.region);
    expect(anchors[0].region.x + anchors[0].region.width).toBeLessThanOrEqual(1);
    expect(anchors[1].region.y + anchors[1].region.height).toBeLessThanOrEqual(1);
  });

  it('越界 region 报错而不是被裁剪成 1', () => {
    const spilled: Region = { x: 0.4, y: 0.8, width: 0.7, height: 0.5 };
    expect(regionProblem(spilled)).toMatch(/超出页面/);
    const rendered: RenderedSize = { width: 800, height: 600 };
    expect(() => regionToPixels(spilled, rendered)).toThrowError(/不合法/);
    expect(() => regionBorder(spilled, rendered)).toThrowError(/不合法/);
    // regionToPixels 不会把它悄悄改成 x=0, width=1
    expect(regionToPixels({ x: 0.4, y: 0, width: 0.6, height: 1 }, rendered)).toEqual({
      left: 320,
      top: 0,
      width: 480,
      height: 600,
    });
  });
});

// =============================================================================
// region ↔ 像素
// =============================================================================

describe('region ↔ 像素', () => {
  const rendered: RenderedSize = { width: 800, height: 600 };

  it('整数比例精确往返', () => {
    const region: Region = { x: 0.125, y: 0.25, width: 0.5, height: 0.5 };
    expect(regionToPixels(region, rendered)).toEqual({ left: 100, top: 150, width: 400, height: 300 });
    expect(pixelsToRegion({ left: 100, top: 150, width: 400, height: 300 }, rendered)).toEqual(region);
  });

  it('整页与右下角窄条不越界且至少 1 像素', () => {
    expect(regionToPixels({ x: 0, y: 0, width: 1, height: 1 }, rendered)).toEqual({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });
    const sliver = regionToPixels({ x: 0.9999, y: 0.9999, width: 0.0001, height: 0.0001 }, rendered);
    expect(sliver.left + sliver.width).toBeLessThanOrEqual(800);
    expect(sliver.top + sliver.height).toBeLessThanOrEqual(600);
    expect(sliver.width).toBeGreaterThanOrEqual(1);
    expect(sliver.height).toBeGreaterThanOrEqual(1);
  });

  it('往返误差 ≤ 1 像素（多种页面尺寸）', () => {
    const sizes: RenderedSize[] = [
      { width: 800, height: 600 },
      { width: 595, height: 842 },
      { width: 1000, height: 300 },
      { width: 137, height: 91 },
    ];
    const regions: Region[] = [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.333, y: 0.777, width: 0.111, height: 0.222 },
      { x: 0.5, y: 0.5, width: 0.4999, height: 0.4999 },
      { x: 0.001, y: 0.002, width: 0.003, height: 0.004 },
      { x: 0.9, y: 0.1, width: 0.0999, height: 0.8999 },
    ];
    for (const size of sizes) {
      for (const region of regions) {
        const pixels = regionToPixels(region, size);
        // 至少 1 像素、且不出画布
        expect(pixels.width).toBeGreaterThanOrEqual(1);
        expect(pixels.height).toBeGreaterThanOrEqual(1);
        expect(pixels.left).toBeGreaterThanOrEqual(0);
        expect(pixels.top).toBeGreaterThanOrEqual(0);
        expect(pixels.left + pixels.width).toBeLessThanOrEqual(size.width);
        expect(pixels.top + pixels.height).toBeLessThanOrEqual(size.height);

        const back = pixelsToRegion(pixels, size);
        expectRegionInRange(back);
        expect(Math.abs(back.x - region.x) * size.width).toBeLessThanOrEqual(1);
        expect(Math.abs(back.y - region.y) * size.height).toBeLessThanOrEqual(1);

        const again = regionToPixels(back, size);
        expect(Math.abs(again.left - pixels.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(again.top - pixels.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(again.width - pixels.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(again.height - pixels.height)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('regionBorder 向外取整并包含 region，且至少 1 像素', () => {
    expect(regionBorder({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, rendered)).toEqual({
      left: 200,
      top: 150,
      right: 600,
      bottom: 450,
    });
    const tiny = regionBorder({ x: 0.5, y: 0.5, width: 1e-9, height: 1e-9 }, rendered);
    expect(tiny.right - tiny.left).toBeGreaterThanOrEqual(1);
    expect(tiny.bottom - tiny.top).toBeGreaterThanOrEqual(1);
    expect(tiny.left).toBeGreaterThanOrEqual(0);
    expect(tiny.right).toBeLessThanOrEqual(rendered.width);
    expect(tiny.bottom).toBeLessThanOrEqual(rendered.height);
  });

  it('像素矩形超出画布报错，不裁剪', () => {
    expect(() => pixelsToRegion({ left: 780, top: 0, width: 100, height: 10 }, rendered)).toThrowError(/不合法/);
    expect(() => pixelsToRegion({ left: -5, top: 0, width: 100, height: 10 }, rendered)).toThrowError(/不合法/);
    expect(() => pixelsToRegion({ left: 0, top: 0, width: 0, height: 10 }, rendered)).toThrowError(/大于 0/);
  });

  it('NaN / Infinity 尺寸与坐标一律抛错', () => {
    expect(() => regionToPixels({ x: 0, y: 0, width: 1, height: 1 }, { width: Number.NaN, height: 600 })).toThrowError(
      /有限数/,
    );
    expect(() => regionToPixels({ x: 0, y: 0, width: 1, height: 1 }, { width: 800, height: Number.POSITIVE_INFINITY })).toThrowError(
      /有限数/,
    );
    expect(() => regionToPixels({ x: 0, y: 0, width: 1, height: 1 }, { width: 0, height: 600 })).toThrowError(/整数/);
    expect(() => pixelsToRegion({ left: Number.NaN, top: 0, width: 10, height: 10 }, rendered)).toThrowError(/有限数/);
  });
});

// =============================================================================
// 输入健壮性
// =============================================================================

describe('PDF 几何输入健壮性', () => {
  const media = { x0: 0, y0: 0, x1: 595, y1: 842 };

  it('非法 /Rotate 抛错', () => {
    const page = { mediaBox: media, rotate: 45 } as unknown as PdfPageGeometry;
    expect(() => visiblePageSize(page)).toThrowError(/Rotate/);
    expect(() => pdfBoxToRegion({ x0: 0, y0: 0, x1: 10, y1: 10 }, page)).toThrowError(/Rotate/);
  });

  it('NaN / Infinity 的框与页面尺寸抛错', () => {
    const page: PdfPageGeometry = { mediaBox: media, rotate: 0 };
    expect(() => pdfBoxToRegion({ x0: Number.NaN, y0: 0, x1: 10, y1: 10 }, page)).toThrowError(/有限数/);
    expect(() => pdfBoxToRegion({ x0: 0, y0: 0, x1: Number.POSITIVE_INFINITY, y1: 10 }, page)).toThrowError(/有限数/);
    expect(() =>
      visiblePageSize({ mediaBox: { ...media, x1: Number.NaN }, rotate: 0 }),
    ).toThrowError(/有限数/);
    expect(() =>
      visiblePageSize({ mediaBox: media, cropBox: { x0: 0, y0: 0, x1: Number.NaN, y1: 10 }, rotate: 0 }),
    ).toThrowError(/有限数/);
  });

  it('零面积框与零尺寸页面抛错', () => {
    const page: PdfPageGeometry = { mediaBox: media, rotate: 0 };
    expect(() => pdfBoxToRegion({ x0: 10, y0: 10, x1: 10, y1: 20 }, page)).toThrowError(/宽度必须大于 0/);
    expect(() => pdfBoxToRegion({ x0: 10, y0: 20, x1: 20, y1: 20 }, page)).toThrowError(/高度必须大于 0/);
    expect(() => visiblePageSize({ mediaBox: { x0: 0, y0: 0, x1: 0, y1: 10 }, rotate: 0 })).toThrowError(/宽度/);
    expect(() => visiblePageSize({ mediaBox: { x0: 0, y0: 0, x1: 10, y1: 10 }, rotate: 0, cropBox: undefined })).not.toThrow();
  });

  it('倒序给出的矩形按 min/max 处理', () => {
    const page: PdfPageGeometry = { mediaBox: media, rotate: 0 };
    const swapped = pdfBoxToRegion({ x0: 100, y0: 200, x1: 0, y1: 0 }, page);
    const normal = pdfBoxToRegion({ x0: 0, y0: 0, x1: 100, y1: 200 }, page);
    expect(swapped.x).toBeCloseTo(normal.x, 12);
    expect(swapped.width).toBeCloseTo(normal.width, 12);
    expect(swapped.height).toBeCloseTo(normal.height, 12);
  });
});
