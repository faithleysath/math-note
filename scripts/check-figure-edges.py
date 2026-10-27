#!/usr/bin/env python3
"""
图框切边检查：asset 的 region 是不是把画面切掉了。

    python3 scripts/check-figure-edges.py --parts local-textbook/sukey/parts --volumes b9a,b9b

为什么需要它：**图框没有任何机械安全网**。
- `check:lines` 用文字行做探针，而图的内部没有文字层（或文字在图片里），查不到；
- `check:ink` 先把大片实心区减掉（照片正是实心区），也查不到。
所以「图 12-23 右侧切掉色标 137.3」「图 13-43 切掉 6.4%」这类问题只能靠审计逐张看图发现。
八年级一次性发现了 8/40。

原理：紧贴 region **外侧** 4 像素的一圈，如果是干净的留白或纯色底板，灰度标准差很低；
如果画面被切断，被切断的那部分（照片、色块、线条）会落在这圈里，标准差明显偏高。
**判据是「外侧一圈是否均匀」，不是「有没有像素」** —— 这样带底板的彩色卡片不会被误报。

校准结果（诚实记录，**它不是闸门，只是候选生成器**）：
- 外侧条带标准差 std>30：八年级 81/458（18%）、九年级 73/360（20%）
- 换成「边界两侧差<10 且外侧 std>25」（判断画面是否连续跨过边界）：
  八年级 44/458（10%）、九年级 51/360（14%）

八年级那 44 条里大部分是**裁到彩色卡片边缘**（卡片继续延伸出框，属无害留白损失），
不是内容被切断。像素层面无法区分「切掉照片」和「少带一块底板颜色」。
所以这个脚本的定位是：**给视觉复核生成候选清单**，不是合并前的硬关卡。
真正的判据仍然是「打开裁好的 png 看一眼」。
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"

STRIP = 4          # 外侧探测环宽度（像素）
STD_THRESHOLD = 30.0  # 灰度标准差阈值，超过就疑似切边


def edges_of(img: np.ndarray, region: dict):
    """返回四个方向的 (名字, 外侧条带的灰度数组)"""
    H, W = img.shape
    x0 = int(region["x"] * W)
    y0 = int(region["y"] * H)
    x1 = int((region["x"] + region["width"]) * W)
    y1 = int((region["y"] + region["height"]) * H)
    out = []
    if y0 - STRIP >= 0:
        out.append(("top", img[y0 - STRIP:y0, x0:x1]))
    if y1 + STRIP <= H:
        out.append(("bottom", img[y1:y1 + STRIP, x0:x1]))
    if x0 - STRIP >= 0:
        out.append(("left", img[y0:y1, x0 - STRIP:x0]))
    if x1 + STRIP <= W:
        out.append(("right", img[y0:y1, x1:x1 + STRIP]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parts", default=str(SUK / "parts"))
    ap.add_argument("--volumes", default="b9a,b9b")
    ap.add_argument("--threshold", type=float, default=STD_THRESHOLD)
    ap.add_argument("--top", type=int, default=40)
    args = ap.parse_args()

    volumes = {v.strip() for v in args.volumes.split(",") if v.strip()}
    parts_dir = Path(args.parts)

    findings = []
    checked = 0
    for path in sorted(parts_dir.glob("*.json")):
        if ".report." in path.name:
            continue
        part = json.loads(path.read_text())
        vol = part.get("meta", {}).get("volume")
        if vol not in volumes:
            continue
        for asset in part.get("assets", []):
            region = asset.get("region")
            page = asset.get("pdfPage")
            if not region or page is None:
                continue
            png = SUK / "pages" / vol / f"p{page:04d}.png"
            if not png.exists():
                continue
            gray = np.asarray(Image.open(png).convert("L")).astype(np.float32)
            checked += 1
            for name, strip in edges_of(gray, region):
                if strip.size < 50:
                    continue
                std = float(strip.std())
                if std > args.threshold:
                    findings.append((std, vol, page, asset["id"], name, strip.size))

    findings.sort(reverse=True)
    print(f"检查 {checked} 张 asset（{','.join(sorted(volumes))}）· 阈值 std>{args.threshold}")
    if not findings:
        print("✓ 没有发现疑似切边的图框")
        return
    print(f"⚠ {len(findings)} 条疑似切边（按严重度排序，前 {args.top} 条）：")
    for std, vol, page, aid, side, size in findings[: args.top]:
        print(f"  std={std:6.1f}  {vol} p{page:04d} {side:7s} {aid}")


if __name__ == "__main__":
    main()
