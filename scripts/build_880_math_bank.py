#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OCR_PAGES = Path("/private/tmp/880-math-answer-pages")
SOURCE_PDF = ROOT / "TEMP" / "【A4紧凑版】李林880数二高数篇做题本（修改）.pdf"
WORKSPACE = ROOT / "默认题库"
BANK_NAME = "880高数"
BANK_ID = "default-880-calculus"

CHAPTERS = {
    1: "函数、极限、连续",
    2: "一元函数微分学及其应用",
    3: "一元函数积分学及其应用",
    4: "多元函数微分学及其应用",
    5: "二重积分",
    6: "微分方程及其应用",
}
DIFFICULTIES = {1: "基础", 2: "综合", 3: "拓展"}

SECTIONS = {
    (1, 1): (3, 8, (13, 6, 5)),
    (1, 2): (9, 24, (19, 13, 17)),
    (1, 3): (25, 28, (0, 0, 4)),
    (2, 1): (29, 48, (24, 27, 27)),
    (2, 2): (49, 69, (30, 12, 22)),
    (2, 3): (70, 72, (0, 0, 3)),
    (3, 1): (73, 94, (18, 23, 21)),
    (3, 2): (95, 128, (22, 22, 55)),
    (3, 3): (129, 133, (0, 0, 6)),
    (4, 1): (134, 143, (9, 17, 12)),
    (4, 2): (144, 157, (8, 4, 23)),
    (4, 3): (158, 159, (1, 0, 1)),
    (5, 1): (160, 171, (6, 14, 15)),
    (5, 2): (172, 187, (7, 6, 25)),
    (5, 3): (188, 192, (0, 0, 5)),
    (6, 1): (193, 200, (7, 9, 11)),
    (6, 2): (201, 218, (7, 10, 29)),
    (6, 3): (219, 220, (0, 0, 3)),
}

SECTION_SPANS = {
    (1, 1): ((3, .229), (9, .749)), (1, 2): ((9, .749), (25, .683)), (1, 3): ((25, .683), (29, .193)),
    (2, 1): ((29, .193), (49, .749)), (2, 2): ((49, .749), (70, .512)), (2, 3): ((70, .512), (73, .191)),
    (3, 1): ((73, .191), (95, .392)), (3, 2): ((95, .392), (129, .203)), (3, 3): ((129, .203), (134, .188)),
    (4, 1): ((134, .188), (144, .091)), (4, 2): ((144, .091), (158, .376)), (4, 3): ((158, .376), (160, .188)),
    (5, 1): ((160, .188), (172, .458)), (5, 2): ((172, .458), (188, .453)), (5, 3): ((188, .453), (193, .194)),
    (6, 1): ((193, .194), (201, .098)), (6, 2): ((201, .098), (219, .407)), (6, 3): ((219, .407), (221, 0)),
}

# OCR occasionally reads a green question number as another digit, or merges it
# with the green type heading. These few starts were visually checked at full size.
MANUAL_ANSWER_STARTS = {
    (1, 1, 13): (5, .7573),
    (1, 3, 1): (25, .7448),
    (2, 1, 25): (35, .1250),
    (2, 1, 57): (42, .7531),
    (2, 2, 1): (49, .7323),
    (3, 2, 45): (109, .1953),
    (4, 2, 13): (147, .3516),
    (4, 3, 1): (158, .4347),
    (4, 3, 2): (159, .1663),
    (5, 1, 7): (161, .2743),
    (6, 2, 46): (218, .3766),
}

# Boundaries before a new answer type; cutting here prevents headings such as
# “二、填空题” from leaking into the preceding answer image.
TYPE_HEADINGS = {
    (1, 1): {14: (6, .363), 20: (7, .357)}, (1, 2): {20: (15, .095), 33: (18, .526)},
    (2, 1): {25: (35, .095), 52: (41, .405)}, (2, 2): {31: (59, .336), 43: (62, .226)},
    (3, 1): {19: (78, .429), 42: (83, .779)}, (3, 2): {23: (102, .761), 45: (109, .168)},
    (4, 1): {10: (136, .201), 27: (139, .578)}, (4, 2): {9: (146, .277), 13: (147, .334)},
    (4, 3): {2: (159, .146)},
    (5, 1): {7: (161, .246), 21: (165, .379)}, (5, 2): {8: (174, .520), 14: (176, .087)},
    (6, 1): {8: (194, .343), 17: (196, .546)}, (6, 2): {8: (202, .596), 18: (205, .521)},
}

