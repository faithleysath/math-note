#!/usr/bin/env python3
"""
按「清单条目 → 它最后变成了哪个节点」把图谱画回页图，供视觉复核用。

    python3 scripts/draw-node-overlay.py --volume b9a --pages 62-76 \
        --out local-textbook/sukey/review/nodes-b9a

为什么不直接用 `draw:boxes`：那是按清单画的，只回答「这一块登记了没有」。
视觉复核要回答的是「这一块在图谱里**变成了什么**」——所以这里把每条清单条目
按它的 srcId 反查所属节点（节点 id 相同，或 `tags` 里有 `src:<srcId>`），
按**节点类型上色**并标出节点 id。一眼能看出：某块被错误合成一个节点、或者根本没进图谱。

配色：
  绿 note · 蓝 problem · 紫 proposition · 橙 definition · 红 asset(figure) · 灰 section

**怎么读这张图**：同一个节点标签可能出现在**多个框**上 —— 那表示这个节点吞并了多块清单条目
（规约允许：`note` 吞并连续源条目时，其余 srcId 记在 `tags` 里）。所以「一块正文旁边还有一个
同标签的小框」不是重复，而是「这一块也归这个节点」。反过来，**一个框里出现两个不同标签**才是问题。
"""
import argparse
import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"

COLORS = {
    "note": (30, 150, 60),
    "problem": (30, 90, 200),
    "proposition": (150, 40, 170),
    "definition": (230, 120, 10),
    "proof": (110, 110, 110),
    "counterexample": (110, 110, 110),
    "section": (80, 80, 80),
    "branch": (80, 80, 80),
    "asset": (220, 30, 30),
    "missing": (0, 0, 0),
}

SHORT = {
    "note": "N",
    "problem": "P",
    "proposition": "R",
    "definition": "D",
    "section": "S",
    "asset": "F",
    "missing": "?",
}


def load_srcid_map(parts_dir: Path) -> dict[str, dict]:
    """srcId → {nodeId, type, kind, title}"""
    out: dict[str, dict] = {}
    for path in sorted(parts_dir.glob("*.json")):
        if ".report." in path.name:
            continue
        part = json.loads(path.read_text())
        for node in part.get("nodes", []):
            info = {
                "nodeId": node["id"],
                "type": node["type"],
                "kind": node.get("kind"),
                "title": node.get("title", ""),
            }
            out[node["id"].split("@")[0]] = info
            for tag in node.get("tags", []) or []:
                if isinstance(tag, str) and tag.startswith("src:"):
                    out[tag[4:]] = info
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--volume", required=True)
    ap.add_argument("--expected-dir", default=str(SUK / "expected"))
    ap.add_argument("--parts-dir", default=str(SUK / "parts"))
    ap.add_argument("--pages", default="")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    srcmap = load_srcid_map(Path(args.parts_dir))
    exp_dir = Path(args.expected_dir)

    pages: list[int] = []
    if args.pages:
        if "-" in args.pages:
            a, b = args.pages.split("-")
            pages = list(range(int(a), int(b) + 1))
        else:
            pages = [int(p) for p in args.pages.split(",") if p.strip()]

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    stats: Counter[str] = Counter()
    for path in sorted(exp_dir.glob(f"{args.volume}-*.json")):
        expected = json.loads(path.read_text())
        by_page: dict[int, list[dict]] = {}
        for item in expected["items"]:
            if item.get("region"):
                by_page.setdefault(item["pdfPage"], []).append(item)

        for page in pages if pages else sorted(by_page):
            items = by_page.get(page)
            if not items:
                continue
            png = SUK / "pages" / args.volume / f"p{page:04d}.png"
            if not png.exists():
                continue
            img = Image.open(png).convert("RGB")
            W, H = img.size
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 20)
            except OSError:
                font = ImageFont.load_default()

            for item in items:
                mapped = srcmap.get(item["srcId"])
                if item["kind"] == "figure":
                    # figure 不建节点，它变成 asset —— 统一按红色画，
                    # 不跟着「认领它的那个 note」上色，否则看起来像一大块正文
                    kind = "asset"
                    label = "F"
                    detail = item["srcId"]
                elif mapped is None and item["kind"] == "figure":
                    # figure 不建节点，它变成 asset；按 asset 记
                    kind = "asset"
                    label = "F"
                    detail = item["srcId"]
                elif mapped is None:
                    kind = "missing"
                    label = "?"
                    detail = item["srcId"]
                else:
                    kind = mapped["type"]
                    label = SHORT.get(kind, "?")
                    detail = mapped["nodeId"].replace("phy-", "")
                stats[kind] += 1
                r = item["region"]
                color = COLORS.get(kind, (0, 0, 0))
                box = [r["x"] * W, r["y"] * H, (r["x"] + r["width"]) * W, (r["y"] + r["height"]) * H]
                draw.rectangle(box, outline=color, width=4)
                draw.text((box[0] + 4, box[1] + 1), f"{label} {detail[-10:]}", fill=color, font=font)

            img.save(out_dir / f"p{page:04d}.png")

    print(f"输出目录：{out_dir}")
    print(f"配色：" + "  ".join(f"{SHORT.get(k, k)}={k}{COLORS.get(k)}" for k in ("note", "problem", "proposition", "definition", "asset", "missing")))
    print("条目归类统计：" + json.dumps(dict(stats), ensure_ascii=False))
    if stats.get("missing"):
        print(f"⚠ 有 {stats['missing']} 条清单条目在图谱里找不到对应节点/资源")


if __name__ == "__main__":
    main()
