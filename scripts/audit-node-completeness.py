#!/usr/bin/env python3
"""节点完整度审计的准备脚本：把一章拆成「页图 + 文字对照 + 图片对照」。

    python3 scripts/audit-node-completeness.py --chapter phy-b8a-c01
    python3 scripts/audit-node-completeness.py --all

输出到 `local-textbook/sukey/audit/node-completeness/<chapter>/`：

  README.md          本章范围、输入、检查口径
  fact.md            页数 / 节点数 / 资源数 / 每页资源清单
  text-diff.md       页面文字 vs 节点文字：缺失字符、未命中的 10 字窗口
  nodes.md           每页节点全文 + 该页资源 caption/alt
  sheets/pXXXX.png   页图 + 该页所有资源裁图的对照图
  assets/*.png       每个资源按 region 裁出来的原图
  pages/*.png        页图（带资源 region 红框和编号）

只读。不改 parts / expected / assets / merged。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SUK = ROOT / "local-textbook" / "sukey"
OUT_ROOT = SUK / "audit" / "node-completeness"

VOLUME_INFO = {
    "b8a": {"pdf": "sukey-八上.pdf", "ocr": None, "label": "八年级上册"},
    "b8b": {"pdf": "sukey-八下.pdf", "ocr": "八下", "label": "八年级下册"},
    "b9a": {"pdf": "sukey-九上.pdf", "ocr": None, "label": "九年级上册"},
    "b9b": {"pdf": "sukey-九下.pdf", "ocr": "九下", "label": "九年级下册"},
}

PAGE_OFFSET = 7

# 只保留汉字、字母、数字做字符级对照；标点/LaTeX/空白差异太吵。
CHAR_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]")
WINDOW = 10
WINDOW_STEP = 5


def vol_of(chapter: str) -> str:
    return chapter.split("-")[1]


def load_json(path: Path):
    return json.loads(path.read_text())


def chapter_parts(chapter: str) -> list[Path]:
    paths = []
    for path in sorted((SUK / "expected").glob("*.json")):
        if ".report." in path.name:
            continue
        data = load_json(path)
        if data.get("chapter") == chapter:
            paths.append(SUK / "parts" / path.name)
    return paths


def normalize(text: str) -> str:
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"`[^`]*`", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\\[A-Za-z]+", "", text)
    text = text.replace("{", "").replace("}", "").replace("$", "")
    return "".join(ch for ch in text if CHAR_RE.match(ch))


def page_text(volume: str, pdf_page: int) -> tuple[str, str]:
    info = VOLUME_INFO[volume]
    if info["ocr"]:
        path = SUK / "ocr" / info["ocr"] / f"{pdf_page:03d}.txt"
        if path.exists():
            return path.read_text(errors="ignore"), "ocr"
        return "", "ocr-missing"
    try:
        out = subprocess.run(
            ["pdftotext", "-f", str(pdf_page), "-l", str(pdf_page), "-layout", str(SUK / "raw" / info["pdf"]), "-"],
            check=False,
            capture_output=True,
            text=True,
        ).stdout
    except FileNotFoundError:
        return "", "pdftotext-missing"
    return out, "pdftotext"


def node_text(node: dict) -> str:
    parts = [node.get("title") or "", node.get("content") or "", node.get("solution") or ""]
    return "\n".join(part for part in parts if part)


def asset_text(asset: dict) -> str:
    return "\n".join(part for part in [asset.get("caption") or "", asset.get("alt") or ""] if part)


def font(size: int):
    for candidate in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_box(draw: ImageDraw.ImageDraw, box, label: str, fnt):
    x0, y0, x1, y1 = box
    draw.rectangle([x0, y0, x1, y1], outline=(220, 30, 30), width=5)
    tw = draw.textbbox((0, 0), label, font=fnt)[2]
    draw.rectangle([x0, max(0, y0 - 30), x0 + tw + 12, y0], fill=(220, 30, 30))
    draw.text((x0 + 6, max(0, y0 - 27)), label, fill=(255, 255, 255), font=fnt)


def region_box(region: dict, width: int, height: int):
    x0 = round(region["x"] * width)
    y0 = round(region["y"] * height)
    x1 = round((region["x"] + region["width"]) * width)
    y1 = round((region["y"] + region["height"]) * height)
    return (x0, y0, x1, y1)


def build_sheet(
    chapter: str,
    pdf_page: int,
    printed_page: int,
    page_img: Image.Image,
    assets: list[dict],
    out_dir: Path,
    label_font,
) -> None:
    page = page_img.convert("RGB").copy()
    W, H = page.size
    draw = ImageDraw.Draw(page)
    crops: list[tuple[int, dict, Image.Image]] = []
    for index, asset in enumerate(assets, start=1):
        box = region_box(asset["region"], W, H)
        draw_box(draw, box, f"{index}", label_font)
        crop = page_img.crop(box).convert("RGB")
        crop_path = out_dir / "assets" / f"{asset['id']}.png"
        crop.save(crop_path)
        crops.append((index, asset, crop))

    page.thumbnail((900, 1500), Image.LANCZOS)
    page_path = out_dir / "pages" / f"p{pdf_page:04d}.png"
    page.save(page_path)

    margin = 16
    right_w = 820
    rows = []
    total_right = 0
    for index, asset, crop in crops:
        thumb = crop.copy()
        thumb.thumbnail((right_w - 20, 620), Image.LANCZOS)
        if thumb.width < 360:
            scale = 360 / thumb.width
            thumb = thumb.resize((360, max(1, int(thumb.height * scale))), Image.LANCZOS)
        label = f"#{index} {asset['id']}  {asset.get('caption') or ''}"
        rows.append((label, thumb, asset))
        total_right += thumb.height + 52

    sheet_w = margin + page.width + margin + right_w + margin
    sheet_h = max(page.height, total_right) + 70
    sheet = Image.new("RGB", (sheet_w, sheet_h), (238, 241, 245))
    sdraw = ImageDraw.Draw(sheet)
    title_font = font(22)
    body_font = font(16)
    sdraw.text(
        (margin, 18),
        f"{chapter}  pdfPage {pdf_page}  印刷 {printed_page}  资源 {len(assets)} 张",
        fill=(17, 24, 39),
        font=title_font,
    )
    sheet.paste(page, (margin, 60))
    y = 60
    for label, thumb, asset in rows:
        sdraw.text((margin + page.width + margin, y), label, fill=(17, 24, 39), font=body_font)
        y += 30
        sheet.paste(thumb, (margin + page.width + margin, y))
        y += thumb.height + 22
    sheet.save(out_dir / "sheets" / f"p{pdf_page:04d}.png", optimize=True)


def char_deficits(page: str, nodes: str) -> list[tuple[str, int, int]]:
    have = Counter(nodes)
    deficits = []
    for ch, need in Counter(page).items():
        got = have.get(ch, 0)
        if got < need:
            deficits.append((ch, need, got))
    return sorted(deficits, key=lambda item: -(item[1] - item[2]))[:25]


def missing_segments(page: str, nodes: str) -> list[str]:
    """按句号/问号/分号切段，找整段都不在节点文字里的句子。"""
    found = []
    for part in re.split(r"[。！？；]", page):
        norm = normalize(part)
        if len(norm) < 8:
            continue
        if norm in nodes:
            continue
        found.append(norm[:90])
        if len(found) >= 20:
            break
    return found


def missing_windows(page: str, nodes: str) -> list[str]:
    if not page:
        return []
    found = []
    seen = set()
    for start in range(0, max(1, len(page) - WINDOW + 1), WINDOW_STEP):
        window = page[start : start + WINDOW]
        if len(window) < WINDOW:
            break
        if window in nodes or window in seen:
            continue
        seen.add(window)
        found.append(f"@{start} {window}")
        if len(found) >= 30:
            break
    return found


def prepare(chapter: str) -> Path:
    parts = chapter_parts(chapter)
    if not parts:
        raise SystemExit(f"找不到 {chapter} 的 expected/part")
    volume = vol_of(chapter)
    info = VOLUME_INFO[volume]

    nodes: list[dict] = []
    assets: list[dict] = []
    ranges = []
    for part_path in parts:
        part = load_json(part_path)
        nodes.extend(part.get("nodes", []))
        assets.extend(part.get("assets", []))
        ranges.append(tuple(part["meta"]["pdfPageRange"]))
    pdf_lo = min(r[0] for r in ranges)
    pdf_hi = max(r[1] for r in ranges)

    out = OUT_ROOT / chapter
    for sub in ("pages", "sheets", "assets"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    assets_by_page: dict[int, list[dict]] = defaultdict(list)
    for asset in assets:
        assets_by_page[int(asset["pdfPage"])].append(asset)
    for page_assets in assets_by_page.values():
        page_assets.sort(key=lambda a: (a["region"]["y"], a["region"]["x"]))

    nodes_by_page: dict[int, list[dict]] = defaultdict(list)
    for node in nodes:
        page = (node.get("citation") or {}).get("page")
        if isinstance(page, str) and page.isdigit():
            nodes_by_page[int(page)].append(node)
        for tag in node.get("tags") or []:
            match = re.match(rf"src:phy-{volume}-p(\d+)-", tag)
            if match:
                nodes_by_page[int(match.group(1))].append(node)

    label_font = font(22)
    text_lines = [
        f"# 文字对照：{chapter}",
        "",
        "> 自动结果，只做候选。`OCR` 源有识别错误；最终由审计代理回页图确认。",
        "",
    ]
    node_lines = [
        f"# 节点与资源全文：{chapter}",
        "",
        f"范围：pdfPage {pdf_lo}–{pdf_hi}（印刷 {pdf_lo - PAGE_OFFSET}–{pdf_hi - PAGE_OFFSET}）",
        "",
    ]

    for pdf_page in range(pdf_lo, pdf_hi + 1):
        printed = pdf_page - PAGE_OFFSET
        page_dir = SUK / "pages" / volume / f"p{pdf_page:04d}.png"
        if not page_dir.exists():
            raise SystemExit(f"缺页图 {page_dir}")
        page_img = Image.open(page_dir)

        page_nodes = []
        seen_ids = set()
        for node in nodes_by_page.get(printed, []):
            if node["id"] in seen_ids:
                continue
            seen_ids.add(node["id"])
            page_nodes.append(node)
        page_assets = assets_by_page.get(pdf_page, [])

        page_raw, source = page_text(volume, pdf_page)
        page_norm = normalize(page_raw)
        node_norm = normalize("\n".join([node_text(n) for n in page_nodes] + [asset_text(a) for a in page_assets]))

        deficits = char_deficits(page_norm, node_norm)
        segments = missing_segments(page_raw, node_norm)
        windows = missing_windows(page_norm, node_norm)

        text_lines += [
            f"## pdfPage {pdf_page}（印刷 {printed}）· {source}",
            "",
            f"- 页面字符 {len(page_norm)} / 节点字符 {len(node_norm)} / 资源 {len(page_assets)}",
        ]
        if deficits:
            text_lines.append(
                "- 字符缺口（页面次数 / 节点次数）："
                + "，".join(f"「{ch}」{need}/{got}" for ch, need, got in deficits)
            )
        else:
            text_lines.append("- 字符缺口：无")
        if segments:
            text_lines.append("- 整段未在节点文字中出现（前 20 句）：")
            text_lines.extend(f"  - `{item}`" for item in segments)
        else:
            text_lines.append("- 整段缺失：无")
        if windows:
            text_lines.append("- 未命中的 10 字窗口（前 30 个）：")
            text_lines.extend(f"  - `{item}`" for item in windows)
        else:
            text_lines.append("- 未命中的 10 字窗口：无")
        text_lines.append("")

        node_lines += [f"## pdfPage {pdf_page}（印刷 {printed}）", ""]
        if not page_nodes and not page_assets:
            node_lines += ["（本页没有节点/资源）", ""]
        for node in page_nodes:
            node_lines += [
                f"### [{node['type']}] `{node['id']}` {node.get('title') or ''}",
                "",
                node.get("content") or "",
            ]
            if node.get("solution"):
                node_lines += ["", "**解答：**", "", node["solution"]]
            node_lines.append("")
        for asset in page_assets:
            node_lines += [
                f"### [asset] `{asset['id']}`",
                "",
                f"- caption：{asset.get('caption') or '（无）'}",
                f"- alt：{asset.get('alt') or ''}",
                f"- nodeId：{asset.get('nodeId')} · region：{asset['region']}",
                "",
            ]

        build_sheet(chapter, pdf_page, printed, page_img, page_assets, out, label_font)

    (out / "text-diff.md").write_text("\n".join(text_lines))
    (out / "nodes.md").write_text("\n".join(node_lines))

    fact = [
        f"# {chapter}",
        "",
        f"- 册：{info['label']}（{volume}）",
        f"- pdfPage：{pdf_lo}–{pdf_hi}（{pdf_hi - pdf_lo + 1} 页）",
        f"- 印刷页：{pdf_lo - PAGE_OFFSET}–{pdf_hi - PAGE_OFFSET}",
        f"- 节点：{len(nodes)}",
        f"- 资源：{len(assets)}",
        "",
        "## 每页资源",
        "",
    ]
    for pdf_page in range(pdf_lo, pdf_hi + 1):
        page_assets = assets_by_page.get(pdf_page, [])
        fact.append(f"- pdfPage {pdf_page}（印刷 {pdf_page - PAGE_OFFSET}）：{len(page_assets)} 张")
    (out / "fact.md").write_text("\n".join(fact) + "\n")

    readme = f"""# 节点完整度审计：{chapter}

