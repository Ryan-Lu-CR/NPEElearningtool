#!/usr/bin/env python3
"""Crop per-question analysis images into each default English bank folder."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

import pdfplumber
from PIL import Image


LINE_NUMBER = re.compile(r"^\s*(?:[（(]\s*)?(\d{1,2})(?:\s*[）)])?\s*[\.．、]?\s+")


def page_lines(page) -> list[tuple[float, float, str]]:
    words = page.extract_words(x_tolerance=2, y_tolerance=3)
    grouped: dict[float, list[dict]] = defaultdict(list)
    for word in words:
        grouped[round(float(word["top"]), 1)].append(word)
    lines = []
    for top, items in grouped.items():
        items.sort(key=lambda item: item["x0"])
        lines.append((top, max(float(item["bottom"]) for item in items), " ".join(item["text"] for item in items)))
    return sorted(lines)


def find_anchors(pdf) -> dict[int, tuple[int, float]]:
    candidates: dict[int, list[tuple[int, float, str]]] = defaultdict(list)
    part_markers: list[tuple[int, float, str]] = []
    for page_index, page in enumerate(pdf.pages):
        for top, _bottom, text in page_lines(page):
            match = LINE_NUMBER.match(text)
            if match and 1 <= int(match.group(1)) <= 52:
                candidates[int(match.group(1))].append((page_index, top, text))
            compact = re.sub(r"\s+", "", text).lower()
            if "parta" in compact or "partb" in compact:
                part_markers.append((page_index, top, compact))

    anchors: dict[int, tuple[int, float]] = {}
    previous = (0, 0.0)
    for number in range(1, 51):
        max_jump = 8 if number >= 46 else 4
        after = [item for item in candidates[number] if (item[0], item[1]) > previous and item[0] <= previous[0] + max_jump]
        if after:
            chosen = min(after, key=lambda item: (item[0], item[1]))
            anchors[number] = (chosen[0], chosen[1])
            previous = anchors[number]

    # Writing sections usually use Part A / Part B instead of question numbers 51 / 52.
    final_third = max(0, len(pdf.pages) * 2 // 3)
    writing_parts = [item for item in part_markers if item[0] >= final_third]
    part_a = next((item for item in reversed(writing_parts) if "parta" in item[2]), None)
    part_b = next((item for item in reversed(writing_parts) if "partb" in item[2] and (not part_a or (item[0], item[1]) > (part_a[0], part_a[1]))), None)
    if part_a:
        anchors[51] = (part_a[0], part_a[1])
    if part_b:
        anchors[52] = (part_b[0], part_b[1])
    return anchors


def crop_between(pdf, start: tuple[int, float], end: tuple[int, float], resolution: int) -> Image.Image:
    scale = resolution / 72
    pieces = []
    for page_index in range(start[0], end[0] + 1):
        page = pdf.pages[page_index]
        top = start[1] - 10 if page_index == start[0] else 24
        bottom = end[1] - 12 if page_index == end[0] else page.height - 28
        if bottom <= top + 8:
            continue
        rendered = page.to_image(resolution=resolution, antialias=True).original.convert("RGB")
        box = (int(22 * scale), max(0, int(top * scale)), int((page.width - 22) * scale), min(rendered.height, int(bottom * scale)))
        piece = rendered.crop(box)
        if piece.height > 12:
            pieces.append(piece)
    if not pieces:
        raise ValueError(f"Empty crop between {start} and {end}")
    width = max(piece.width for piece in pieces)
    height = sum(piece.height for piece in pieces) + 8 * (len(pieces) - 1)
    canvas = Image.new("RGB", (width, height), "white")
    y = 0
    for piece in pieces:
        canvas.paste(piece, (0, y))
        y += piece.height + 8
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bank_json", type=Path)
    parser.add_argument("clean_dir", type=Path)
    parser.add_argument("local_dir", type=Path)
    parser.add_argument("default_root", type=Path)
    parser.add_argument("--resolution", type=int, default=132)
    args = parser.parse_args()

    payload = json.loads(args.bank_json.read_text(encoding="utf-8"))
    banks = {int(bank["id"].split("-")[1]): bank for bank in payload["banks"] if re.fullmatch(r"english-20(?:1\d|2[0-4])", bank["id"])}
    report = {}

    for year in range(2010, 2025):
        asset_dir = args.default_root / "英语一真题" / banks[year]["name"] / "资源"
        asset_dir.mkdir(parents=True, exist_ok=True)
        source = args.local_dir / f"{year}年考研英语一真题解析.pdf" if year in (2022, 2024) else args.clean_dir / f"{year}.pdf"
        with pdfplumber.open(source) as pdf:
            anchors = find_anchors(pdf)
            ordered = sorted(anchors.items(), key=lambda item: (item[1][0], item[1][1]))
            if not ordered:
                raise ValueError(f"{year}: no analysis anchors found")
            positions = {number: position for number, position in ordered}
            missing = []
            generated: dict[tuple[tuple[int, float], tuple[int, float]], str] = {}
            for number in range(1, 53):
                prior = [item for item in ordered if item[0] <= number]
                if number in positions:
                    start = positions[number]
                elif prior:
                    start = prior[-1][1]
                    missing.append(number)
                else:
                    start = ordered[0][1]
                    missing.append(number)
                following_positions = [position for _candidate_number, position in ordered if position > start]
                end = min(following_positions) if following_positions else (len(pdf.pages) - 1, pdf.pages[-1].height - 24)
                # Keep malformed OCR from creating unreadably tall shared crops.
                if end[0] - start[0] > 2:
                    end = (min(start[0] + 2, len(pdf.pages) - 1), pdf.pages[min(start[0] + 2, len(pdf.pages) - 1)].height - 24)
                key = (start, end)
                filename = generated.get(key)
                if not filename:
                    filename = f"analysis-{year}-{number:02d}.webp"
                    image = crop_between(pdf, start, end, args.resolution)
                    image.save(asset_dir / filename, "WEBP", quality=82, method=6)
                    generated[key] = filename
                question = next(q for c in banks[year]["chapters"] for s in c["sections"] for q in s["questions"] if q["number"] == number)
                relative = f'英语一真题/{banks[year]["name"]}/资源/{filename}'
                question["answerImageUrl"] = f"/api/default-workspace/file?path={quote(relative, safe='')}"
            report[year] = {"anchors": len(anchors), "fallbackQuestions": missing, "images": len(generated)}

    args.bank_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
