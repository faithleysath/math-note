#!/usr/bin/env python3
"""汇总节点完整度审计：检查每章页覆盖是否连续、资源是否逐张覆盖、缺陷分类。

    python3 scripts/summarize-node-audits.py [--review DIR] [--expected DIR] [--json]

只读。退出码：0 = 所有已存在的审计记录覆盖完整；1 = 有缺页/缺资源/非法字段；2 = 目录错误。
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"
KINDS = {
    "missing-text",
    "truncated-text",
    "wrong-text",
    "missing-image",
    "wrong-image",
    "incomplete-image",
    "caption-alt-wrong",
    "source-defect",
}
SEVERITIES = {"high", "medium", "low"}


def load_json(path: Path):
    return json.loads(path.read_text())


def chapters_and_ranges(expected_dir: Path):
    out: dict[str, list[int]] = {}
    for path in sorted(expected_dir.glob("*.json")):
        if ".report." in path.name:
            continue
        data = load_json(path)
        chapter = data.get("chapter")
        span = data.get("pdfPageRange")
        if not chapter or not isinstance(span, list) or len(span) != 2:
            continue
        if chapter in out:
            out[chapter] = [min(out[chapter][0], span[0]), max(out[chapter][1], span[1])]
        else:
            out[chapter] = [int(span[0]), int(span[1])]
    return out


def chapter_assets(chapter: str, parts_dir: Path):
    ids = []
    for path in sorted(parts_dir.glob(f"{chapter}-*.json")):
        if ".report." in path.name:
            continue
        data = load_json(path)
        ids.extend(asset["id"] for asset in data.get("assets", []))
    return ids


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", default=str(SUK / "review" / "node-completeness"))
    parser.add_argument("--expected", default=str(SUK / "expected"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    review_dir = Path(args.review)
    expected_dir = Path(args.expected)
    if not review_dir.is_dir():
        print(f"目录不存在：{review_dir}", file=sys.stderr)
        return 2

    ranges = chapters_and_ranges(expected_dir)
    rows = []
    ok = True
    for chapter, (lo, hi) in ranges.items():
        path = review_dir / f"{chapter}.json"
        row = {
            "chapter": chapter,
            "record": path.exists(),
            "pages": 0,
            "missingPages": [],
            "assets": 0,
            "missingAssets": [],
            "defects": Counter(),
            "problems": [],
        }
        if not path.exists():
            row["problems"].append("没有审计记录")
            ok = False
            rows.append(row)
            continue
        try:
            data = load_json(path)
        except Exception as exc:  # noqa: BLE001
            row["problems"].append(f"JSON 解析失败：{exc}")
            ok = False
            rows.append(row)
            continue

        pages = data.get("pages") or []
        seen_pages = set()
        for page in pages:
            pdf = page.get("pdfPage")
            if not isinstance(pdf, int):
                row["problems"].append(f"页记录缺 pdfPage：{page!r}")
                continue
            seen_pages.add(pdf)
            if page.get("verdict") not in ("ok", "defect"):
                row["problems"].append(f"p{pdf} verdict 非法：{page.get('verdict')!r}")
            if not isinstance(page.get("textOk"), bool) or not isinstance(page.get("imagesOk"), bool):
                row["problems"].append(f"p{pdf} 缺 textOk/imagesOk")
        row["pages"] = len(seen_pages)
        row["missingPages"] = [p for p in range(lo, hi + 1) if p not in seen_pages]
        if row["missingPages"]:
            row["problems"].append(f"缺 {len(row['missingPages'])} 页：{row['missingPages'][:10]}")

        expected_assets = chapter_assets(chapter, SUK / "parts")
        assets = data.get("assets") or []
        seen_assets = {a.get("id") for a in assets}
        row["assets"] = len(seen_assets)
        row["missingAssets"] = [i for i in expected_assets if i not in seen_assets]
        if row["missingAssets"]:
            row["problems"].append(f"缺 {len(row['missingAssets'])} 张资源：{row['missingAssets'][:5]}")
        if len(seen_assets) != len(assets):
            row["problems"].append("assets[] 有重复 id")
        for asset in assets:
            if asset.get("verdict") not in ("ok", "defect"):
                row["problems"].append(f"资源 {asset.get('id')} verdict 非法")
            pdf = asset.get("pdfPage")
            if isinstance(pdf, int) and not (lo <= pdf <= hi):
                row["problems"].append(f"资源 {asset.get('id')} pdfPage {pdf} 不在本章")

        defects = data.get("defects") or []
        for defect in defects:
            kind = defect.get("kind")
            sev = defect.get("severity")
            if kind not in KINDS:
                row["problems"].append(f"缺陷 kind 非法：{kind!r}")
            else:
                row["defects"][kind] += 1
            if sev not in SEVERITIES:
                row["problems"].append(f"缺陷 severity 非法：{sev!r}")
            pdf = defect.get("pdfPage")
            if not isinstance(pdf, int) or not (lo <= pdf <= hi):
                row["problems"].append(f"缺陷页 {pdf!r} 不在章范围")
            if isinstance(pdf, int) and pdf not in seen_pages:
                row["problems"].append(f"缺陷页 p{pdf} 没有 pages 记录")

        if row["problems"]:
            ok = False
        rows.append(row)

    if args.json:
        out = []
        for row in rows:
            out.append({**row, "defects": dict(row["defects"])})
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"{'章':<12} {'页':>9} {'资源':>9} {'文字缺':>6} {'图缺':>6}  问题")
        print("-" * 88)
        for row in rows:
            text_defects = sum(v for k, v in row["defects"].items() if k in {"missing-text", "truncated-text", "wrong-text"})
            image_defects = sum(v for k, v in row["defects"].items() if k in {"missing-image", "wrong-image", "incomplete-image", "caption-alt-wrong"})
            print(
                f"{row['chapter']:<12} {row['pages']:>3}/{row['missingPages'][0] if row['missingPages'] else '-':>5} "
                f"{row['assets']:>4}/{len(row['missingAssets']) if row['missingAssets'] else 0:>3} "
                f"{text_defects:>6} {image_defects:>6}  {'；'.join(row['problems'][:2])}"
            )
        total_defects = Counter()
        for row in rows:
            total_defects.update(row["defects"])
        print("-" * 88)
        print("缺陷合计：" + (" ".join(f"{k}={v}" for k, v in sorted(total_defects.items())) or "0"))
        print("结论：" + ("所有已存在记录覆盖完整" if ok else "有缺页/缺资源/字段问题（见上）"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
