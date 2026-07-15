#!/usr/bin/env python3
"""Attach complete original-PDF analysis images to the 2004-2009 English papers."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import quote

import pdfplumber
from PIL import Image


PAGE_GROUPS = {
    2004: {
        "cloze": (1, 14), "text-1": (15, 26), "text-2": (27, 37),
        "text-3": (38, 47), "text-4": (48, 57), "part-c": (58, 67),
        "writing": (68, 76),
    },
    **{
        year: {
            "cloze": (1, 6), "text-1": (7, 15), "text-2": (16, 25),
            "text-3": (26, 35), "text-4": (36, 45), "part-b": (46, 53),
            "part-c": (54, 59), "writing": (60, 64),
        }
        for year in range(2005, 2010)
    },
}


def render_composite(pdf: pdfplumber.PDF, first: int, last: int, output: Path) -> None:
    if output.exists():
        return
    pages: list[Image.Image] = []
    for page_number in range(first, last + 1):
        image = pdf.pages[page_number - 1].to_image(resolution=100, antialias=True).original.convert("RGB")
        image.thumbnail((720, 1400), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (720, image.height + 14), "white")
        canvas.paste(image, ((720 - image.width) // 2, 7))
        pages.append(canvas)
    result = Image.new("RGB", (720, sum(page.height for page in pages)), "white")
    top = 0
    for page in pages:
        result.paste(page, (0, top))
        top += page.height
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output, "WEBP", quality=84, method=6)


def group_for(section: dict) -> str:
    section_id = section["id"]
    if section_id.endswith("01-1"):
        return "cloze"
    if "text-" in section_id:
        return "text-" + section_id.rsplit("-", 1)[-1]
    if any(question.get("type") == "阅读理解 Part B" for question in section["questions"]):
        return "part-b"
    if any(question.get("type") == "英译汉" for question in section["questions"]):
        return "part-c"
    return "writing"


def asset_url(year: int, filename: str) -> str:
    folder = f"{year}年考研英语真题"
    relative = f"英语一真题/{folder}/资源/{filename}"
    return f"/api/default-workspace/file?path={quote(relative, safe='')}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("default_root", type=Path, default=Path("默认题库"), nargs="?")
    args = parser.parse_args()

    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    bank = next(bank for bank in payload["banks"] if bank["id"] == "english-exams")
    chapters = {int(chapter["id"].rsplit("-", 1)[1]): chapter for chapter in bank["chapters"]}

    for year, groups in PAGE_GROUPS.items():
        resource_dir = args.default_root / "英语一真题" / f"{year}年考研英语真题" / "资源"
        source = args.analysis_dir / f"{year}年考研英语真题解析.pdf"
        with pdfplumber.open(source) as pdf:
            for name, (first, last) in groups.items():
                render_composite(pdf, first, last, resource_dir / f"analysis-{year}-{name}.webp")
        for section in chapters[year]["sections"]:
            group = group_for(section)
            url = asset_url(year, f"analysis-{year}-{group}.webp")
            for question in section["questions"]:
                question["answerImageUrl"] = url
        print(f"{year}: {len(groups)} complete section images", flush=True)

    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
