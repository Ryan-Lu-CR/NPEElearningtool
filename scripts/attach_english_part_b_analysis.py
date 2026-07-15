#!/usr/bin/env python3
"""Attach complete original-PDF Part B analysis pages where old crops were removed."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import quote

import pdfplumber
from PIL import Image


# Full-page ranges deliberately include a little neighboring content so the
# beginning or ending of Part B can never be clipped by an unreliable OCR anchor.
PAGE_RANGES = {
    **{year: (46, 54) for year in range(2010, 2015)},
    **{year: (48, 58) for year in range(2015, 2020)},
    2021: (46, 54),
    2022: (2, 2),
    2023: (25, 30),
}


def render(pdf: pdfplumber.PDF, first: int, last: int, output: Path) -> None:
    pages: list[Image.Image] = []
    for page_number in range(first, min(last, len(pdf.pages)) + 1):
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("default_root", type=Path, default=Path("默认题库"), nargs="?")
    args = parser.parse_args()
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    bank = next(bank for bank in payload["banks"] if bank["id"] == "english-exams")
    chapters = {int(chapter["id"].rsplit("-", 1)[1]): chapter for chapter in bank["chapters"]}

    for year, (first, last) in PAGE_RANGES.items():
        filename = f"analysis-{year}-part-b-complete.webp"
        resource_dir = args.default_root / "英语一真题" / f"{year}年考研英语一真题" / "资源"
        source = args.analysis_dir / f"{year}年考研英语一真题解析.pdf"
        with pdfplumber.open(source) as pdf:
            render(pdf, first, last, resource_dir / filename)
        relative = f"英语一真题/{year}年考研英语一真题/资源/{filename}"
        url = f"/api/default-workspace/file?path={quote(relative, safe='')}"
        section = next(section for section in chapters[year]["sections"] if any(q.get("type") == "阅读理解 Part B" for q in section["questions"]))
        for question in section["questions"]:
            question["answerImageUrl"] = url
        print(f"{year}: pages {first}-{min(last, len(pdf.pages))}", flush=True)

    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
