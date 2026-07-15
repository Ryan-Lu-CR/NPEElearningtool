#!/usr/bin/env python3
"""Create faithful per-question crops from the supplied 2010-2024 analysis PDFs.

OCR is used only to locate question-number boundaries. The assets themselves are
direct crops of the rendered PDF pages; no OCR text is stored in the question bank.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import shutil
import subprocess
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

import pdfplumber
from PIL import Image, ImageChops


NUMBER_TOKEN = re.compile(r"^\s*([（(]?)\s*(\d{1,2})\s*([.．、,，)）])\s*$")
OPTION_TOKEN = re.compile(r"(?:\[|\(|C)?[ABCD](?:\]|\))", re.IGNORECASE)


@dataclass(frozen=True, order=True)
class Anchor:
    page: int
    y: int


def command_path(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"Missing required command: {name}")
    return path


def render_pdf(pdf: Path, output_dir: Path, dpi: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(output_dir.glob("page-*.png"))
    if existing:
        return existing
    subprocess.run(
        [command_path("pdftoppm"), "-r", str(dpi), "-gray", "-png", str(pdf), str(output_dir / "page")],
        check=True,
    )
    return sorted(output_dir.glob("page-*.png"))


def ocr_page(path: Path, psm: str = "3") -> tuple[int, list[tuple[int, int, str, str]], list[tuple[int, int, str]], list[tuple[int, str]]]:
    completed = subprocess.run(
        [command_path("tesseract"), str(path), "stdout", "-l", "eng", "--psm", psm, "tsv"],
        check=True,
        capture_output=True,
        text=True,
    )
    # Tesseract TSV is not RFC CSV: quote characters are ordinary OCR text.
    # Disabling CSV quoting prevents one stray quote from swallowing the rest
    # of a page and hiding later question numbers.
    rows = list(csv.DictReader(io.StringIO(completed.stdout), delimiter="\t", quoting=csv.QUOTE_NONE))
    lines: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if (row.get("text") or "").strip():
            lines[(row["block_num"], row["par_num"], row["line_num"])].append(row)

    width, height = Image.open(path).size
    candidates: list[tuple[int, int, str, str]] = []
    option_rows: list[tuple[int, int, str]] = []
    section_markers: list[tuple[int, str]] = []
    for line_rows in lines.values():
        line_rows.sort(key=lambda row: int(row["left"] or 0))
        line_text = " ".join((row.get("text") or "").strip() for row in line_rows)
        has_options = len(OPTION_TOKEN.findall(line_text)) >= 1
        line_top = min(int(row["top"] or 0) for row in line_rows)
        if re.search(
            r"\b(?:Section\s*(?:II|III)|Reading\s+Comprehension|P(?:art|ast|eet|et)\s*[ABC]|Text\s*[234]|Writing)\b",
            line_text,
            re.IGNORECASE,
        ):
            section_markers.append((line_top, line_text))
        first_row = line_rows[0]
        first_left = int(first_row["left"] or width)
        first_text = (first_row.get("text") or "").strip()
        first_number = re.match(r"^[（(]?\s*(\d{1,2})\s*[.．、,，)）]", first_text)
        if has_options and first_left < width * 0.13 and first_number and 1 <= int(first_number.group(1)) <= 52:
            option_rows.append((int(first_number.group(1)), line_top, line_text))
        for row in line_rows:
            token = (row.get("text") or "").strip()
            match = NUMBER_TOKEN.match(token)
            if not match:
                continue
            number = int(match.group(2))
            left = int(row["left"] or width)
            top = int(row["top"] or 0)
            token_height = int(row["height"] or 0)
            parenthesized = bool(match.group(1)) or match.group(3) in ")）"
            left_limit = width * 0.9 if parenthesized and 46 <= number <= 50 else width * 0.13
            if not (1 <= number <= 52 and left < left_limit and top < height * 0.95 and token_height >= 8):
                continue
            candidates.append((number, top, line_text, token))
        # Translation answer rows are often fused as "(47)but" rather than
        # yielding a standalone number token, so also inspect the full line.
        prefix = re.match(r"^\s*[（(]?\s*(\d{1,2})\s*[.．、,，)）]", line_text)
        if prefix and 1 <= int(prefix.group(1)) <= 52:
            prefix_number = int(prefix.group(1))
            left_limit = width * 0.9 if 46 <= prefix_number <= 50 and first_text.startswith(("(", "（")) else width * 0.16
            if first_left < left_limit:
                candidates.append((prefix_number, line_top, line_text, first_text))
    page_number = int(path.stem.rsplit("-", 1)[1]) - 1
    return page_number, candidates, option_rows, section_markers


def text_layer_data(pdf_path: Path, dpi: int) -> tuple[list[tuple[int, Anchor, str, str]], list[tuple[Anchor, str]]]:
    candidates: list[tuple[int, Anchor, str, str]] = []
    markers: list[tuple[Anchor, str]] = []
    scale = dpi / 72
    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            grouped: dict[float, list[dict]] = defaultdict(list)
            for word in page.extract_words(x_tolerance=2, y_tolerance=3):
                grouped[round(float(word["top"]), 1)].append(word)
            for top, words in grouped.items():
                words.sort(key=lambda word: float(word["x0"]))
                line = " ".join(str(word["text"]) for word in words)
                anchor = Anchor(page_index, round(top * scale))
                if re.search(
                    r"\b(?:Section\s*(?:II|III)|Reading\s+Comprehension|Part\s*[ABC]|Text\s*[234]|Writing)\b",
                    line,
                    re.IGNORECASE,
                ):
                    markers.append((anchor, line))
                match = re.match(r"^\s*[（(]?\s*(\d{1,2})\s*[.．、,，)）]", line)
                if match and float(words[0]["x0"]) < page.width * 0.2:
                    number = int(match.group(1))
                    if 1 <= number <= 52:
                        candidates.append((number, anchor, line, "text-layer"))
    return candidates, markers


def find_anchors(
    pages: list[Path], workers: int, pdf_path: Path, dpi: int, secondary_ocr: bool
) -> tuple[dict[int, Anchor], dict[int, Anchor], Anchor | None, list[dict[str, object]]]:
    all_candidates: dict[int, list[tuple[Anchor, str, str]]] = defaultdict(list)
    option_rows: list[tuple[int, Anchor, str]] = []
    section_markers: list[tuple[Anchor, str]] = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        for page, candidates, page_option_rows, page_markers in executor.map(ocr_page, pages):
            for number, y, line, token in candidates:
                all_candidates[number].append((Anchor(page, y), line, token))
            option_rows.extend((number, Anchor(page, y), line) for number, y, line in page_option_rows)
            section_markers.extend((Anchor(page, y), line) for y, line in page_markers)
    if secondary_ocr:
        for mode in ("6", "11"):
            with ThreadPoolExecutor(max_workers=workers) as executor:
                for page, candidates, _page_option_rows, page_markers in executor.map(lambda path: ocr_page(path, mode), pages):
                    for number, y, line, token in candidates:
                        all_candidates[number].append((Anchor(page, y), line, f"psm{mode}:{token}"))
                    section_markers.extend((Anchor(page, y), line) for y, line in page_markers)
    text_candidates, text_markers = text_layer_data(pdf_path, dpi)
    for number, anchor, line, token in text_candidates:
        all_candidates[number].append((anchor, line, token))
    section_markers.extend(text_markers)

    selected: dict[int, Anchor] = {}
    ends: dict[int, Anchor] = {}
    audit: list[dict[str, object]] = []

    # Cloze answer rows include the choices on the same line. Prefer an exact
    # digit match; if a digit is misread, use the last option row before the
    # next exact question number.
    ordered_options = sorted(option_rows, key=lambda item: item[1])
    previous = Anchor(-1, -1)
    for number in range(1, 21):
        exact = [item for item in ordered_options if item[0] == number and item[1] > previous]
        next_exact = [item for item in ordered_options if item[0] == number + 1 and item[1] > previous]
        if exact and (not next_exact or min(exact, key=lambda item: item[1])[1] < min(next_exact, key=lambda item: item[1])[1]):
            recognized, anchor, line = min(exact, key=lambda item: item[1])
        else:
            future = [item for item in ordered_options if item[0] > number and item[1] > previous]
            boundary = min(future, key=lambda item: item[1])[1] if future else Anchor(10**6, 10**6)
            between = [item for item in ordered_options if previous < item[1] < boundary]
            if not between:
                continue
            recognized, anchor, line = max(between, key=lambda item: item[1])
        selected[number] = anchor
        previous = anchor
        audit.append({"number": number, "page": anchor.page + 1, "y": anchor.y, "token": f"option-row:{recognized}", "line": line[:180]})

    # Answer-only PDFs and some later layouts do not place all cloze options
    # on one row. Fill any gaps from explicit, monotonic question numbers.
    previous = Anchor(-1, -1)
    for number in range(1, 21):
        if number in selected and selected[number] > previous:
            previous = selected[number]
            continue
        upper = min((selected[n] for n in range(number + 1, 21) if n in selected), default=Anchor(10**6, 10**6))
        exact = [item for item in all_candidates[number] if previous < item[0] < upper]
        if exact:
            anchor, line, token = min(exact, key=lambda item: item[0])
            selected[number] = anchor
            previous = anchor
            audit.append({"number": number, "page": anchor.page + 1, "y": anchor.y, "token": token, "line": line[:180]})

    # Validate cloze anchors as one monotonic 1-20 sequence before reading
    # question 21. This rejects distant false matches (for example a numbered
    # vocabulary list near the end of the book) while allowing one OCR-missed
    # digit to be supplied by the option-row method above.
    upper_candidates = [item[0] for item in all_candidates[21]]
    cloze_upper = min(upper_candidates) if upper_candidates else Anchor(10**6, 10**6)
    exact_positions = {
        number: sorted({item[0] for item in all_candidates[number] if item[0] < cloze_upper})
        for number in range(1, 21)
    }

    @lru_cache(maxsize=None)
    def best_chain(number: int, previous_anchor: Anchor) -> tuple[Anchor | None, ...]:
        if number == 21:
            return ()
        choices = [(None,) + best_chain(number + 1, previous_anchor)]
        for anchor in exact_positions[number]:
            if anchor > previous_anchor:
                choices.append((anchor,) + best_chain(number + 1, anchor))

        def rank(chain: tuple[Anchor | None, ...]) -> tuple[int, tuple[tuple[int, int], ...]]:
            count = sum(anchor is not None for anchor in chain)
            positions = tuple((anchor.page, anchor.y) if anchor else (10**6, 10**6) for anchor in chain)
            return count, tuple((-page, -y) for page, y in positions)

        return max(choices, key=rank)

    exact_chain = best_chain(1, Anchor(-1, -1))
    option_selection = {number: selected.get(number) for number in range(1, 21)}
    for number, anchor in enumerate(exact_chain, start=1):
        if anchor is not None:
            selected[number] = anchor
    for number, anchor in option_selection.items():
        if number in selected or anchor is None:
            continue
        lower = max((selected[n] for n in range(1, number) if n in selected), default=Anchor(-1, -1))
        upper = min((selected[n] for n in range(number + 1, 21) if n in selected), default=cloze_upper)
        if lower < anchor < upper:
            selected[number] = anchor

    if sum(number in selected for number in range(1, 21)) < 20:
        boxed = dark_number_boxes(pages, cloze_upper)
        if len(boxed) >= 20:
            for number, anchor in enumerate(boxed[:20], start=1):
                selected[number] = anchor
                audit.append({
                    "number": number,
                    "page": anchor.page + 1,
                    "y": anchor.y,
                    "token": "gray-number-box",
                    "line": "gray question-number label",
                })

    # Reading questions have reliable explicit 21-40 prefixes even when their
    # options wrap onto following lines.
    previous = selected.get(20, Anchor(-1, -1))
    for number in range(21, 41):
        later = [item for item in all_candidates[number] if item[0] > previous]
        if not later:
            continue
        anchor, line, token = min(later, key=lambda item: item[0])
        selected[number] = anchor
        previous = anchor
        audit.append({"number": number, "page": anchor.page + 1, "y": anchor.y, "token": token, "line": line[:180]})

    # The cloze explanation is often followed by a complete copy of Section II
    # before the first reading answer. Stop question 20 at that section heading,
    # otherwise its crop incorrectly contains the next article in full.
    if 20 in selected and 21 in selected:
        reading_markers = [
            item
            for item in section_markers
            if selected[20] < item[0] < selected[21]
            and re.search(r"\b(?:Section\s*II|Reading\s+Comprehension|Part\s*A)\b", item[1], re.IGNORECASE)
        ]
        if reading_markers:
            ends[20] = min(reading_markers, key=lambda item: item[0])[0]

    # Do not append the next article to the final question of Text 1/2/3.
    # The following question still starts at its own verified heading, leaving
    # the intervening source passage for the dedicated original-text section.
    for number, next_text in ((25, 2), (30, 3), (35, 4)):
        if number not in selected or number + 1 not in selected:
            continue
        markers = [
            item
            for item in section_markers
            if selected[number] < item[0] < selected[number + 1]
            and len(item[1]) < 100
            and re.search(rf"\bText\s*{next_text}\b", item[1], re.IGNORECASE)
        ]
        if markers:
            ends[number] = min(markers, key=lambda item: item[0])[0]

    if 40 in selected:
        part_b = [
            item
            for item in section_markers
            if item[0] > selected[40]
            and re.search(r"\bP(?:art|ast|eet|et)\s*B\b", item[1], re.IGNORECASE)
        ]
        part_c = [item for item in section_markers if item[0] > selected[40] and re.search(r"\bPart\s*C\b", item[1], re.IGNORECASE)]
        first_q46 = min(
            (item[0] for item in all_candidates[46] if item[0] > selected[40]),
            default=Anchor(10**6, 10**6),
        )
        upper = min(min((item[0] for item in part_c), default=Anchor(10**6, 10**6)), first_q46)
        usable = [item for item in part_b if item[0] < upper]
        q41 = [item for item in all_candidates[41] if selected[40] < item[0] < upper]
        # Part B is one coupled five-question unit. Its answer key may put all
        # five numbers on the final line, so begin at the Part B heading when
        # available instead of producing a tiny answer-line-only crop.
        if usable:
            anchor, line = min(usable, key=lambda item: item[0])
            selected[41] = anchor
            audit.append({"number": 41, "page": anchor.page + 1, "y": anchor.y, "token": "Part B", "line": line[:180]})
        elif q41:
            anchor, line, token = min(q41, key=lambda item: item[0])
            selected[41] = anchor
            audit.append({"number": 41, "page": anchor.page + 1, "y": anchor.y, "token": token, "line": line[:180]})

    # Translation pages show each number once beside the source excerpt and
    # again at the beginning of the detailed analysis. The last occurrence
    # before the next number is the desired start; the first next-number
    # occurrence is the desired end.
    previous = selected.get(41, selected.get(40, Anchor(-1, -1)))
    part_c_markers = [item for item in section_markers if item[0] > previous and re.search(r"\bPart\s*C\b", item[1], re.IGNORECASE)]
    if part_c_markers:
        ends[41] = min(part_c_markers, key=lambda item: item[0])[0]
    else:
        first_translation = sorted(item for item in all_candidates[46] if item[0] > previous)
        if first_translation:
            ends[41] = first_translation[0][0]
    for number in range(46, 51):
        current = sorted(item for item in all_candidates[number] if item[0] > previous)
        if not current:
            continue
        if number < 50:
            next_occurrences = sorted(item for item in all_candidates[number + 1] if item[0] > current[0][0])
            boundary = next_occurrences[0][0] if next_occurrences else None
            before_next = [item for item in current if boundary is None or item[0] < boundary]
            anchor, line, token = max(before_next, key=lambda item: item[0])
            if boundary:
                ends[number] = boundary
        else:
            anchor, line, token = max(current, key=lambda item: item[0])
        selected[number] = anchor
        previous = anchor
        audit.append({"number": number, "page": anchor.page + 1, "y": anchor.y, "token": token, "line": line[:180]})

    writing_start = None
    if 50 in selected:
        later_markers = [item for item in section_markers if item[0] > selected[50]]
        if later_markers:
            writing_start = min(later_markers, key=lambda item: item[0])[0]
    return selected, ends, writing_start, audit


def trim_white(image: Image.Image, padding: int = 18) -> Image.Image:
    rgb = image.convert("RGB")
    background = Image.new("RGB", rgb.size, "white")
    difference = ImageChops.difference(rgb, background).convert("L").point(lambda value: 255 if value > 12 else 0)
    box = difference.getbbox()
    if not box:
        return rgb
    top = max(0, box[1] - padding)
    bottom = min(rgb.height, box[3] + padding)
    # Vertical trimming keeps question crops compact, but horizontal trimming
    # is deliberately disabled: the image must retain the PDF's full width.
    return rgb.crop((0, top, rgb.width, bottom))


def crop_between(pages: list[Path], start: Anchor, end: Anchor) -> Image.Image:
    pieces: list[Image.Image] = []
    for page_index in range(start.page, end.page + 1):
        image = Image.open(pages[page_index]).convert("RGB")
        # Preserve almost the full intermediate scan.  A 24 px margin is wide
        # enough to cut a skewed final text line even though it looks like
        # whitespace on the opposite side of the page.
        top = max(4, start.y - 18) if page_index == start.page else 4
        bottom = min(image.height - 4, end.y - 18) if page_index == end.page else image.height - 4
        if bottom <= top + 10:
            continue
        pieces.append(image.crop((0, top, image.width, bottom)))
    if not pieces:
        raise ValueError(f"Empty crop: {start} -> {end}")
    width = max(piece.width for piece in pieces)
    canvas = Image.new("RGB", (width, sum(piece.height for piece in pieces) + 10 * (len(pieces) - 1)), "white")
    y = 0
    for piece in pieces:
        canvas.paste(piece, (0, y))
        y += piece.height + 10
    return trim_white(canvas)


def dark_number_boxes(pages: list[Path], upper: Anchor) -> list[Anchor]:
    """Locate later-edition question labels printed as pale digits in gray boxes."""
    anchors: list[Anchor] = []
    for page_index, path in enumerate(pages):
        if page_index == 0 or page_index > upper.page:
            continue
        image = Image.open(path).convert("L")
        left = max(0, round(image.width * 0.01))
        right = max(left + 46, round(image.width * 0.16))
        window = max(32, round(image.width * 0.04))
        final_y = upper.y if page_index == upper.page else round(image.height * 0.985)
        active: list[int] = []
        page_bands: list[tuple[int, int]] = []
        for y in range(30, final_y):
            values = [1 if image.getpixel((x, y)) < 205 else 0 for x in range(left, right)]
            rolling = sum(values[:window])
            darkest_window = rolling
            for x in range(window, len(values)):
                rolling += values[x] - values[x - window]
                darkest_window = max(darkest_window, rolling)
            if darkest_window >= window * 0.66:
                active.append(y)
            elif active:
                if active[-1] - active[0] >= 25:
                    page_bands.append((active[0], active[-1]))
                active = []
        if active and active[-1] - active[0] >= 25:
            page_bands.append((active[0], active[-1]))
        merged: list[tuple[int, int]] = []
        for band in page_bands:
            if merged and band[0] - merged[-1][1] <= 10:
                merged[-1] = (merged[-1][0], band[1])
            else:
                merged.append(band)
        anchors.extend(Anchor(page_index, start) for start, end in merged if end - start >= 40)
    return anchors


def question_map(bank: dict) -> dict[int, dict]:
    return {
        question["number"]: question
        for section in bank["sections"]
        for question in section["questions"]
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bank_json", type=Path)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("default_root", type=Path)
    parser.add_argument("--temp-root", type=Path, default=Path("tmp/pdfs/english-analysis-ocr"))
    parser.add_argument("--dpi", type=int, default=160)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--secondary-ocr", action="store_true")
    parser.add_argument("--years", default="2010-2024")
    args = parser.parse_args()

    if "-" in args.years:
        first, last = map(int, args.years.split("-", 1))
        years = range(first, last + 1)
    else:
        years = [int(value) for value in args.years.split(",")]

    payload = json.loads(args.bank_json.read_text(encoding="utf-8"))
    consolidated = next(bank for bank in payload["banks"] if bank.get("id") == "english-exams")
    chapters = {
        int(chapter["id"].rsplit("-", 1)[1]): chapter
        for chapter in consolidated["chapters"]
        if re.fullmatch(r"english-exams-20\d{2}", chapter["id"])
    }
    report: dict[int, dict[str, object]] = {}

    for year in years:
        pdf = args.analysis_dir / f"{year}年考研英语一真题解析.pdf"
        pages = render_pdf(pdf, args.temp_root / str(year), args.dpi)
        anchors, translation_ends, writing_start, audit = find_anchors(
            pages, args.workers, pdf, args.dpi, args.secondary_ocr
        )
        # Part B is a coupled five-question item and may lack a literal "41"
        # heading. When absent, keep its already generated complete shared crop.
        required = [*range(1, 41), *range(46, 51)]
        missing = [number for number in required if number not in anchors]
        report[year] = {"pages": len(pages), "anchors": audit, "missing": missing}
        print(json.dumps({"year": year, "pages": len(pages), "found": len(anchors), "missing": missing}), flush=True)
        if missing:
            continue

        chapter = chapters[year]
        questions = question_map(chapter)
        asset_dir = args.default_root / "英语一真题" / chapter["name"] / "资源"
        asset_dir.mkdir(parents=True, exist_ok=True)

        # Questions 1-40 are independent. Part B (41-45) is one coupled item,
        # so all five deliberately share the complete 41-to-46 crop.
        ranges: dict[int, tuple[Anchor, Anchor]] = {
            number: (anchors[number], translation_ends.get(number, anchors[number + 1]))
            for number in range(1, 40)
        }
        ranges[20] = (anchors[20], translation_ends.get(20, anchors[21]))
        ranges[40] = (anchors[40], anchors.get(41, translation_ends.get(41, anchors[46])))
        if 41 in anchors:
            for number in range(41, 46):
                ranges[number] = (anchors[41], translation_ends.get(41, anchors[46]))
        for number in range(46, 50):
            ranges[number] = (anchors[number], translation_ends.get(number, anchors[number + 1]))
        # Prefer the writing-section boundary; only fall back to document end.
        last_image = Image.open(pages[-1])
        # crop_between keeps an 18 px safety gap before a following anchor.
        # Compensate when the physical document end itself is the boundary.
        ranges[50] = (anchors[50], writing_start or Anchor(len(pages) - 1, last_image.height + 14))

        generated: dict[tuple[Anchor, Anchor], str] = {}
        for number, bounds in ranges.items():
            filename = generated.get(bounds)
            if not filename:
                suffix = "part-b-complete" if 41 <= number <= 45 else f"q{number:02d}"
                filename = f"analysis-{year}-{suffix}.webp"
                crop_between(pages, *bounds).save(asset_dir / filename, "WEBP", quality=86, method=6)
                generated[bounds] = filename
            relative = f"英语一真题/{chapter['name']}/资源/{filename}"
            questions[number]["answerImageUrl"] = f"/api/default-workspace/file?path={quote(relative, safe='')}"

    args.bank_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_path = args.temp_root / "report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