MANUAL_QUESTION_STARTS = [
    (3, 2, 2, 20, 49, 336.5),
    (4, 2, 3, 20, 67, 415.5),
    (4, 3, 1, 1, 68, 224.6),
    (4, 3, 3, 1, 68, 451.4),
    (5, 1, 2, 13, 71, 368.7),
    (5, 2, 3, 9, 76, 251.1),
    (5, 2, 3, 11, 76, 399.7),
]

NUMBER = re.compile(r"^[（(]\s*(\d{1,2})\s*[）)]")


def top_of(item: dict) -> float:
    return 1 - item["y"] - item["height"]


def green_score(page: Image.Image, item: dict) -> tuple[int, float]:
    width, height = page.size
    left = max(0, int(item["x"] * width) - 3)
    top = max(0, int(top_of(item) * height) - 3)
    right = min(width, int((item["x"] + item["width"]) * width) + 3)
    bottom = min(height, int((top_of(item) + item["height"]) * height) + 3)
    array = np.asarray(page.crop((left, top, right, bottom)).convert("RGB")).astype(np.int16)
    red, green, blue = array[:, :, 0], array[:, :, 1], array[:, :, 2]
    green_mask = (green > red + 8) & (green > blue + 3) & (green > 60)
    ink = array.mean(axis=2) < 235
    count = int(green_mask.sum())
    return count, count / max(1, int(ink.sum()))


def green_groups(page_number: int) -> list[tuple[float, int]]:
    with Image.open(OCR_PAGES / f"page-{page_number:03d}.png") as page:
        array = np.asarray(page.convert("RGB")).astype(np.int16)
    height, width = array.shape[:2]
    band = array[:, int(width * .095):int(width * .22)]
    red, green, blue = band[:, :, 0], band[:, :, 1], band[:, :, 2]
    mask = (green > red + 8) & (green > blue + 3) & (green > 60)
    active = np.where(mask.sum(axis=1) >= 4)[0]
    groups: list[tuple[float, int]] = []
    if not len(active):
        return groups
    start = previous = int(active[0])
    for row in active[1:]:
        row = int(row)
        if row - previous > 3:
            pixels = int(mask[start:previous + 1].sum())
            if previous - start >= 8 and pixels >= 35:
                groups.append((round(start / height, 4), pixels))
            start = row
        previous = row
    pixels = int(mask[start:previous + 1].sum())
    if previous - start >= 8 and pixels >= 35:
        groups.append((round(start / height, 4), pixels))
    return groups


def candidates(first: int, last: int) -> list[dict]:
    found = []
    for number in range(first, last + 1):
        data = json.loads((OCR_PAGES / f"page-{number:03d}.json").read_text(encoding="utf-8"))
        with Image.open(OCR_PAGES / f"page-{number:03d}.png") as page:
            for item in data:
                match = NUMBER.match(item["text"].strip())
                if not match or item["x"] > 0.22:
                    continue
                pixels, ratio = green_score(page, item)
                if pixels > 35 and ratio > 0.075:
                    found.append({
                        "number": int(match.group(1)),
                        "page": number,
                        "top": round(top_of(item), 4),
                        "x": round(item["x"], 4),
                        "green": pixels,
                        "ratio": round(ratio, 3),
                        "text": item["text"],
                    })
    return sorted(found, key=lambda value: (value["page"], value["top"]))


def section_candidates(key: tuple[int, int]) -> list[dict]:
    start, end = SECTION_SPANS[key]
    return [
        item for item in candidates(start[0], min(220, end[0]))
        if (item["page"], item["top"]) >= start and (item["page"], item["top"]) < end
    ]


