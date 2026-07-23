#!/usr/bin/env python3
"""Build the chapter 2-7 mechanical-principles textbook exercise bank.

The supplied PDFs are page scans.  This script renders them at 300 DPI and
cuts each exercise by its printed question number while preserving the full
rendered page width (2150 px).  A question that crosses a page boundary keeps
multiple image parts in reading order.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PDF_ROOT = Path("/Users/enderrayven/Library/CloudStorage/OneDrive-个人/Study/06 考研/04 专业课/机械原理/机械原理 第九版 章节拆分")
RENDER_ROOT = ROOT / "tmp" / "pdfs" / "mechanical-textbook-300"
TEXTBOOK_ROOT = ROOT / "机械原理-教材习题"
DEFAULT_ROOT = ROOT / "默认题库" / "专业课" / "机械原理-教材习题"
MANIFEST = ROOT / "默认题库" / "题库数据.json"
POPPLER = Path("/Users/enderrayven/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/bin/pdftoppm")

OCR_DPI = 160
OUTPUT_DPI = 300
SCALE = OUTPUT_DPI / OCR_DPI
PAGE_HEIGHT = 1621  # 729.6 pt at 160 DPI; final rendered height is 3040 px.
HEADING_PAD = 10
END_PAD = 8

CHAPTERS = {
    2: ("机构的结构分析", 25),
    3: ("平面机构的运动分析", 26),
    4: ("平面机构的力分析", 29),
    5: ("机械的动力分析", 11),
    6: ("机械的平衡", 17),
    7: ("机械的运转及其速度波动的调节", 16),
}

# Question heading coordinates measured on the 160 DPI review renders.
# They are deliberately kept as source-layout metadata so future reruns do
# not depend on OCR results that can vary with local language packs.
STARTS = {
    2: {
        1: (1, 1001), 2: (1, 1032), 3: (1, 1064), 4: (1, 1127),
        5: (1, 1159), 6: (1, 1190), 7: (1, 1252), 8: (1, 1315),
        9: (1, 1347), 10: (1, 1473), 11: (2, 171), 12: (2, 266),
        13: (2, 869), 14: (2, 1345), 15: (2, 1440), 16: (3, 855),
        17: (3, 1275), 18: (3, 1408), 19: (4, 1303), 20: (4, 1403),
        21: (4, 1470), 22: (6, 235), 23: (6, 726), 24: (6, 821),
        25: (6, 1389),
    },
    3: {
        1: (1, 532), 2: (1, 564), 3: (1, 627), 4: (1, 1019),
        5: (2, 147), 6: (2, 480), 7: (2, 819), 8: (2, 882),
        9: (2, 1284), 10: (2, 1316), 11: (2, 1348), 12: (2, 1380),
        13: (2, 1412), 14: (3, 736), 15: (3, 799), 16: (3, 1343),
        17: (3, 1437), 18: (4, 554), 19: (4, 1218), 20: (4, 1376),
        21: (5, 795), 22: (6, 237), 23: (6, 835), 24: (6, 930),
        25: (6, 1381), 26: (6, 1443),
    },
    4: {
        1: (1, 1437), 2: (1, 1471), 3: (2, 177), 4: (2, 209),
        5: (2, 273), 6: (2, 336), 7: (2, 368), 8: (2, 400),
        9: (2, 820), 10: (2, 1202), 11: (2, 1293), 12: (2, 1384),
        13: (2, 1479), 14: (3, 1086), 15: (3, 1213), 16: (3, 1370),
        17: (4, 410), 18: (4, 505), 19: (4, 962), 20: (4, 1089),
        21: (4, 1441), 22: (5, 171), 23: (5, 235), 24: (5, 682),
        25: (5, 779), 26: (5, 1277), 27: (5, 1405), 28: (5, 1437),
        29: (6, 486),
    },
    5: {
        1: (1, 383), 2: (1, 412), 3: (1, 473), 4: (1, 505),
        5: (1, 606), 6: (1, 637), 7: (1, 1024), 8: (1, 1087),
        9: (2, 142), 10: (2, 270), 11: (2, 493),
    },
    6: {
        1: (1, 382), 2: (1, 445), 3: (1, 541), 4: (1, 604),
        5: (1, 673), 6: (1, 773), 7: (1, 1244), 8: (1, 1344),
        9: (2, 681), 10: (2, 744), 11: (2, 1216), 12: (2, 1278),
        13: (2, 1408), 14: (3, 432), 15: (3, 963), 16: (3, 1063),
        17: (4, 140),
    },
    7: {
        1: (1, 614), 2: (1, 645), 3: (1, 677), 4: (1, 709),
        5: (1, 1239), 6: (1, 1272), 7: (1, 1305), 8: (1, 1434),
        9: (2, 514), 10: (2, 609), 11: (2, 705), 12: (2, 926),
        13: (2, 1474), 14: (3, 236), 15: (3, 770), 16: (3, 964),
    },
}

# Explicit page continuations and layouts where several question bodies
# continue onto the next page.  Full-width strips intentionally repeat
# adjacent diagrams when they share one source row; horizontal cropping is
# forbidden by the bank's image-width rule.
CONTINUATIONS = {
    (2, 11): [(2, 171, 258), (2, 410, 850)],
    (2, 12): [(2, 266, 410), (2, 410, 850)],
    (2, 14): [(2, 1345, 1440), (3, 120, 800)],
    (2, 15): [(2, 1440, PAGE_HEIGHT), (3, 120, 800)],
    (2, 17): [(3, 1275, 1408), (4, 120, 850)],
    (2, 18): [(3, 1408, PAGE_HEIGHT), (4, 850, 1303)],
    (2, 19): [(4, 1303, 1403), (5, 120, 650)],
    (2, 20): [(4, 1403, 1470), (5, 650, 1050)],
    (2, 21): [(4, 1470, PAGE_HEIGHT), (5, 1050, PAGE_HEIGHT), (6, 120, 235)],
    (2, 23): [(6, 726, 821), (6, 880, 1360)],
    (2, 25): [(6, 1389, PAGE_HEIGHT), (7, 120, 590)],
    (3, 7): [(2, 819, 882), (2, 950, 1250)],
    (3, 11): [(2, 1348, 1380), (3, 120, 350)],
    (3, 12): [(2, 1380, 1412), (3, 350, 650)],
    (3, 13): [(2, 1412, PAGE_HEIGHT), (3, 350, 720)],
    (3, 14): [(3, 736, 799), (3, 850, 1330)],
    (3, 16): [(3, 1343, 1437), (4, 120, 535)],
    (3, 17): [(3, 1437, PAGE_HEIGHT), (4, 120, 535)],
    (3, 19): [(4, 1218, 1376), (5, 120, 760)],
    (3, 20): [(4, 1376, PAGE_HEIGHT), (5, 120, 760)],
    (4, 10): [(2, 1202, 1293), (2, 1180, 1500)],
    (4, 11): [(2, 1293, 1384), (3, 120, 650)],
    (4, 12): [(2, 1384, 1479), (3, 650, 950)],
    (4, 13): [(2, 1479, PAGE_HEIGHT), (3, 650, 1068)],
    (4, 14): [(3, 1086, 1460)],
    (4, 15): [(3, 1213, 1370), (4, 120, 390)],
    (4, 16): [(3, 1370, PAGE_HEIGHT), (4, 120, 390)],
    (4, 17): [(4, 410, 505), (4, 620, 930)],
    (4, 19): [(4, 962, 1089), (4, 1160, 1430)],
    (4, 21): [(4, 1441, PAGE_HEIGHT), (5, 100, 162)],
    (4, 22): [(5, 171, 235), (5, 300, 700)],
    (4, 23): [(5, 235, 682), (5, 300, 700)],
    (4, 24): [(5, 682, 779), (5, 700, 1260)],
    (4, 26): [(5, 1277, 1405), (6, 120, 475)],
    (4, 28): [(5, 1437, PAGE_HEIGHT), (6, 120, 475)],
    (5, 4): [(1, 505, 606), (1, 740, 1010)],
    (5, 6): [(1, 637, 740), (1, 740, 1010)],
    (5, 7): [(1, 1024, 1087), (1, 1160, 1460)],
    (5, 8): [(1, 1087, 1160), (1, 1160, 1460)],
    (5, 9): [(2, 142, 270), (2, 100, 550)],
    (5, 10): [(2, 270, 493), (2, 600, 960)],
    (5, 11): [(2, 493, 600), (2, 600, 960)],
    (6, 2): [(1, 445, 541), (1, 350, 600)],
    (6, 5): [(1, 673, 773), (1, 850, 1210)],
    (6, 7): [(1, 1244, 1344), (2, 120, 650)],
    (6, 8): [(1, 1344, 1500), (2, 120, 650)],
    (6, 9): [(2, 681, 744), (2, 800, 1200)],
    (6, 12): [(2, 1278, 1408), (3, 120, 450)],
    (6, 13): [(2, 1408, PAGE_HEIGHT), (3, 120, 450)],
    (7, 8): [(1, 1434, PAGE_HEIGHT), (2, 120, 500)],
    (7, 7): [(1, 1305, 1434), (2, 120, 500)],
    (7, 11): [(2, 705, 926), (2, 1000, 1450)],
    (7, 12): [(2, 926, 1000), (2, 1000, 1450)],
    (7, 13): [(2, 1474, PAGE_HEIGHT), (3, 120, 220), (3, 350, 700)],
    (7, 15): [(3, 770, 964), (3, 1100, 1400)],
}

# Figures 2-52 and 2-53 share one source row but belong to adjacent
# questions. Keep the original 2150 px canvas while blanking the unrelated
# half in each question's figure segment.
HORIZONTAL_MASKS = {
    (2, 11, 2): "keep_left",
    (2, 12, 2): "keep_right",
}

# Last-question crop ends, in OCR-space pixels.  These stop before the
# chapter's "阅读参考资料" block and avoid exporting large blank tails.
PAGE_ENDS = {
    (2, 1): 1600, (2, 2): 1600, (2, 3): PAGE_HEIGHT, (2, 4): PAGE_HEIGHT,
    (2, 6): PAGE_HEIGHT, (2, 7): 650,
    (3, 1): 1580, (3, 2): PAGE_HEIGHT, (3, 3): PAGE_HEIGHT, (3, 4): PAGE_HEIGHT,
    (3, 5): 1580, (3, 6): 1530,
    (4, 1): 1600, (4, 2): PAGE_HEIGHT, (4, 3): PAGE_HEIGHT, (4, 4): PAGE_HEIGHT,
    (4, 5): PAGE_HEIGHT, (4, 6): 1220,
    (5, 1): 1580, (5, 2): 1020,
    (6, 1): 1500, (6, 2): 1510, (6, 3): 1280, (6, 4): 300,
    (7, 1): PAGE_HEIGHT, (7, 2): PAGE_HEIGHT, (7, 3): 1395,
}


def page_starts(chapter: int) -> dict[int, list[tuple[int, int]]]:
    result: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for question, (page, y) in STARTS[chapter].items():
        result[page].append((question, y))
    for values in result.values():
        values.sort()
    return result


def default_segments(chapter: int, question: int) -> list[tuple[int, int, int]]:
    page, y = STARTS[chapter][question]
    same_page = page_starts(chapter)[page]
    following = [next_y for next_q, next_y in same_page if next_q > question]
    end = min(following) - 10 if following else PAGE_ENDS[(chapter, page)]
    return [(page, y, end)]


def segments_for(chapter: int, question: int) -> list[tuple[int, int, int]]:
    return CONTINUATIONS.get((chapter, question), default_segments(chapter, question))


def is_same_page_question_boundary(chapter: int, question: int, page: int, y_end: int) -> bool:
    return any(
        next_question > question and next_y == y_end
        for next_question, next_y in page_starts(chapter)[page]
    )


def render_source_pages(chapter: int, pdf_path: Path) -> dict[int, Path]:
    output_dir = RENDER_ROOT / f"{chapter:02d}"
    output_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(POPPLER), "-png", "-r", str(OUTPUT_DPI), str(pdf_path), str(output_dir / "page")],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {index: output_dir / f"page-{index}.png" for index in range(1, len(list(output_dir.glob("page-*.png"))) + 1)}


def clear_chapter_outputs(chapter: int, name: str) -> tuple[Path, Path]:
    root_dir = TEXTBOOK_ROOT / f"第{chapter:02d}章 {name}"
    default_dir = DEFAULT_ROOT / f"{chapter:02d} {name} 01-思考题及练习题"
    for directory in (root_dir, default_dir):
        if directory.exists():
            shutil.rmtree(directory)
        directory.mkdir(parents=True, exist_ok=True)
    return root_dir, default_dir


def question_image_key(bank_id: str, chapter: int, question: int, part: int) -> str:
    filename = f"{part}-Q-{chapter:02d}-1-{question:02d}.{part}.png"
    return f"{bank_id}-{chapter:02d}-1-{question:02d}/question/{filename}"


def update_manifest(question_parts: dict[tuple[int, int], int]) -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    bank_id = "default-mechanical-theory-textbook-exercises"
    bank = next(bank for bank in data["banks"] if bank["id"] == bank_id)
    chapters = []
    for chapter, (name, count) in CHAPTERS.items():
        questions = []
        for question in range(1, count + 1):
            parts = question_parts[(chapter, question)]
            questions.append({
                "id": f"{bank_id}-{chapter:02d}-1-{question:02d}",
                "number": question,
                "text": "",
                "answer": "本题库未附教材答案图片",
                "analysis": "教材原题图；按题号及关联题图纵向裁切，保持 2150 px 原始宽度与 300 DPI；同页多行或跨页题按原页序保留多张分片。",
                "type": "图片题",
                "imageKeys": [question_image_key(bank_id, chapter, question, part) for part in range(1, parts + 1)],
                "answerImageKeys": [],
            })
        chapters.append({
            "id": f"{bank_id}-chapter-{chapter:02d}",
            "name": f"第{chapter}章 {name}",
            "sections": [{
                "id": f"{bank_id}-chapter-{chapter:02d}-section-1",
                "name": "思考题及练习题",
                "questions": questions,
            }],
        })
    bank["chapters"] = chapters
    bank["description"] = "《机械原理（第九版）》第2—7章思考题及练习题；按题号整理为 124 道题，题图保持 2150 px 原始宽度与 300 DPI，同页多行或跨页题保留多张分片，未附教材答案图片。"
    bank["subject"] = "professional"
    bank["workspaceFolder"] = "专业课/机械原理-教材习题"
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not PDF_ROOT.exists():
        raise SystemExit(f"Source directory not found: {PDF_ROOT}")
    if not POPPLER.exists():
        raise SystemExit(f"pdftoppm not found: {POPPLER}")

    RENDER_ROOT.mkdir(parents=True, exist_ok=True)
    all_parts: dict[tuple[int, int], int] = {}
    crop_manifest: dict[str, object] = {"dpi": OUTPUT_DPI, "width": 2150, "chapters": []}

    for chapter, (name, count) in CHAPTERS.items():
        pdf_path = PDF_ROOT / f"{chapter:02d}.pdf"
        rendered = render_source_pages(chapter, pdf_path)
        root_dir, default_dir = clear_chapter_outputs(chapter, name)
        chapter_record = {"chapter": chapter, "name": name, "source": pdf_path.name, "questions": []}

        for question in range(1, count + 1):
            segments = segments_for(chapter, question)
            all_parts[(chapter, question)] = len(segments)
            filenames = []
            source_pages = []
            for part, (page, y_start, y_end) in enumerate(segments, 1):
                source_pages.append(page)
                image_path = rendered[page]
                with Image.open(image_path) as opened:
                    image = opened.convert("RGB")
                    top_padding = HEADING_PAD if page == STARTS[chapter][question][0] and y_start == STARTS[chapter][question][1] else 0
                    top = max(0, round((y_start - top_padding) * SCALE))
                    end_padding = 0 if is_same_page_question_boundary(chapter, question, page, y_end) else END_PAD
                    bottom = min(image.height, round((y_end + end_padding) * SCALE))
                    if bottom <= top:
                        raise ValueError(f"Invalid crop {chapter}-{question} part {part}: {page} {y_start}-{y_end}")
                    cropped = image.crop((0, top, image.width, bottom))
                    mask_mode = HORIZONTAL_MASKS.get((chapter, question, part))
                    if mask_mode:
                        draw = ImageDraw.Draw(cropped)
                        midpoint = cropped.width // 2
                        if mask_mode == "keep_left":
                            draw.rectangle((midpoint, 0, cropped.width, cropped.height), fill="white")
                        else:
                            draw.rectangle((0, 0, midpoint, cropped.height), fill="white")
                    if cropped.width != 2150:
                        raise ValueError(f"Unexpected width for chapter {chapter} question {question}: {cropped.width}")
                    filename = f"Q-{chapter:02d}-1-{question:02d}.{part}.png"
                    cropped.save(root_dir / filename, "PNG", optimize=True, compress_level=6, dpi=(OUTPUT_DPI, OUTPUT_DPI))
                    cropped.save(default_dir / filename, "PNG", optimize=True, compress_level=6, dpi=(OUTPUT_DPI, OUTPUT_DPI))
                filenames.append(filename)

            chapter_record["questions"].append({
                "number": question,
                "parts": filenames,
                "sourcePages": source_pages,
            })

        crop_manifest["chapters"].append(chapter_record)
        print(f"第{chapter}章 {name}: {count} 道题", flush=True)

    update_manifest(all_parts)
    (TEXTBOOK_ROOT / "裁切清单.json").write_text(
        json.dumps(crop_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"完成：{sum(count for _, count in CHAPTERS.values())} 道题，{sum(all_parts.values())} 张题图分片")


if __name__ == "__main__":
    main()
