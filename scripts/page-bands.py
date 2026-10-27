#!/usr/bin/env python3
"""
页面条带探测：给没有文字层的册子（八下、九下）提供精确的版面坐标。

    python3 scripts/page-bands.py --volume b9b --page 56 [--page 57 ...]
    python3 scripts/page-bands.py --volume b9b --pages 56-62 --min-ink 0.004

输出每一页的「墨迹条带」：把页面按行切分，连续有墨迹的行合成一个带，并给出
该带的归一化 y 范围、内部按列聚合出的 x 范围、以及带的起止行文字量占比。

这不是 OCR，只回答「这一块在页面上的哪一矩形里」——比肉眼估准得多，
比 `pdftotext -bbox` 更适合没有文字层的册子。

注意：条带只按「连续行都有墨迹」合并，左右并排的两个块会被算成一条带。
需要分栏时用 --gutter 让它在列间空白处切开。
"""
import argparse
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"

DARK = 170  # 与 check-ink-coverage.py 保持一致


def bands_of(mask: np.ndarray, min_ink: float, gutter: bool):
    """把二值图切成横条带，再在条带内按列空白切成若干块。"""
    H, W = mask.shape
    row_ink = mask.mean(axis=1)
    is_row = row_ink > min_ink

    out = []
    y = 0
    while y < H:
        if not is_row[y]:
            y += 1
            continue
        y0 = y
        while y < H and is_row[y]:
            y += 1
        y1 = y
        band = mask[y0:y1]
        col_ink = band.mean(axis=0)
        cols = col_ink > min_ink / 2
        if gutter:
            # 在条带内按列空白切块
            x = 0
            while x < W:
                if not cols[x]:
                    x += 1
                    continue
                x0 = x
                while x < W and cols[x]:
                    x += 1
                out.append((x0, y0, x, y1))
        else:
            xs = np.where(cols)[0]
            if xs.size:
                out.append((int(xs[0]), y0, int(xs[-1]) + 1, y1))
    return out


def merge_lines(boxes, gap_tol):
    """相邻且左右范围接近的条带合成一段（一行字常被字间空隙切成几条）。"""
    out = []
    for b in boxes:
        if out:
            last = out[-1]
            vgap = b[1] - last[3]
            hob = min(last[2], b[2]) - max(last[0], b[0])
            if vgap <= gap_tol and hob > 0.5 * min(last[2] - last[0], b[2] - b[0]):
                out[-1] = (min(last[0], b[0]), last[1], max(last[2], b[2]), max(last[3], b[3]))
                continue
        out.append(b)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--volume", required=True)
    ap.add_argument("--page", type=int, action="append", default=[])
    ap.add_argument("--pages", default="")
    ap.add_argument("--min-ink", type=float, default=0.004)
    ap.add_argument("--gutter", action="store_true", help="在列间空白处切块（双栏页用）")
    args = ap.parse_args()

    pages = list(args.page)
    if args.pages:
        m = re.match(r"^(\d+)-(\d+)$", args.pages)
        if m:
            pages.extend(range(int(m.group(1)), int(m.group(2)) + 1))
        else:
            pages.extend(int(p) for p in args.pages.split(",") if p.strip())

    for page in pages:
        png = SUK / "pages" / args.volume / f"p{page:04d}.png"
        if not png.exists():
            print(f"缺页图：{png}")
            continue
        img = Image.open(png).convert("L")
        W, H = img.size
        mask = np.asarray(img) < DARK

        boxes = bands_of(mask, args.min_ink, args.gutter)
        boxes = merge_lines(boxes, gap_tol=2)
        print(f"\n=== pdfPage {page}（{W}×{H}）  块数 {len(boxes)}")
        print(f"{'#':>2}  {'x':>6} {'y':>6} {'w':>6} {'h':>6}   （归一化，左开右闭）")
        for i, (x0, y0, x1, y1) in enumerate(boxes, 1):
            print(
                f"{i:>2}  {x0 / W:6.4f} {y0 / H:6.4f} {(x1 - x0) / W:6.4f} {(y1 - y0) / H:6.4f}"
            )


if __name__ == "__main__":
    main()