def potential_starts(key: tuple[int, int]) -> list[dict]:
    start, end = SECTION_SPANS[key]
    labels = section_candidates(key)
    result = []
    for page in range(start[0], min(220, end[0]) + 1):
        groups = green_groups(page)
        previous_top = -1.0
        for top, pixels in groups:
            point = (page, top)
            if point < start or point >= end or not 70 <= pixels <= 750:
                previous_top = top
                continue
            label = min(
                (item for item in labels if item["page"] == page),
                key=lambda item: abs(item["top"] - top),
                default=None,
            )
            if label is not None and abs(label["top"] - top) > .012:
                label = None
            result.append({
                "page": page,
                "top": top,
                "pixels": pixels,
                "number": label["number"] if label else None,
                "secondary": previous_top >= 0 and top - previous_top < .032,
            })
            previous_top = top
    return result


def answer_starts(key: tuple[int, int]) -> list[tuple[int, float]]:
    counts = SECTIONS[key][2]
    expected = [number for count in counts for number in range(1, count + 1)]
    aligned = align_potentials(expected, potential_starts(key))
    starts: list[tuple[int, float]] = []
    for ordinal, (_, item) in enumerate(aligned, 1):
        manual = MANUAL_ANSWER_STARTS.get((*key, ordinal))
        if manual:
            starts.append(manual)
        elif item:
            starts.append((item["page"], item["top"]))
        else:
            raise RuntimeError(f"答案起点缺失：{key} 第{ordinal}题")
    if starts != sorted(starts) or len(starts) != sum(counts):
        raise RuntimeError(f"答案起点顺序异常：{key}")
    return starts


def align_potentials(expected: list[int], found: list[dict]) -> list[tuple[int, dict | None]]:
    rows, cols = len(expected) + 1, len(found) + 1
    infinity = 10 ** 9
    cost = [[infinity] * cols for _ in range(rows)]
    step = [[""] * cols for _ in range(rows)]
    cost[0][0] = 0
    for row in range(rows):
        for col in range(cols):
            current = cost[row][col]
            if col < len(found) and current < cost[row][col + 1]:
                cost[row][col + 1], step[row][col + 1] = current, "noise"
            if row < len(expected) and current + 9 < cost[row + 1][col]:
                cost[row + 1][col], step[row + 1][col] = current + 9, "missing"
            if row < len(expected) and col < len(found):
                item = found[col]
                if item["number"] is None or item["number"] == expected[row]:
                    add = 0 if item["number"] is not None else (5 if item["secondary"] else 2)
                    if current + add < cost[row + 1][col + 1]:
                        cost[row + 1][col + 1], step[row + 1][col + 1] = current + add, "match"
    result: list[tuple[int, dict | None]] = []
    row, col = len(expected), len(found)
    while row or col:
        action = step[row][col]
        if action == "match":
            result.append((expected[row - 1], found[col - 1]))
            row -= 1
            col -= 1
        elif action == "missing":
            result.append((expected[row - 1], None))
            row -= 1
        else:
            col -= 1
    result.reverse()
    return result


def diagnose_potentials() -> None:
    for key, (_, _, counts) in SECTIONS.items():
        expected = [number for count in counts for number in range(1, count + 1)]
        found = potential_starts(key)
        aligned = align_potentials(expected, found)
        selected = [item for _, item in aligned if item]
        print(json.dumps({
            "section": key,
            "expected": len(expected),
            "potentials": len(found),
            "selected": len(selected),
            "unlabeled": [dict(item, expected=number, ordinal=index + 1) for index, (number, item) in enumerate(aligned) if item and item["number"] is None],
            "missing": [{"expected": number, "ordinal": index + 1} for index, (number, item) in enumerate(aligned) if item is None],
        }, ensure_ascii=False))


