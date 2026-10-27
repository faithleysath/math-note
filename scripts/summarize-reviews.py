#!/usr/bin/env python3
"""视觉复核汇总：检查每章复核记录是否连续覆盖、缺陷分类是否合法，并汇总。

    python3 scripts/summarize-reviews.py [--review DIR] [--expected DIR] [--volume b9a ...] [--json]

只读。退出码：0 = 所有章都有记录且页覆盖连续；1 = 有缺章/缺页/非法分类；2 = 参数或读文件失败。
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"
KINDS = {"missing-block", "wrong-region", "caption-duplicated", "merged-wrong", "cut-off"}


def load_expected_ranges(expected_dir: Path) -> dict[str, tuple[int, int]]:
    """chapter -> (min pdfPage, max pdfPage)，来自该章所有 part 清单。"""
    ranges: dict[str, tuple[int, int]] = {}
    for path in sorted(expected_dir.glob("*.json")):
        if ".report." in path.name:
            continue
        raw = json.loads(path.read_text())
        chapter = raw.get("chapter")
        span = raw.get("pdfPageRange")
        if not chapter or not isinstance(span, list) or len(span) != 2:
            continue
        lo, hi = int(span[0]), int(span[1])
        if chapter in ranges:
            ranges[chapter] = (min(ranges[chapter][0], lo), max(ranges[chapter][1], hi))
        else:
            ranges[chapter] = (lo, hi)
    return ranges


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", default=str(SUK / "review"))
    parser.add_argument("--expected", default=str(SUK / "expected"))
    parser.add_argument("--volume", action="append", help="只统计指定册，可重复")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    review_dir = Path(args.review)
    expected_dir = Path(args.expected)
    if not review_dir.is_dir() or not expected_dir.is_dir():
        print("review 或 expected 目录不存在", file=sys.stderr)
        return 2

    spans = load_expected_ranges(expected_dir)
    chapters = sorted(
        ch for ch in spans if args.volume is None or ch.split("-")[1] in args.volume
    )

    results = []
    ok = True
    for chapter in chapters:
        vol, ch = chapter.split("-")[1], chapter.split("-")[2]
        record_path = review_dir / f"{vol}-{ch}.json"
        row = {
            "chapter": chapter,
            "record": str(record_path.relative_to(ROOT)) if record_path.exists() else None,
            "expectedPages": [spans[chapter][0], spans[chapter][1]],
            "status": None,
            "pages": 0,
            "missing": [],
            "extra": [],
            "ok": 0,
            "defect": 0,
            "defects": Counter(),
            "problems": [],
        }
        if not record_path.exists():
            row["problems"].append("没有复核记录")
            ok = False
            results.append(row)
            continue
        try:
            raw = json.loads(record_path.read_text())
        except Exception as exc:  # noqa: BLE001
            row["problems"].append(f"JSON 解析失败：{exc}")
            ok = False
            results.append(row)
            continue

        row["status"] = raw.get("status")
        pages = raw.get("pages") or []
        seen = set()
        for page in pages:
            pdf = page.get("pdfPage")
            if not isinstance(pdf, int):
                row["problems"].append(f"页记录缺 pdfPage：{page!r}")
                continue
            seen.add(pdf)
            verdict = page.get("verdict")
            if verdict == "ok":
                row["ok"] += 1
            elif verdict == "defect":
                row["defect"] += 1
            else:
                row["problems"].append(f"p{pdf} verdict 不认识：{verdict!r}")
        row["pages"] = len(seen)

        lo, hi = spans[chapter]
        expected = set(range(lo, hi + 1))
        row["missing"] = sorted(expected - seen)
        row["extra"] = sorted(seen - expected)
        if row["missing"]:
            row["problems"].append(f"缺 {len(row['missing'])} 页：{row['missing']}")
        if row["extra"]:
            row["problems"].append(f"多出章节外页：{row['extra']}")

        defects = raw.get("defects") or []
        for defect in defects:
            kind = defect.get("kind")
            if kind not in KINDS:
                row["problems"].append(f"缺陷 kind 非法：{kind!r}（{defect.get('detail', '')[:60]}）")
            else:
                row["defects"][kind] += 1
            pdf = defect.get("pdfPage")
            if isinstance(pdf, int) and pdf not in seen:
                row["problems"].append(f"缺陷页 p{pdf} 不在 pages 记录里")
            if pdf not in expected and isinstance(pdf, int):
                row["problems"].append(f"缺陷页 p{pdf} 不在本章范围 {lo}–{hi}")

        if row["status"] != "fully-reviewed":
            row["problems"].append(f"status = {row['status']!r}")
        if row["problems"]:
            ok = False
        results.append(row)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        total_defects = Counter()
        print(f"{'章':<12} {'状态':<15} {'页':>6} {'ok':>4} {'defect':>6}  缺陷分类")
        print("-" * 78)
        for row in results:
            kinds = " ".join(f"{k}={v}" for k, v in sorted(row["defects"].items())) or "—"
            total_defects.update(row["defects"])
            print(
                f"{row['chapter']:<12} {str(row['status']):<15} {row['pages']:>3}/{row['expectedPages'][1]-row['expectedPages'][0]+1:<3}"
                f" {row['ok']:>4} {row['defect']:>6}  {kinds}"
            )
            for problem in row["problems"]:
                print(f"    ! {problem}")
        print("-" * 78)
        print("缺陷合计：" + (" ".join(f"{k}={v}" for k, v in sorted(total_defects.items())) or "0"))
        print("结论：" + ("通过" if ok else "有问题（见上）"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
