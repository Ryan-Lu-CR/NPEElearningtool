#!/usr/bin/env python3
"""Build image question banks from the chapter exercise PDFs.

The PDFs are scanned pages. Tesseract is used only to locate question-number
headings; the final question and answer content remains the original scan.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = ROOT / "默认题库"
MANIFEST = DEFAULT_ROOT / "题库数据.json"
TMP = ROOT / "tmp" / "pdfs" / "mechanical-lecture-bank"
POPPLER = Path(
    "/Users/enderrayven/.cache/codex-runtimes/codex-primary-runtime/"
    "dependencies/native/poppler/bin"
)

THEORY_CHAPTERS = (
    "平面机构的结构分析",
    "平面机构的运动分析",
    "平面连杆机构及其设计",
    "凸轮机构及其设计",
    "齿轮机构及其设计",
    "轮系及其设计",
    "力分析与机械效率、自锁",
    "机械的平衡",
    "机械的运转及其速度波动调节",
    "其他常用机构及其设计",
)

DESIGN_CHAPTERS = {
    1: "机械设计总论",
    2: "机械零件的强度",
    3: "摩擦、磨损及润滑概述",
    4: "螺纹连接和螺旋传动",
    5: "轴毂连接",
    6: "带传动",
    7: "链传动",
    8: "齿轮传动",
    9: "蜗杆传动",
    10: "滑动轴承",
    11: "滚动轴承",
    13: "轴",
    14: "机械系统总体方案设计",
}

EXPECTED_COUNTS = {
    "theory": {1: 6, 2: 6, 3: 6, 4: 7, 5: 7, 6: 7, 7: 4, 8: 10, 9: 9, 10: 8},
    "design": {1: 5, 2: 10, 3: 8, 4: 8, 5: 4, 6: 6, 7: 4, 8: 11, 9: 5, 10: 4, 11: 2, 13: 2, 14: 2},
}

# OCR occasionally misses a pale heading or reads a chapter digit as artwork.
# These reviewed coordinates are (zero-based page, y) in the 180 dpi render.
MANUAL_MARKERS = {
    ("theory", 1, "A", 1): (3, 790),
    ("theory", 1, "A", 2): (4, 797),
    ("theory", 2, "A", 2): (4, 215),
    ("theory", 3, "Q", 1): (0, 470),
    ("theory", 3, "A", 2): (2, 1490),
    ("theory", 3, "A", 4): (4, 1485),
    ("theory", 4, "A", 2): (4, 1185),
    ("theory", 4, "A", 7): (7, 1375),
    ("theory", 5, "A", 3): (3, 716),
    ("theory", 5, "A", 5): (4, 930),
    ("design", 1, "A", 4): (2, 537),
    ("design", 3, "A", 6): (2, 155),
    ("design", 5, "A", 1): (1, 1380),
    ("design", 6, "A", 2): (1, 1175),
    ("design", 6, "A", 4): (2, 951),
    ("design", 8, "Q", 10): (3, 482),
    ("design", 8, "A", 1): (3, 1419),
    ("design", 8, "A", 3): (4, 560),
    ("design", 8, "A", 8): (5, 1118),
    ("design", 8, "A", 11): (6, 320),
    ("design", 9, "A", 2): (2, 1102),
    ("design", 9, "A", 3): (2, 1480),
    ("design", 10, "Q", 3): (0, 482),
    ("design", 11, "A", 1): (0, 1298),
    ("design", 13, "A", 1): (1, 235),
}

# Some scanned pages use two columns: the next exercise's figure can start
# above its heading while the current exercise's text is still continuing in
# the left column. Keep the original marker as the boundary, but start the
# next exercise at the figure's top and mask the overlapping column in each
# extracted image.
MANUAL_SLICE_STARTS = {
    ("theory", 4, 2): (1, 230),
}

# Exact crop bottoms for the same page. These values include the small white
# breathing room before the following exercise heading.
MANUAL_SLICE_ENDS = {
    ("theory", 4, 1): (1, 720),
    ("theory", 4, 2): (1, 858),
}

# Coordinates are normalized to the extracted piece (x0, y0, x1, y1).
MANUAL_SLICE_MASKS = {
    # The same figure belongs to exercise 4-2. Its top-right area starts
    # before the exercise heading, so hide the preceding exercise's text in
    # the left column until that heading begins.
    ("theory", 4, 2, 1): [(0.0, 0.0, 0.52, 0.52)],
}

# Exercise 4-2's answer text is on one page, while its referenced answer
# figures (a) and (b) begin at the top of the following page. Keep that
# figure page as an additional answer image instead of silently dropping it
# at the page boundary. Coordinates are zero-based in the 180 dpi render.
MANUAL_EXTRA_ANSWER_SLICES = {
    ("theory", 4, 2): [(5, 0, 780)],
}


@dataclass(frozen=True)
class BankSpec:
    bank_id: str
    name: str
    subject: str
    source_dir: Path
    chapter_names: dict[int, str]
    style: str


SPECS = (
    BankSpec(
        "default-mechanical-theory-lecture-exercises",
        "机械原理-讲义课后习题",
        "professional",
        ROOT / "拆分" / "机械原理讲义",
        {i: name for i, name in enumerate(THEORY_CHAPTERS, 1)},
        "theory",
    ),
    BankSpec(
        "default-mechanical-design-lecture-exercises",
        "机械设计-讲义课后习题",
        "professional",
        ROOT / "拆分" / "机械设计讲义",
        DESIGN_CHAPTERS,
        "design",
    ),
)

def workspace_bank_path(name: str) -> Path:
    return DEFAULT_ROOT / "专业课" / name


def chapter_pdf(spec: BankSpec, chapter: int) -> Path:
    prefix = f"{chapter}.5 " if spec.style == "theory" else f"{chapter} "
    matches = sorted(spec.source_dir.glob(f"{prefix}*.pdf"))
    if len(matches) != 1:
        raise RuntimeError(f"{spec.name} 第 {chapter} 章 PDF 数量异常: {matches}")
    return matches[0]


def run(command: list[str]) -> str:
    completed = subprocess.run(
        command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    return completed.stdout


def render(pdf: Path, output: Path) -> list[Path]:
    output.mkdir(parents=True, exist_ok=True)
    existing = sorted(output.glob("page-*.png"))
    valid = bool(existing)
    for path in existing:
        try:
            with Image.open(path) as image:
                image.verify()
        except OSError:
            valid = False
            break
    if valid:
        return existing
    run([
        str(POPPLER / "pdftoppm"), "-r", "180", "-gray", "-png",
        str(pdf), str(output / "page"),
    ])
    return sorted(output.glob("page-*.png"))


def ocr_lines_for_psm(image: Path, psm: int) -> list[tuple[int, str]]:
    cache = image.with_suffix(f".psm{psm}.tsv")
    if not cache.exists():
        text = run([
            "tesseract", str(image), "stdout", "-l", "chi_sim+eng",
            "--psm", str(psm), "tsv",
        ])
        cache.write_text(text, encoding="utf-8")
    rows = cache.read_text(encoding="utf-8").splitlines()[1:]
    grouped: dict[tuple[int, int, int, int], list[tuple[int, int, str]]] = {}
    for row in rows:
        fields = row.split("\t")
        if len(fields) < 12 or not fields[11].strip():
            continue
        key = tuple(map(int, fields[1:5]))
        grouped.setdefault(key, []).append((int(fields[6]), int(fields[7]), fields[11]))
    lines = []
    for words in grouped.values():
        words.sort()
        y = min(item[1] for item in words)
        lines.append((y, " ".join(item[2] for item in words)))
    return sorted(lines)


def ocr_lines(image: Path) -> list[tuple[int, str]]:
    lines = ocr_lines_for_psm(image, 6) + ocr_lines_for_psm(image, 11)
    return sorted(lines)


def normalized(text: str) -> str:
    return (
        text.replace(" ", "")
        .replace("．", ".")
        .replace("。", ".")
        .replace("—", "-")
        .replace("－", "-")
        .replace("[", "【")
        .replace("]", "】")
    )


def detect_markers(
    style: str, chapter: int, pages: list[Path]
) -> tuple[list[tuple[int, int, int]], list[tuple[int, int, int]]]:
    questions: dict[int, tuple[int, int, int]] = {}
    answers: dict[int, tuple[int, int, int]] = {}
    answer_mode = False
    last_candidates: dict[tuple[int, int], int] = {}

    for page_index, page in enumerate(pages):
        for y, raw in ocr_lines(page):
            text = normalized(raw)
            if "参考答案" in text or "练习题答案" in text:
                answer_mode = True
            if style == "theory":
                cleaned = text.replace("S", "5").replace("$", "5")
                match = re.match(
                    rf"^[^练H%#&]{{0,2}}(?:练|H|%|#&){chapter}-?(\d+)",
                    cleaned,
                    re.I,
                )
                if not match:
                    continue
                number = int(match.group(1))
                if not 1 <= number <= EXPECTED_COUNTS[style][chapter]:
                    continue
                duplicate_key = (number, page_index)
                previous_y = last_candidates.get(duplicate_key)
                if previous_y is not None and abs(previous_y - y) < 45:
                    continue
                last_candidates[duplicate_key] = y
                has_answer_label = "答案" in cleaned[match.start(): match.end() + 8]
                if answer_mode and not has_answer_label:
                    continue
                is_answer = has_answer_label
                # Ignore labels such as "练 1-2 图" and "练 1-2 答图".
                tail = cleaned[match.end(): match.end() + 4]
                if "图" in tail and "答案" not in tail:
                    continue
            else:
                match = re.match(
                    rf"^[^【(（]{{0,4}}[【(（](?:题)?{chapter}[.]?(\d+)", text
                )
                if not match:
                    continue
                number = int(match.group(1))
                if not 1 <= number <= EXPECTED_COUNTS[style][chapter]:
                    continue
                duplicate_key = (number, page_index)
                previous_y = last_candidates.get(duplicate_key)
                if previous_y is not None and abs(previous_y - y) < 45:
                    continue
                last_candidates[duplicate_key] = y
                # Exercise/answer headings normally occur twice. This also
                # handles pages where the "参考答案" heading was not OCRed.
                is_answer = answer_mode or number in questions

            target = answers if is_answer else questions
            target.setdefault(number, (number, page_index, y))

    for (marker_style, marker_chapter, kind, number), (page, y) in MANUAL_MARKERS.items():
        if marker_style == style and marker_chapter == chapter:
            target = questions if kind == "Q" else answers
            target[number] = (number, page, y)

    by_position = lambda marker: (marker[1], marker[2])
    return (
        sorted(questions.values(), key=by_position),
        sorted(answers.values(), key=by_position),
    )


def slices_for(
    pages: list[Path],
    markers: list[tuple[int, int, int]],
    stop: tuple[int, int] | None = None,
    start_overrides: dict[int, tuple[int, int]] | None = None,
    end_overrides: dict[int, tuple[int, int]] | None = None,
) -> dict[int, list[Image.Image]]:
    result: dict[int, list[Image.Image]] = {}
    for index, (number, start_page, start_y) in enumerate(markers):
        if start_overrides and number in start_overrides:
            start_page, start_y = start_overrides[number]
        exact_end = bool(end_overrides and number in end_overrides)
        if exact_end:
            end_page, end_y = end_overrides[number]
        elif index + 1 < len(markers):
            _, end_page, end_y = markers[index + 1]
        elif stop:
            end_page, end_y = stop
        else:
            end_page, end_y = len(pages) - 1, 10**9

        # A marker near the top of the next page means the current item ended
        # on the previous page. Do not attach that page's header/blank margin
        # to the preceding item. Genuine continuations have no next marker
        # until after the page's body has started.
        slice_end_page = end_page
        slice_end_y = end_y
        if end_page > start_page:
            with Image.open(pages[end_page]) as next_page:
                if end_y < next_page.height * 0.25:
                    slice_end_page = end_page - 1
                    slice_end_y = 10**9

        pieces = []
        for page_index in range(start_page, slice_end_page + 1):
            with Image.open(pages[page_index]) as source:
                top = start_y if page_index == start_page else round(source.height * 0.035)
                if page_index == slice_end_page:
                    bottom = slice_end_y if exact_end else slice_end_y - 6
                else:
                    bottom = round(source.height * 0.965)
                top = max(0, top)
                bottom = min(source.height, bottom)
                if bottom - top < 8:
                    continue
                crop = source.crop((0, top, source.width, bottom))
                pieces.append(crop.copy())
        result[number] = pieces
    return result


def apply_manual_slice_masks(
    style: str, chapter: int, pieces_by_question: dict[int, list[Image.Image]]
) -> dict[int, list[Image.Image]]:
    for number, pieces in pieces_by_question.items():
        masks = {
            piece_index: regions
            for (mask_style, mask_chapter, mask_number, piece_index), regions in MANUAL_SLICE_MASKS.items()
            if (mask_style, mask_chapter, mask_number) == (style, chapter, number)
        }
        for piece_index, regions in masks.items():
            if not 1 <= piece_index <= len(pieces):
                continue
            image = pieces[piece_index - 1]
            draw = ImageDraw.Draw(image)
            fill = 255 if image.mode == "L" else "white"
            for x0, y0, x1, y1 in regions:
                draw.rectangle(
                    (
                        round(image.width * x0),
                        round(image.height * y0),
                        round(image.width * x1),
                        round(image.height * y1),
                    ),
                    fill=fill,
                )
    return pieces_by_question


def save_pieces(
    pieces: list[Image.Image], directory: Path, prefix: str
) -> list[str]:
    directory.mkdir(parents=True, exist_ok=True)
    keys = []
    for index, image in enumerate(pieces, 1):
        suffix = f".{index}"
        filename = f"{prefix}{suffix}.png"
        path = directory / filename
        image.save(path, optimize=True)
        keys.append(filename)
    return keys


def build_chapter(spec: BankSpec, chapter: int, name: str) -> tuple[dict, dict]:
    pdf = chapter_pdf(spec, chapter)
    work = TMP / spec.bank_id / f"{chapter:02d}"
    pages = render(pdf, work)
    questions, answers = detect_markers(spec.style, chapter, pages)
    q_numbers = [item[0] for item in questions]
    a_numbers = [item[0] for item in answers]
    expected_numbers = list(range(1, EXPECTED_COUNTS[spec.style][chapter] + 1))

    if not questions:
        raise RuntimeError(f"{spec.name} 第 {chapter} 章没有识别到题目")
    if q_numbers != expected_numbers:
        raise RuntimeError(
            f"{spec.name} 第 {chapter} 章题目边界不连续: {q_numbers}"
        )
    if a_numbers != expected_numbers:
        raise RuntimeError(
            f"{spec.name} 第 {chapter} 章答案边界不连续: {a_numbers}"
        )
    first_answer = min((page, y) for _, page, y in answers) if answers else None
    question_images = slices_for(
        pages,
        questions,
        first_answer,
        {
            number: override
            for (override_style, override_chapter, override_number), override in MANUAL_SLICE_STARTS.items()
            if (override_style, override_chapter) == (spec.style, chapter)
        },
        {
            number: override
            for (override_style, override_chapter, number), override in MANUAL_SLICE_ENDS.items()
            if (override_style, override_chapter) == (spec.style, chapter)
        },
    )
    question_images = apply_manual_slice_masks(spec.style, chapter, question_images)
    answer_images = slices_for(pages, answers)
    for (extra_style, extra_chapter, number), slices in MANUAL_EXTRA_ANSWER_SLICES.items():
        if (extra_style, extra_chapter) != (spec.style, chapter):
            continue
        for page_index, top, bottom in slices:
            with Image.open(pages[page_index]) as source:
                answer_images.setdefault(number, []).append(
                    source.crop((0, top, source.width, bottom)).copy()
                )

    bank_root = workspace_bank_path(spec.name)
    section_dir = bank_root / f"{chapter:02d} {name} 01-课后习题"
    section_dir.mkdir(parents=True, exist_ok=True)
    questions_json = []
    for number in sorted(set(q_numbers) | set(a_numbers)):
        q_pieces = question_images.get(number, [])
        a_pieces = answer_images.get(number, [])
        if not q_pieces:
            continue
        q_saved = save_pieces(
            q_pieces, section_dir, f"Q-{chapter:02d}-1-{number:02d}"
        )
        a_saved = save_pieces(
            a_pieces, section_dir, f"A-{chapter:02d}-1-{number:02d}"
        )
        question_id = f"{spec.bank_id}-{chapter:02d}-1-{number:02d}"
        questions_json.append({
            "id": question_id,
            "number": number,
            "type": "图片题",
            "text": "",
            "answer": "见答案图片" if a_saved else "讲义未附答案",
            "analysis": "原讲义参考答案" if a_saved else "",
            "imageKeys": [
                f"{question_id}/question/{i}-{filename}"
                for i, filename in enumerate(q_saved, 1)
            ],
            "answerImageKeys": [
                f"{question_id}/answer/{i}-{filename}"
                for i, filename in enumerate(a_saved, 1)
            ],
        })
    chapter_json = {
        "id": f"{spec.bank_id}-chapter-{chapter:02d}",
        "name": f"第{chapter}章 {name}",
        "sections": [{
            "id": f"{spec.bank_id}-chapter-{chapter:02d}-section-1",
            "name": "课后习题",
            "questions": questions_json,
        }],
    }
    audit = {
        "chapter": chapter,
        "name": name,
        "questionsDetected": q_numbers,
        "answersDetected": a_numbers,
        "questionsBuilt": len(questions_json),
        "missingAnswers": sorted(set(q_numbers) - set(a_numbers)),
        "answersWithoutQuestions": sorted(set(a_numbers) - set(q_numbers)),
    }
    return chapter_json, audit


def main() -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    audits = []
    built_banks = []
    for spec in SPECS:
        target = workspace_bank_path(spec.name)
        if target.exists():
            shutil.rmtree(target)
        jobs = [(spec, chapter, name) for chapter, name in spec.chapter_names.items()]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda args: build_chapter(*args), jobs))
        chapters = [result[0] for result in results]
        bank_audit = [result[1] for result in results]
        built_banks.append({
            "id": spec.bank_id,
            "name": spec.name,
            "description": "按原讲义章节整理的课后习题，保留公式、插图及参考答案原版排版。",
            "subject": spec.subject,
            "source": "builtin",
            "chapters": chapters,
        })
        audits.append({"bank": spec.name, "chapters": bank_audit})

    ids = {spec.bank_id for spec in SPECS}
    payload["banks"] = [bank for bank in payload["banks"] if bank["id"] not in ids]
    payload["banks"].extend(built_banks)
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat()
    MANIFEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    report = ROOT / "拆分" / "讲义课后习题题库审计.json"
    report.write_text(
        json.dumps(audits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for bank in built_banks:
        count = sum(
            len(section["questions"])
            for chapter in bank["chapters"]
            for section in chapter["sections"]
        )
        print(f"{bank['name']}: {count} 题")
    print(f"审计报告: {report}")


if __name__ == "__main__":
    main()