def question_events() -> dict[tuple[int, int], list[dict]]:
    chapter_markers = {"第一章": 1, "第二章": 2, "第三章": 3, "第四章": 4, "第五章": 5, "第六章": 6}
    difficulty_markers = {"基础题": 1, "综合题": 2, "拓展题": 3}
    type_markers = {"一、选择题": 1, "二、填空题": 2, "三、解答题": 3, "选择题": 1, "填空题": 2, "解答题": 3}
    start_pattern = re.compile(r"^[（(](\d{1,3})[）)]")
    all_events: list[dict] = []
    questions: list[dict] = []
    chapter = difficulty = question_type = None
    with pdfplumber.open(SOURCE_PDF) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            if page_number == 1:
                continue
            for line in sorted(page.extract_text_lines(), key=lambda item: (item["top"], item["x0"])):
                text = line["text"].strip().replace(" ", "")
                if line["top"] < 20 or line["top"] > page.height - 25:
                    continue
                marker = next((value for label, value in chapter_markers.items() if label in text), None)
                if marker and text.startswith("第"):
                    chapter = marker
                    all_events.append({"kind": "heading", "page": page_number, "top": line["top"]})
                    continue
                if text in difficulty_markers:
                    difficulty = difficulty_markers[text]
                    question_type = None
                    all_events.append({"kind": "heading", "page": page_number, "top": line["top"]})
                    continue
                if text in type_markers:
                    question_type = type_markers[text]
                    all_events.append({"kind": "heading", "page": page_number, "top": line["top"]})
                    continue
                match = start_pattern.match(text)
                if match and chapter and difficulty and question_type:
                    item = {
                        "kind": "question", "page": page_number, "top": line["top"],
                        "chapter": chapter, "difficulty": difficulty, "type": question_type,
                        "sourceNumber": int(match.group(1)),
                    }
                    questions.append(item)
                    all_events.append(item)

    for chapter, difficulty, question_type, source_number, page, top in MANUAL_QUESTION_STARTS:
        if not any(item["page"] == page and abs(item["top"] - top) < 1 for item in questions):
            item = {
                "kind": "question", "page": page, "top": top, "chapter": chapter,
                "difficulty": difficulty, "type": question_type, "sourceNumber": source_number,
            }
            questions.append(item)
            all_events.append(item)

    all_events.sort(key=lambda item: (item["page"], item["top"], 0 if item["kind"] == "heading" else 1))
    for question in questions:
        point = (question["page"], question["top"])
        following = next((item for item in all_events if (item["page"], item["top"]) > point), None)
        question["end"] = (following["page"], following["top"]) if following else (89, 775.0)

    grouped: dict[tuple[int, int], list[dict]] = {}
    for question in sorted(questions, key=lambda item: (item["page"], item["top"])):
        grouped.setdefault((question["chapter"], question["difficulty"]), []).append(question)
    for key, (_, _, counts) in SECTIONS.items():
        actual = grouped.get(key, [])
        if len(actual) != sum(counts):
            raise RuntimeError(f"题目数量异常：{key} {len(actual)} != {sum(counts)}")
        actual_types = tuple(sum(item["type"] == kind for item in actual) for kind in (1, 2, 3))
        if actual_types != counts:
            raise RuntimeError(f"题型数量异常：{key} {actual_types} != {counts}")
    return grouped


def trim_ink(
    image: Image.Image, threshold: int = 245, *, prune_sparse_edges: bool = True
) -> Image.Image | None:
    array = np.asarray(image.convert("RGB"))
    dark = array.mean(axis=2) < threshold
    rows = np.where(dark.sum(axis=1) >= 4)[0]
    cols = np.where(dark.sum(axis=0) >= 4)[0]
    if not len(rows) or not len(cols):
        return None
    row_groups: list[tuple[int, int]] = []
    group_start = previous = int(rows[0])
    for row in rows[1:]:
        row = int(row)
        if row - previous > 3:
            row_groups.append((group_start, previous))
            group_start = row
        previous = row
    row_groups.append((group_start, previous))
    if prune_sparse_edges:
        while len(row_groups) > 1:
            first = row_groups[0]
            ink = int(dark[first[0]:first[1] + 1].sum())
            if first[1] - first[0] <= 9 and ink < 500 and row_groups[1][0] - first[1] >= 5:
                row_groups.pop(0)
            else:
                break
        while len(row_groups) > 1:
            last = row_groups[-1]
            ink = int(dark[last[0]:last[1] + 1].sum())
            if last[1] - last[0] <= 9 and ink < 500 and last[0] - row_groups[-2][1] >= 5:
                row_groups.pop()
            else:
                break
    rows = np.arange(row_groups[0][0], row_groups[-1][1] + 1)
    top, bottom = max(0, int(rows[0]) - 10), min(image.height, int(rows[-1]) + 11)
    left, right = max(0, int(cols[0]) - 10), min(image.width, int(cols[-1]) + 11)
    if bottom - top < 18 or right - left < 40:
        return None
    return image.crop((left, top, right, bottom))


