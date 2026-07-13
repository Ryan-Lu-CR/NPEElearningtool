#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "TEMP" / "Kira习题"
OCR_PAGES = Path("/private/tmp/kira-answer-pages")
WORKSPACE = ROOT / "默认题库"
BANK_NAME = "Kira线代基础"
BANK_ID = "default-kira-linear-basic"

CHAPTERS = {
    1: ("行列式", 14),
    2: ("矩阵", 43),
    3: ("向量", 25),
    4: ("线性方程组", 24),
    5: ("特征值与特征向量", 41),
    6: ("二次型", 18),
}

START_PATTERN = re.compile(r"^\d{1,2}\s*[\.．、,，。\(（]")
EXCLUDED_OCR_STARTS = {(4, 3, 0.594), (5, 8, 0.186), (6, 3, 0.642)}
MANUAL_STARTS = {
    2: [(2, 0.738), (6, 0.388)],
    3: [(2, 0.392), (2, 0.770)],
    4: [(2, 0.833)],
    6: [(4, 0.560)],
}


def top_of(item: dict) -> float:
    return 1 - item["y"] - item["height"]


def answer_starts(chapter: int) -> tuple[list[tuple[int, float]], list[tuple[int, float]]]:
    starts: list[tuple[int, float]] = []
    headings: list[tuple[int, float]] = []
    for path in sorted(OCR_PAGES.glob(f"{chapter:02d}-*.json")):
        page = int(path.stem[-2:])
        for item in json.loads(path.read_text(encoding="utf-8")):
            text = item["text"].strip()
            top = top_of(item)
            if "填空题" in text or "解答题" in text:
                headings.append((page, top))
            if item["x"] < 0.28 and START_PATTERN.match(text):
                key = (chapter, page, round(top, 3))
                if key not in EXCLUDED_OCR_STARTS:
                    starts.append((page, top))
    starts.extend(MANUAL_STARTS.get(chapter, []))
    starts = sorted(set((page, round(top, 4)) for page, top in starts))
    headings = sorted(set((page, round(top, 4)) for page, top in headings))
    return starts, headings


def trim_ink(image: Image.Image) -> Image.Image | None:
    array = np.asarray(image.convert("RGB"))
    dark = array.mean(axis=2) < 215
    rows = np.where(dark.sum(axis=1) >= 5)[0]
    cols = np.where(dark.sum(axis=0) >= 5)[0]
    if not len(rows) or not len(cols):
        return None
    top, bottom = max(0, int(rows[0]) - 12), min(image.height, int(rows[-1]) + 13)
    left, right = max(0, int(cols[0]) - 12), min(image.width, int(cols[-1]) + 13)
    if bottom - top < 20 or right - left < 30:
        return None
    return image.crop((left, top, right, bottom))


def before(a: tuple[int, float], b: tuple[int, float]) -> bool:
    return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1])


def crop_answer(chapter: int, start: tuple[int, float], end: tuple[int, float], headings: list[tuple[int, float]]) -> list[Image.Image]:
    boundary = end
    for heading in headings:
        if before(start, heading) and before(heading, boundary):
            boundary = heading
            break
    parts: list[Image.Image] = []
    for page_number in range(start[0], boundary[0] + 1):
        page = Image.open(OCR_PAGES / f"{chapter:02d}-{page_number:02d}.png").convert("RGB")
        top = start[1] - 0.003 if page_number == start[0] else 0.065
        bottom = boundary[1] - 0.012 if page_number == boundary[0] else 0.925
        if bottom <= top:
            continue
        part = page.crop((int(page.width * 0.105), int(page.height * max(0, top)), int(page.width * 0.92), int(page.height * min(1, bottom))))
        trimmed = trim_ink(part)
        if trimmed is not None:
            parts.append(trimmed)
    return parts


def write_answer(parts: list[Image.Image], folder: Path, chapter: int, number: int) -> list[Path]:
    stem = f"A-{chapter:02d}-1-{number:02d}"
    paths = [folder / (f"{stem}.png" if len(parts) == 1 else f"{stem}.{index}.png") for index in range(1, len(parts) + 1)]
    for image, path in zip(parts, paths):
        image.save(path, optimize=True)
    return paths


