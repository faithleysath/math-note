#!/usr/bin/env python3
"""
墨迹覆盖率检查：页面上有多少「深色像素」落在条目的 region 里。

    python3 scripts/check-ink-coverage.py --expected <清单.json> [--threshold 0.90]

为什么需要它：九下没有文字层，`check:lines` 那种「用每个词做探针」的办法用不了。
但页面渲染图还在 —— 直接统计墨迹：一个 region 漏了一整段正文，页面的墨迹覆盖率会明显掉下来。

只统计**文字墨迹**：先做 9 像素形态学开运算把照片/满版插图减掉（它们按规则不登记 region），
否则章首页、插图页的覆盖率永远很低（实测 p0008 只有 5.9%，纯属误报）。

判据宽松但有效，专抓「整块没登记」这种量级的缺失，抓不到「框略小一圈」。
真正精细的仍然靠 `draw:boxes` 的核对图人眼过。

校准（已逐页视觉复核的清单）：
- 八年级上册若干批：**86.5% / 90.1%**
- 九年级上册（region 全按文字层行框对齐）：**93.9% / 94.0%**
所以默认阈值 80%，看的是「明显低于这个区间」而不是「不到 90%」。
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"


def ink_mask(img: Image.Image) -> Image.Image:
    """深色像素 = 墨迹。阈值按书页白底（>=230）定，浅色底纹和底色卡片不算墨迹。"""
    gray = img.convert("L")
    return gray.point(lambda v: 255 if v < 170 else 0, mode="L")


def text_mask(mask: Image.Image) -> Image.Image:
    """
    去掉「大块实心深色区」后的文字墨迹。

    照片、满版插图、整版背景照也是深色像素，但它们按规则不登记 region，
    留在分母里会让章首页、插图页的覆盖率永远很低（实测 p0008 只有 5.9%）。
    这里做一次形态学开运算：9 像素内还能活下来的就是成片的实心区（照片），
    从墨迹里减掉，只留下笔画细的文字与线条。
    """
    solid = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    from PIL import ImageChops
    return ImageChops.subtract(mask, solid)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--expected", required=True)
    ap.add_argument("--threshold", type=float, default=0.80)
    ap.add_argument("--pages", default="", help="逗号分隔的 pdfPage，默认全部")
    args = ap.parse_args()

    expected = json.loads(Path(args.expected).read_text())
    volume = expected["volume"]
    page_dir = SUK / "pages" / volume

    # 页面区域并集（条目 region + extraRegions）
    regions: dict[int, list[dict]] = {}
    for item in expected["items"]:
        if item.get("region"):
            regions.setdefault(item["pdfPage"], []).append(item["region"])
        for extra in item.get("extraRegions") or []:
            regions.setdefault(extra["pdfPage"], []).append(extra["region"])

    only = {int(p) for p in args.pages.split(",") if p.strip()} if args.pages else None
    pages = sorted(regions)
    if only:
        pages = [p for p in pages if p in only]

    # 章首页：整版背景照 + 大标题（按规则背景不登记），墨迹本身就是画面，跳过
    import re
    opener_pages = set()

    total_ink = 0
    total_hit = 0
    rows = []
    for page in pages:
        if page in opener_pages:
            continue
        png = page_dir / f"p{page:04d}.png"
        if not png.exists():
            print(f"缺少页图：{png}", file=sys.stderr)
            continue
        img = Image.open(png).convert("RGB")
        W, H = img.size
        mask = text_mask(ink_mask(img))

        covered = Image.new("L", (W, H), 0)
        for r in regions[page]:
            box = (
                max(0, int(r["x"] * W)),
                max(0, int(r["y"] * H)),
                min(W, int((r["x"] + r["width"]) * W)),
                min(H, int((r["y"] + r["height"]) * H)),
            )
            if box[2] > box[0] and box[3] > box[1]:
                covered.paste(255, box)

        ink = mask.load()
        cov = covered.load()
        page_ink = 0
        page_hit = 0
        # 每 2 像素采样，够用且快
        for y in range(0, H, 2):
            for x in range(0, W, 2):
                if ink[x, y]:
                    page_ink += 1
                    if cov[x, y]:
                        page_hit += 1
        total_ink += page_ink
        total_hit += page_hit
        ratio = page_hit / page_ink if page_ink else 1.0
        rows.append((ratio, page, page_ink, page_hit))

    if not rows:
        print("没有可检查的页")
        return 2

    overall = total_hit / total_ink if total_ink else 1.0
    name = Path(args.expected).name
    print(f"{name} · {len(rows)} 页 · 墨迹覆盖率 {overall * 100:.1f}%（{total_hit}/{total_ink} 个采样点）")

    rows.sort()
    worst = [r for r in rows if r[0] < args.threshold]
    if not worst:
        print(f"✓ 每页墨迹覆盖率都在 {args.threshold * 100:.0f}% 以上")
    else:
        print(f"⚠ {len(worst)} 页低于 {args.threshold * 100:.0f}%：")
        for ratio, page, ink, hit in worst[:12]:
            print(f"    p{page:04d}  {ratio * 100:.1f}%  漏 {ink - hit} 个采样点")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