def crop_question(document: pdfium.PdfDocument, start: tuple[int, float], end: tuple[int, float]) -> list[Image.Image]:
    parts = []
    scale = 2.25
    for page_number in range(start[0], end[0] + 1):
        page = document[page_number - 1]
        rendered = page.render(scale=scale).to_pil().convert("RGB")
        top = start[1] + 1 if page_number == start[0] else 22
        bottom = end[1] - 12 if page_number == end[0] else 775
        if bottom - top < 8:
            continue
        crop = rendered.crop((0, int(max(0, top) * scale), rendered.width, int(min(822, bottom) * scale)))
        trimmed = trim_ink(crop, 248)
        if trimmed is not None:
            parts.append(trimmed)
    return parts


def crop_answer(start: tuple[int, float], end: tuple[int, float]) -> list[Image.Image]:
    parts = []
    last_page = end[0] - 1 if end[1] <= 0 else end[0]
    for page_number in range(start[0], last_page + 1):
        with Image.open(OCR_PAGES / f"page-{page_number:03d}.png") as source:
            page = source.convert("RGB")
        # Keep a small leading margin around the answer marker.  Continued
        # pages begin below the running header and dotted rule.  Prefer a
        # half-percent end gap to exclude tall symbols from the next answer,
        # but expand to its exact marker when that gap intersects current text.
        top = start[1] - .005 if page_number == start[0] else .090
        # Continuation pages can contain a final line below 92.5% of the page.
        # 95.5% preserves that line while remaining above the printed page number.
        if page_number == end[0]:
            bottom = end[1] - .005
        else:
            bottom = .955
        if bottom - top < .012:
            continue
        crop = page.crop((int(page.width * .075), int(page.height * max(0, top)), int(page.width * .94), int(page.height * min(1, bottom))))
        # Mathematical fractions and subscripts often form a short isolated
        # final row.  Never prune those rows as if they were footer noise.
        trimmed = trim_ink(crop, 205, prune_sparse_edges=False)
        if trimmed is not None and page_number == end[0] and bottom < end[1]:
            last_row = np.asarray(trimmed.convert("RGB"))[-1].mean(axis=1) < 170
            if int(last_row.sum()) >= 3:
                bottom = end[1]
                crop = page.crop((
                    int(page.width * .075), int(page.height * max(0, top)),
                    int(page.width * .94), int(page.height * min(1, bottom)),
                ))
                trimmed = trim_ink(crop, 205, prune_sparse_edges=False)
        if trimmed is not None:
            parts.append(trimmed)
    return parts


def save_parts(parts: list[Image.Image], folder: Path, stem: str) -> list[Path]:
    if not parts:
        raise RuntimeError(f"裁剪结果为空：{stem}")
    paths = [folder / (f"{stem}.png" if len(parts) == 1 else f"{stem}.{index}.png") for index in range(1, len(parts) + 1)]
    for image, path in zip(parts, paths):
        image.save(path, optimize=True)
    return paths


def asset_keys(question_id: str, kind: str, paths: list[Path]) -> list[str]:
    return [f"{question_id}/{kind}/{index}-{path.name}" for index, path in enumerate(paths, 1)]