范围：`{volume}` pdfPage {pdf_lo}–{pdf_hi}（印刷 {pdf_lo - PAGE_OFFSET}–{pdf_hi - PAGE_OFFSET}），共 {pdf_hi - pdf_lo + 1} 页。
本目录由 `scripts/audit-node-completeness.py` 生成，**只覆盖节点/内容/图片，不检查关系边**。

## 文件

- `pages/pXXXX.png`：页图 + 该页资源 region 红框（编号对应 `sheets` 里的 `#N`）
- `sheets/pXXXX.png`：左边页图，右边该页所有资源裁图（原图/放大），逐张核对
- `assets/*.png`：按 region 裁出来的资源原图
- `text-diff.md`：页面文字 vs 节点文字的自动对照（缺字、未命中的 10 字窗口）
- `nodes.md`：该页节点全文 + 资源 caption/alt
- `fact.md`：页数、节点数、资源数、每页资源清单

## 检查口径

1. **文字完整**：页面上每一段正文、表格单元格、公式、图注原文，都能在 `nodes.md` 里找到；逐字核对，不能缺句、截断、错字。
2. **图片完整**：页面上每一张内容性插图（照片、示意、图表、导图、卡通）都有一条 asset；`sheets` 里每张裁图必须内容正确、四边完整、不是别处的图。
3. **图内文字**：图内标注/数值/子图编号不要求独立节点，但应在 `alt` 或 caption 里能读到关键标签。
4. **不检查**：关系边、谓词、节点类型/kind 的语义判断（除非它导致内容缺失）。
5. 页面上的装饰性背景、页眉页脚、页码、栏目图标不算内容性图片；但正文/图注/表格里的字都算。

## 输出

写到 `review/node-completeness/{chapter}.json` + `.md`，每页一条记录；缺页 = 没审。
"""
    (out / "README.md").write_text(readme)
    print(f"{chapter}: {pdf_lo}-{pdf_hi} · {len(nodes)} 节点 · {len(assets)} 资源 -> {out}")
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chapter")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    chapters = []
    if args.all:
        for path in sorted((SUK / "expected").glob("*.json")):
            if ".report." in path.name:
                continue
            chapter = load_json(path).get("chapter")
            if chapter and chapter not in chapters:
                chapters.append(chapter)
    elif args.chapter:
        chapters = [args.chapter]
    else:
        parser.error("需要 --chapter 或 --all")
    for chapter in chapters:
        prepare(chapter)
    return 0


if __name__ == "__main__":
    sys.exit(main())
