#!/usr/bin/env python3
"""导出语义审计用的边/节点清单（只读）。

    python3 scripts/export-semantic-audit.py

输出到 `local-textbook/sukey/audit/semantic/`：
  depends-on.json   277 条 depends-on 的两端标题/正文/边注
  supports.json     112 条 supports
  kinds.json        law/principle/phenomenon/model/experiment/exploration 节点
  multi-conclusion.json  正文含多句/多分句的 proposition（候选，不是判决）
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"
OUT = SUK / "audit" / "semantic"


def node_brief(node: dict) -> dict:
    return {
        "id": node["id"],
        "type": node["type"],
        "kind": node.get("kind"),
        "title": node.get("title"),
        "content": node.get("content") or "",
        "page": (node.get("citation") or {}).get("page"),
    }


def main() -> int:
    graph = json.loads((SUK / "merged" / "4vol.json").read_text())
    nodes = {node["id"]: node for node in graph["nodes"]}
    OUT.mkdir(parents=True, exist_ok=True)

    def edges(predicate: str):
        rows = []
        for edge in graph["edges"]:
            if edge["predicate"] != predicate:
                continue
            rows.append(
                {
                    "edgeId": edge.get("id"),
                    "from": node_brief(nodes[edge["from"]]),
                    "predicate": predicate,
                    "to": node_brief(nodes[edge["to"]]),
                    "note": edge.get("note") or "",
                }
            )
        return rows

    (OUT / "depends-on.json").write_text(
        json.dumps(edges("depends-on"), ensure_ascii=False, indent=2) + "\n"
    )
    (OUT / "supports.json").write_text(
        json.dumps(edges("supports"), ensure_ascii=False, indent=2) + "\n"
    )

    kinds = []
    for node in graph["nodes"]:
        if node["type"] == "proposition" and node.get("kind") in ("law", "principle"):
            kinds.append(node_brief(node))
        elif node["type"] == "note" and node.get("kind") in ("experiment", "phenomenon", "model"):
            kinds.append(node_brief(node))
        elif node["type"] == "problem" and node.get("kind") == "exploration":
            kinds.append(node_brief(node))
    (OUT / "kinds.json").write_text(json.dumps(kinds, ensure_ascii=False, indent=2) + "\n")

    multi = []
    for node in graph["nodes"]:
        if node["type"] != "proposition":
            continue
        content = node.get("content") or ""
        sentences = [s for s in re.split(r"[。！？；]", content) if s.strip()]
        if len(sentences) >= 2 or "；" in content:
            multi.append({**node_brief(node), "sentences": len(sentences)})
    (OUT / "multi-conclusion.json").write_text(
        json.dumps(multi, ensure_ascii=False, indent=2) + "\n"
    )

    print(f"depends-on {len(edges('depends-on'))} · supports {len(edges('supports'))} · kinds {len(kinds)} · multi {len(multi)}")
    print(OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