def build() -> None:
    destination = WORKSPACE / BANK_NAME
    if destination.exists():
        raise SystemExit(f"目标题库已存在，未覆盖：{destination}")
    if not SOURCE_PDF.exists() or len(list(OCR_PAGES.glob("page-*.png"))) != 218:
        raise SystemExit("题目 PDF 或答案渲染页不完整")

    grouped_questions = question_events()
    starts_by_section = {key: answer_starts(key) for key in SECTIONS}
    bank = {"id": BANK_ID, "name": BANK_NAME, "description": "李林880数学二高等数学题库", "source": "local", "chapters": []}
    destination.mkdir(parents=True)
    question_parts_count = answer_parts_count = 0
    document = pdfium.PdfDocument(SOURCE_PDF)
    try:
        for chapter, chapter_name in CHAPTERS.items():
            chapter_id = f"{BANK_ID}-chapter-{chapter:02d}"
            chapter_data = {"id": chapter_id, "name": f"{chapter:02d} {chapter_name}", "sections": []}
            for difficulty, difficulty_name in DIFFICULTIES.items():
                key = (chapter, difficulty)
                folder = destination / f"{chapter:02d} {chapter_name} {difficulty}-{difficulty_name}"
                folder.mkdir()
                source_questions = grouped_questions[key]
                answer_points = starts_by_section[key]
                section_questions = []
                for number, (source, answer_start) in enumerate(zip(source_questions, answer_points), 1):
                    qstem = f"Q-{chapter:02d}-{difficulty}-{number:02d}"
                    astem = f"A-{chapter:02d}-{difficulty}-{number:02d}"
                    qpaths = save_parts(crop_question(document, (source["page"], source["top"]), source["end"]), folder, qstem)
                    if number < len(answer_points):
                        answer_end = answer_points[number]
                    else:
                        answer_end = SECTION_SPANS[key][1]
                    next_ordinal = number + 1
                    heading = TYPE_HEADINGS.get(key, {}).get(next_ordinal)
                    if heading and heading < answer_end:
                        answer_end = heading
                    apaths = save_parts(crop_answer(answer_start, answer_end), folder, astem)
                    question_parts_count += len(qpaths)
                    answer_parts_count += len(apaths)
                    question_id = f"{BANK_ID}-{chapter:02d}-{difficulty}-{number:02d}"
                    section_questions.append({
                        "id": question_id, "number": number, "text": "", "answer": "见答案图片",
                        "analysis": "暂无文字解析", "imageKeys": asset_keys(question_id, "question", qpaths),
                        "answerImageKeys": asset_keys(question_id, "answer", apaths),
                    })
                chapter_data["sections"].append({
                    "id": f"{chapter_id}-section-{difficulty}", "name": difficulty_name, "questions": section_questions,
                })
            bank["chapters"].append(chapter_data)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise
    finally:
        document.close()

    manifest_path = WORKSPACE / "题库数据.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if any(item["id"] == BANK_ID or item["name"] == BANK_NAME for item in manifest["banks"]):
        shutil.rmtree(destination, ignore_errors=True)
        raise SystemExit("清单中已存在 880高数，未重复写入")
    backup = Path("/private/tmp/default-question-bank-manifest-before-880-math.json")
    shutil.copy2(manifest_path, backup)
    manifest["banks"].append(bank)
    manifest.setdefault("folders", {})[BANK_ID] = BANK_NAME
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "bank": BANK_NAME, "questions": 618, "questionParts": question_parts_count,
        "answerParts": answer_parts_count, "backup": str(backup),
    }, ensure_ascii=False))


