#!/usr/bin/env python3
"""Replace section-wide 2005-2009 analysis images with per-question PDF crops."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

import pdfplumber

from crop_english_analysis_images import LINE_NUMBER, crop_between, find_anchors, page_lines


GROUPS = [
    (range(1, 21), 1, 6),
    # Reading questions form one monotonic sequence. Keeping four hard-coded
    # article ranges clipped Q34-Q35 and Q40 in editions where a section ends
    # one page later. Page 46 is the final reading-analysis page; Part B begins
    # cleanly on page 47 in these five PDFs.
    (range(21, 41), 7, 46),
    # 41-45 share one Part B analysis block and intentionally stay shared.
    (range(46, 51), 54, 59),
]
STRICT_LINE_NUMBER = re.compile(r"^\s*(?:[（(]\s*)?(\d{1,2})(?:\s*[）)])?\s*[.．、]\s+")


def scalar(pdf: pdfplumber.PDF, position: tuple[int, float]) -> float:
    page, top = position
    return page + top / float(pdf.pages[page].height)


def from_scalar(pdf: pdfplumber.PDF, value: float) -> tuple[int, float]:
    page = min(max(int(value), 0), len(pdf.pages) - 1)
    return page, (value - page) * float(pdf.pages[page].height)


def candidate_positions(pdf: pdfplumber.PDF) -> dict[int, list[tuple[int, float]]]:
    output: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for page_index, page in enumerate(pdf.pages):
        for top, _bottom, text in page_lines(page):
            match = STRICT_LINE_NUMBER.match(text)
            if match and 1 <= int(match.group(1)) <= 52:
                output[int(match.group(1))].append((page_index, top))
    return output


def english_words(text: str) -> list[str]:
    return re.findall(r"[a-z]+", re.sub(r"^\s*\d{1,2}\s*[.．、]?\s*", "", text).lower())


def stem_positions(
    pdf: pdfplumber.PDF,
    questions: dict[int, dict],
    numbers: range,
    first_page: int,
    last_page: int,
) -> dict[int, tuple[int, float]]:
    """Find real question headings from their English stem, not bare numbers.

    Analysis paragraphs frequently mention the next question number before its
    heading. Matching the first meaningful words of the stored stem prevents a
    boundary from landing inside the preceding explanation.
    """
    needles = {number: english_words(questions[number].get("text", ""))[:5] for number in numbers}
    matches: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for page_index in range(max(0, first_page - 1), min(last_page, len(pdf.pages))):
        page = pdf.pages[page_index]
        for number, needle in needles.items():
            if len(needle) < 4:
                continue
            # pdfplumber's layout-aware search follows text across words even
            # when the bilingual table splits the visual line into fragments.
            # Four leading words are distinctive enough and tolerate a damaged
            # later word such as "paragraph" in older scans.
            pattern = re.compile(r"\s+".join(re.escape(word) for word in needle[:4]), re.IGNORECASE)
            for found in page.search(pattern):
                if float(found["x0"]) < page.width * 0.58:
                    matches[number].append((page_index, float(found["top"])))
    return {number: min(positions, key=lambda position: scalar(pdf, position)) for number, positions in matches.items()}


def anchors_for_group(pdf: pdfplumber.PDF, candidates: dict[int, list[tuple[int, float]]], numbers: range, first_page: int, last_page: int, preferred: dict[int, tuple[int, float]] | None = None) -> dict[int, tuple[int, float]]:
    lower = first_page - 1.0
    upper = float(last_page)
    chosen: dict[int, float] = {
        number: scalar(pdf, position)
        for number, position in (preferred or {}).items()
        if number in numbers and lower <= scalar(pdf, position) < upper
    }
    if preferred is not None:
        # Fill headings whose stem was too damaged to match from numbered
        # candidates, but constrain them between the nearest verified stems.
        ordered_numbers = list(numbers)
        for index, number in enumerate(ordered_numbers):
            if number in chosen:
                continue
            left = max((chosen[value] for value in ordered_numbers[:index] if value in chosen), default=lower)
            right = min((chosen[value] for value in ordered_numbers[index + 1:] if value in chosen), default=upper)
            values = [
                scalar(pdf, position)
                for position in candidates.get(number, [])
                if left + 0.01 < scalar(pdf, position) < right - 0.01
            ]
            if values:
                chosen[number] = min(values)
    else:
        raw = [
            (number, min(values))
            for number in numbers
            if (values := [scalar(pdf, position) for position in candidates.get(number, []) if lower <= scalar(pdf, position) < upper])
        ]
        # Keep the longest increasing sequence of detected labels. A stray
        # reference such as "37 题考查…" must not move Q37 behind Q38.
        lengths = [1] * len(raw)
        previous_indexes = [-1] * len(raw)
        for index in range(len(raw)):
            for prior in range(index):
                if raw[prior][1] + 0.035 < raw[index][1] and lengths[prior] + 1 > lengths[index]:
                    lengths[index] = lengths[prior] + 1
                    previous_indexes[index] = prior
        if raw:
            cursor = max(range(len(raw)), key=lambda index: lengths[index])
            keep = []
            while cursor >= 0:
                keep.append(raw[cursor])
                cursor = previous_indexes[cursor]
            chosen.update(reversed(keep))

    # Interpolate only missing boundaries; the rendered content still comes from
    # the original PDF and no recognized text is stored or shown.
    ordered_numbers = list(numbers)
    for index, number in enumerate(ordered_numbers):
        if number in chosen:
            continue
        left_index = next((i for i in range(index - 1, -1, -1) if ordered_numbers[i] in chosen), None)
        right_index = next((i for i in range(index + 1, len(ordered_numbers)) if ordered_numbers[i] in chosen), None)
        left_value = chosen[ordered_numbers[left_index]] if left_index is not None else lower
        right_value = chosen[ordered_numbers[right_index]] if right_index is not None else upper
        left_number_index = left_index if left_index is not None else -1
        right_number_index = right_index if right_index is not None else len(ordered_numbers)
        fraction = (index - left_number_index) / (right_number_index - left_number_index)
        chosen[number] = left_value + (right_value - left_value) * fraction
    return {number: from_scalar(pdf, chosen[number]) for number in ordered_numbers}


def url(year: int, filename: str) -> str:
    relative = f"英语一真题/{year}年考研英语真题/资源/{filename}"
    return f"/api/default-workspace/file?path={quote(relative, safe='')}"


def first_marker_between(
    pdf: pdfplumber.PDF,
    pattern: re.Pattern[str],
    start: tuple[int, float],
    end: tuple[int, float],
) -> tuple[int, float] | None:
    matches: list[tuple[int, float]] = []
    for page_index in range(start[0], end[0] + 1):
        for found in pdf.pages[page_index].search(pattern):
            position = (page_index, float(found["top"]))
            if scalar(pdf, start) < scalar(pdf, position) < scalar(pdf, end):
                matches.append(position)
    return min(matches, key=lambda position: scalar(pdf, position)) if matches else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("default_root", type=Path, nargs="?", default=Path("默认题库"))
    args = parser.parse_args()
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    bank = next(bank for bank in payload["banks"] if bank["id"] == "english-exams")
    chapters = {int(chapter["id"].rsplit("-", 1)[1]): chapter for chapter in bank["chapters"]}

    for year in range(2005, 2010):
        chapter = chapters[year]
        questions = {q["number"]: q for section in chapter["sections"] for q in section["questions"]}
        resource_dir = args.default_root / "英语一真题" / f"{year}年考研英语真题" / "资源"
        source = args.analysis_dir / f"{year}年考研英语真题解析.pdf"
        with pdfplumber.open(source) as pdf:
            candidates = candidate_positions(pdf)
            preferred = find_anchors(pdf)
            for numbers, first_page, last_page in GROUPS:
                anchors = anchors_for_group(
                    pdf,
                    candidates,
                    numbers,
                    first_page,
                    last_page,
                    preferred if numbers.start == 1 else None,
                )
                ordered = list(numbers)
                # crop_between reserves 12 pt before a real following anchor.
                # At document/section end, offset that reserve so only the
                # intended 4 pt physical page edge is removed.
                group_end = (min(last_page, len(pdf.pages)) - 1, pdf.pages[min(last_page, len(pdf.pages)) - 1].height + 8)
                for index, number in enumerate(ordered):
                    start = anchors[number]
                    end = anchors[ordered[index + 1]] if index + 1 < len(ordered) else group_end
                    if numbers.start == 21 and number in (25, 30, 35):
                        next_text = number // 5 - 3
                        marker = first_marker_between(
                            pdf,
                            re.compile(rf"\bText\s*{next_text}\b", re.IGNORECASE),
                            start,
                            end,
                        )
                        if marker:
                            end = marker
                    if scalar(pdf, end) - scalar(pdf, start) < 0.04:
                        end = from_scalar(pdf, min(scalar(pdf, start) + 0.08, float(last_page) - 0.01))
                    filename = f"analysis-{year}-q{number:02d}.webp"
                    image = crop_between(pdf, start, end, 125)
                    image.save(resource_dir / filename, "WEBP", quality=84, method=6)
                    questions[number]["answerImageUrl"] = url(year, filename)

            writing = preferred
            if 51 in writing and 52 in writing and scalar(pdf, writing[52]) > scalar(pdf, writing[51]) + 0.02:
                end = writing[52]
                for number, start, finish in ((51, writing[51], end), (52, end, (len(pdf.pages) - 1, pdf.pages[-1].height + 8))):
                    filename = f"analysis-{year}-q{number:02d}.webp"
                    crop_between(pdf, start, finish, 125).save(resource_dir / filename, "WEBP", quality=84, method=6)
                    questions[number]["answerImageUrl"] = url(year, filename)
        print(f"{year}: per-question crops attached", flush=True)

    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