def asset_keys(question_id: str, kind: str, paths: list[Path]) -> list[str]:
    return [f"{question_id}/{kind}/{index}-{path.name}" for index, path in enumerate(paths, 1)]


def main() -> None:
    destination = WORKSPACE / BANK_NAME
    if destination.exists():
        raise SystemExit(f"目标题库已存在，未覆盖：{destination}")

    starts_by_chapter: dict[int, list[tuple[int, float]]] = {}
    headings_by_chapter: dict[int, list[tuple[int, float]]] = {}
    expected_pdf_counts = {1: 14, 2: 43, 3: 25, 4: 24, 5: 41, 6: 20}
    for chapter in CHAPTERS:
        starts, headings = answer_starts(chapter)
        if len(starts) != expected_pdf_counts[chapter]:
            raise SystemExit(f"第{chapter}章答案起点数量异常：{len(starts)} != {expected_pdf_counts[chapter]}")
        starts_by_chapter[chapter] = starts
        headings_by_chapter[chapter] = headings

    bank = {"id": BANK_ID, "name": BANK_NAME, "description": "Kira线性代数基础习题", "source": "local", "chapters": []}
    destination.mkdir(parents=True)
    answer_parts = 0

    for chapter, (name, question_count) in CHAPTERS.items():
        source_folder = SOURCE / f"{chapter:02d} {name}.assets"
        question_sources = sorted(source_folder.glob("*.png"))
        if len(question_sources) != question_count:
            raise SystemExit(f"第{chapter}章题目数量异常：{len(question_sources)} != {question_count}")
        folder = destination / f"{chapter:02d} {name} 1-习题"
        folder.mkdir()

        all_starts = starts_by_chapter[chapter]
        last_page = max(int(path.stem[-2:]) for path in OCR_PAGES.glob(f"{chapter:02d}-*.png"))
        intervals = [(point, all_starts[index + 1] if index + 1 < len(all_starts) else (last_page, 0.925)) for index, point in enumerate(all_starts)]
        if chapter == 6:
            selected_indices = list(range(14)) + [15, 16, 18, 19]
        else:
            selected_indices = list(range(len(intervals)))
        if len(selected_indices) != question_count:
            raise SystemExit(f"第{chapter}章匹配数量异常")

        questions = []
        for number, (source_path, answer_index) in enumerate(zip(question_sources, selected_indices), 1):
            question_path = folder / f"Q-{chapter:02d}-1-{number:02d}.png"
            shutil.copy2(source_path, question_path)
            start, end = intervals[answer_index]
            parts = crop_answer(chapter, start, end, headings_by_chapter[chapter])
            if not parts:
                raise SystemExit(f"第{chapter}章第{number}题答案裁剪为空")
            answer_paths = write_answer(parts, folder, chapter, number)
            answer_parts += len(answer_paths)
            question_id = f"{BANK_ID}-{chapter:02d}-1-{number:02d}"
            questions.append({
                "id": question_id,
                "number": number,
                "text": "",
                "answer": "见答案图片",
                "analysis": "暂无文字解析",
                "imageKeys": asset_keys(question_id, "question", [question_path]),
                "answerImageKeys": asset_keys(question_id, "answer", answer_paths),
            })

        chapter_id = f"{BANK_ID}-chapter-{chapter:02d}"
        bank["chapters"].append({
            "id": chapter_id,
            "name": f"{chapter:02d} {name}",
            "sections": [{"id": f"{chapter_id}-section-1", "name": "习题", "questions": questions}],
        })

    manifest_path = WORKSPACE / "题库数据.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if any(item["id"] == BANK_ID or item["name"] == BANK_NAME for item in manifest["banks"]):
        raise SystemExit("清单中已存在 Kira 题库，未重复写入")
    manifest["banks"].append(bank)
    manifest.setdefault("folders", {})[BANK_ID] = BANK_NAME
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    backup = Path("/private/tmp/default-question-bank-manifest-before-kira.json")
    shutil.copy2(manifest_path, backup)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"bank": BANK_NAME, "questions": sum(item[1] for item in CHAPTERS.values()), "answerParts": answer_parts, "backup": str(backup)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