def refresh_questions() -> None:
    destination = WORKSPACE / BANK_NAME
    manifest_path = WORKSPACE / "题库数据.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bank = next((item for item in manifest["banks"] if item["id"] == BANK_ID), None)
    if not destination.is_dir() or bank is None:
        raise SystemExit("880高数题库尚未建立")
    backup = Path("/private/tmp/default-question-bank-manifest-before-880-math-question-refresh.json")
    shutil.copy2(manifest_path, backup)
    manifest_questions = {
        question["id"]: question
        for chapter in bank["chapters"] for section in chapter["sections"] for question in section["questions"]
    }
    grouped = question_events()
    document = pdfium.PdfDocument(SOURCE_PDF)
    parts_count = 0
    try:
        for key, questions in grouped.items():
            chapter, difficulty = key
            folder = next(
                item for item in destination.iterdir()
                if item.name.startswith(f"{chapter:02d} ") and f" {difficulty}-" in item.name
            )
            for number, source in enumerate(questions, 1):
                stem = f"Q-{chapter:02d}-{difficulty}-{number:02d}"
                for old in folder.glob(f"{stem}*.png"):
                    old.unlink()
                paths = save_parts(
                    crop_question(document, (source["page"], source["top"]), source["end"]), folder, stem
                )
                parts_count += len(paths)
                question_id = f"{BANK_ID}-{chapter:02d}-{difficulty}-{number:02d}"
                manifest_questions[question_id]["imageKeys"] = asset_keys(question_id, "question", paths)
    finally:
        document.close()
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"refreshedQuestions": 618, "questionParts": parts_count, "backup": str(backup)}, ensure_ascii=False))


def refresh_answers() -> None:
    destination = WORKSPACE / BANK_NAME
    manifest_path = WORKSPACE / "题库数据.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    bank = next((item for item in manifest["banks"] if item["id"] == BANK_ID), None)
    if not destination.is_dir() or bank is None:
        raise SystemExit("880高数题库尚未建立")
    if len(list(OCR_PAGES.glob("page-*.png"))) != 218:
        raise SystemExit("答案渲染页不完整")

    manifest_questions = {
        question["id"]: question
        for chapter in bank["chapters"] for section in chapter["sections"] for question in section["questions"]
    }
    starts_by_section = {key: answer_starts(key) for key in SECTIONS}
    staging = Path("/private/tmp/880-math-answer-refresh")
    backup_assets = Path("/private/tmp/880-math-answer-images-before-refresh")
    backup_manifest = Path("/private/tmp/default-question-bank-manifest-before-880-math-answer-refresh.json")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)

    pending_keys: dict[str, list[str]] = {}
    parts_count = 0
    for key, answer_points in starts_by_section.items():
        chapter, difficulty = key
        folder = next(
            item for item in destination.iterdir()
            if item.name.startswith(f"{chapter:02d} ") and f" {difficulty}-" in item.name
        )
        stage_folder = staging / folder.name
        stage_folder.mkdir()
        for number, answer_start in enumerate(answer_points, 1):
            answer_end = answer_points[number] if number < len(answer_points) else SECTION_SPANS[key][1]
            heading = TYPE_HEADINGS.get(key, {}).get(number + 1)
            if heading and heading < answer_end:
                answer_end = heading
            stem = f"A-{chapter:02d}-{difficulty}-{number:02d}"
            paths = save_parts(crop_answer(answer_start, answer_end), stage_folder, stem)
            parts_count += len(paths)
            question_id = f"{BANK_ID}-{chapter:02d}-{difficulty}-{number:02d}"
            pending_keys[question_id] = asset_keys(question_id, "answer", paths)

    if len(pending_keys) != len(manifest_questions):
        shutil.rmtree(staging, ignore_errors=True)
        raise RuntimeError(f"答案数量异常：{len(pending_keys)} / {len(manifest_questions)}")

    shutil.rmtree(backup_assets, ignore_errors=True)
    backup_assets.mkdir(parents=True)
    for folder in destination.iterdir():
        if not folder.is_dir():
            continue
        old_answers = list(folder.glob("A-*.png"))
        if old_answers:
            backup_folder = backup_assets / folder.name
            backup_folder.mkdir()
            for path in old_answers:
                shutil.copy2(path, backup_folder / path.name)
            for path in old_answers:
                path.unlink()
        stage_folder = staging / folder.name
        if stage_folder.is_dir():
            for path in stage_folder.glob("A-*.png"):
                shutil.copy2(path, folder / path.name)

    shutil.copy2(manifest_path, backup_manifest)
    for question_id, keys in pending_keys.items():
        manifest_questions[question_id]["answerImageKeys"] = keys
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shutil.rmtree(staging, ignore_errors=True)
    print(json.dumps({
        "refreshedAnswers": len(pending_keys), "answerParts": parts_count,
        "assetBackup": str(backup_assets), "manifestBackup": str(backup_manifest),
    }, ensure_ascii=False))


