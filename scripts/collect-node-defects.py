#!/usr/bin/env python3
"""汇总节点完整度审计的缺陷，供修复代理使用。

    python3 scripts/collect-node-defects.py

读 `local-textbook/sukey/review/node-completeness/*.json`，输出：
  audit/node-completeness/defects.json   机器可读
  audit/node-completeness/defects.md     按章/严重度分组

只读，不改审计记录。会把手写审计里的同义 kind 归一到任务书的 8 类。
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"
REVIEW = SUK / "review" / "node-completeness"
OUT = SUK / "audit" / "node-completeness"

ALIASES = {
    "dirty-crop": "wrong-image",
    "alt-mismatch": "caption-alt-wrong",
    "caption-missing": "caption-alt-wrong",
    "missing-caption": "caption-alt-wrong",
    "wrong-caption": "caption-alt-wrong",
    "cut-off": "incomplete-image",
    "wrong-region": "incomplete-image",
    "missing-image-file": "missing-image",
    "image-missing": "missing-image",
    "text-missing": "missing-text",
    "text-truncated": "truncated-text",
    "text-wrong": "wrong-text",
}
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
SEV_ORDER = {"high": 0, "medium": 1, "low": 2}


def main() -> int:
    if not REVIEW.is_dir():
        print(f"没有审计目录：{REVIEW}", file=sys.stderr)
        return 2
    records = []
    for path in sorted(REVIEW.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except Exception as exc:  # noqa: BLE001
            print(f"跳过解析失败的 {path.name}: {exc}", file=sys.stderr)
            continue
        chapter = data.get("chapter") or path.stem
        defects = []
        for raw in data.get("defects") or []:
            kind = ALIASES.get(raw.get("kind"), raw.get("kind"))
            if kind not in KINDS:
                kind = "other"
            defects.append({**raw, "kind": kind})
        records.append(
            {
                "chapter": chapter,
                "pages": len(data.get("pages") or []),
                "assets": len(data.get("assets") or []),
                "defects": defects,
                "md": str(REVIEW / f"{chapter}.md"),
                "json": str(REVIEW / f"{chapter}.json"),
            }
        )

    records.sort(key=lambda item: item["chapter"])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "defects.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n"
    )

    total = Counter()
    lines = ["# 节点完整度审计缺陷汇总", ""]
    lines += ["| 章 | 页 | 资源 | high | medium | low | 合计 |", "|---|---:|---:|---:|---:|---:|---:|"]
    for record in records:
        sev = Counter(d.get("severity") for d in record["defects"])
        total.update(sev)
        lines.append(
            f"| {record['chapter']} | {record['pages']} | {record['assets']} | "
            f"{sev.get('high', 0)} | {sev.get('medium', 0)} | {sev.get('low', 0)} | {len(record['defects'])} |"
        )
    lines += [
        "",
        f"合计：high {total.get('high', 0)} / medium {total.get('medium', 0)} / low {total.get('low', 0)}",
        "",
    ]

    for record in records:
        if not record["defects"]:
            continue
        lines += [f"## {record['chapter']}", ""]
        ordered = sorted(
            record["defects"],
            key=lambda d: (SEV_ORDER.get(d.get("severity") or "low", 9), d.get("pdfPage") or 0),
        )
        for index, defect in enumerate(ordered, start=1):
            lines.append(
                f"### {record['chapter']}-D{index} · {defect.get('severity')} · {defect.get('kind')}"
            )
            lines.append("")
            lines.append(
                f"- 页：pdfPage {defect.get('pdfPage')}（印刷 {defect.get('printedPage')}）"
            )
            if defect.get("nodeId"):
                lines.append(f"- 节点：`{defect['nodeId']}`")
            if defect.get("assetId"):
                lines.append(f"- 资源：`{defect['assetId']}`")
            if defect.get("detail"):
                lines.append(f"- 问题：{defect['detail']}")
            if defect.get("excerpt"):
                lines.append(f"- 原文/应存在：{defect['excerpt']}")
            if defect.get("evidence"):
                lines.append(f"- 证据：{defect['evidence']}")
            lines.append("")
    (OUT / "defects.md").write_text("\n".join(lines))

    print(f"汇总 {len(records)} 章 / {sum(len(r['defects']) for r in records)} 条缺陷")
    print(f"high {total.get('high', 0)} / medium {total.get('medium', 0)} / low {total.get('low', 0)}")
    print(OUT / "defects.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