def diagnose() -> None:
    for key, (first, last, counts) in SECTIONS.items():
        found = section_candidates(key)
        expected = []
        for count in counts:
            expected.extend(range(1, count + 1))
        # Greedy subsequence alignment is intentionally strict: it exposes OCR gaps
        # while ignoring green parenthesized references that do not fit the sequence.
        selected = []
        position = 0
        for wanted in expected:
            while position < len(found) and found[position]["number"] != wanted:
                position += 1
            if position == len(found):
                break
            selected.append(found[position])
            position += 1
        print(json.dumps({
            "section": key,
            "expected": len(expected),
            "candidates": len(found),
            "matchedPrefix": len(selected),
            "nextExpected": expected[len(selected)] if len(selected) < len(expected) else None,
            "tail": found[max(0, position - 3):position + 8],
        }, ensure_ascii=False))


def align(expected: list[int], found: list[dict]) -> list[tuple[int, dict | None]]:
    """Align ordered labels, penalizing a missed real label more than OCR noise."""
    rows, cols = len(expected) + 1, len(found) + 1
    cost = [[0] * cols for _ in range(rows)]
    step = [[""] * cols for _ in range(rows)]
    for row in range(1, rows):
        cost[row][0], step[row][0] = row * 3, "missing"
    for col in range(1, cols):
        cost[0][col], step[0][col] = col, "noise"
    for row in range(1, rows):
        for col in range(1, cols):
            choices = [(cost[row][col - 1] + 1, "noise"), (cost[row - 1][col] + 3, "missing")]
            if expected[row - 1] == found[col - 1]["number"]:
                choices.append((cost[row - 1][col - 1], "match"))
            cost[row][col], step[row][col] = min(choices, key=lambda value: value[0])
    result: list[tuple[int, dict | None]] = []
    row, col = len(expected), len(found)
    while row or col:
        action = step[row][col]
        if action == "match":
            result.append((expected[row - 1], found[col - 1]))
            row -= 1
            col -= 1
        elif action == "missing":
            result.append((expected[row - 1], None))
            row -= 1
        else:
            col -= 1
    result.reverse()
    return result


def diagnose_alignment() -> None:
    for key, (first, last, counts) in SECTIONS.items():
        found = section_candidates(key)
        expected: list[int] = []
        for count in counts:
            expected.extend(range(1, count + 1))
        aligned = align(expected, found)
        missing = []
        for index, (number, item) in enumerate(aligned):
            if item is None:
                previous = next((value for _, value in reversed(aligned[:index]) if value), None)
                following = next((value for _, value in aligned[index + 1:] if value), None)
                missing.append({"number": number, "previous": previous, "following": following})
        print(json.dumps({"section": key, "missing": missing, "found": len(found), "expected": len(expected)}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--diagnose-answers", action="store_true")
    parser.add_argument("--diagnose-alignment", action="store_true")
    parser.add_argument("--green-pages", nargs="*", type=int)
    parser.add_argument("--diagnose-potentials", action="store_true")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--refresh-questions", action="store_true")
    parser.add_argument("--refresh-answers", action="store_true")
    args = parser.parse_args()
    if args.diagnose_answers:
        diagnose()
        return
    if args.diagnose_alignment:
        diagnose_alignment()
        return
    if args.green_pages:
        for page in args.green_pages:
            print(page, green_groups(page))
        return
    if args.diagnose_potentials:
        diagnose_potentials()
        return
    if args.build:
        build()
        return
    if args.refresh_questions:
        refresh_questions()
        return
    if args.refresh_answers:
        refresh_answers()
        return
    raise SystemExit("尚未指定操作")


if __name__ == "__main__":
    main()
