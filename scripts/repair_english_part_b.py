#!/usr/bin/env python3
"""Repair English I Part B using each year's actual exam structure.

Part B is not one uniform question type: it alternates among sentence insertion,
paragraph ordering, subheading matching and viewpoint matching.  This script keeps
those layouts distinct and prevents Part C translation text from becoming Part B's
source passage.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import build_english_exam_bank as legacy


PART_B_KIND = {
    **{year: "sentence" for year in (2005, 2006, 2008, 2009, 2012, 2013, 2015, 2021)},
    **{year: "ordering" for year in (2010, 2011, 2014, 2017, 2018, 2019, 2023)},
    **{year: "subheading" for year in (2007, 2016, 2020, 2022)},
    2024: "viewpoint",
}

KIND_NAMES = {
    "sentence": "Part B 选句填空",
    "ordering": "Part B 段落排序",
    "subheading": "Part B 小标题匹配",
    "viewpoint": "Part B 观点匹配",
}

QUESTION_TEXT = {
    "sentence": lambda number: f"选择填入空白（{number}）的句子。",
    "ordering": lambda number: f"选择应放在第 {number} 空位置的段落。",
    "subheading": lambda number: f"为第 {number} 段选择最合适的小标题。",
    "viewpoint": lambda number: f"为第 {number} 位发言者选择最匹配的观点。",
}

PASSAGE_AFTER_OPTIONS = {
    2007: "How Can a Parent Help?",
    2016: "No matter how formal or informal the work environment",
    2020: "In a social situation",
}

ORDERING_SEQUENCES = {
    2010: "41 → 42 → 43 → 44 → E → 45",
    2011: "G → 41 → 42 → E → 43 → 44 → 45",
    2014: "41 → A → 42 → E → 43 → 44 → 45",
    2017: "D → 41 → 42 → 43 → 44 → B → 45",
    2018: "41 → C → 42 → 43 → F → 44 → 45",
    2019: "41 → 42 → F → 43 → 44 → C → 45",
    2023: "41 → A → 42 → E → 43 → H → 44 → 45",
}

VIEWPOINT_NAMES = {41: "Hannah", 42: "Buck", 43: "Sara", 44: "Victor", 45: "Julia"}

SCAN_PASSAGE_IMAGES = {
    2020: ["/builtin-english/part-b-2020-12.jpg", "/builtin-english/part-b-2020-13.jpg"],
    2021: ["/builtin-english/part-b-2021-12.jpg", "/builtin-english/part-b-2021-13.jpg"],
}

# The 2023 paper is image-only in the supplied standalone PDF.  A-G were already
# recovered from the combined paper; H is a fixed paragraph printed in the frame.
Y2023_OPTION_H = (
    "H. Perhaps most importantly, the images provided documentary evidence that later "
    "made its way to government officials. Weeks after completing the expedition, Hayden "
    "collected his team's observations into an extensive report aimed at convincing Senators "
    "and Representatives, along with colleagues at government agencies like the Department "
    "of the Interior, that Yellowstone ought to be preserved."
)

# Crops produced from Q13/Q14/Q39/Q40 anchors must never be shown as Q41-Q45 analysis.
INVALID_CROP_YEARS = set(range(2010, 2020)) | {2021, 2022, 2023}


def normalize(text: str) -> str:
    text = legacy.clean(text)
    for old, new in {
        "SectionIUseofEnglish": "Section I Use of English",
        "SectionIIReadingComprehension": "Section II Reading Comprehension",
        "SectionIIIWriting": "Section III Writing",
        "UseofEnglish": "Use of English", "ReadingComprehension": "Reading Comprehension",
        "PartA": "Part A", "PartB": "Part B", "PartC": "Part C",
    }.items():
        text = text.replace(old, new)
    text = re.sub(
        r"Section\s*[ⅠⅡⅢ]",
        lambda match: {"Ⅰ": "Section I", "Ⅱ": "Section II", "Ⅲ": "Section III"}[match.group()[-1]],
        text,
    )
    return text


def paper_path(year: int) -> Path:
    if year < 2010:
        return Path("TEMP") / f"{year}年考研英语真题.pdf"
    return Path("TEMP/03、2010-2024年考研英语真题+解析/2010-2024考研英语真题") / f"{year}年考研英语一真题.pdf"


def part_b_block(year: int) -> str:
    path = paper_path(year)
    if not path.exists():
        return ""
    text = normalize(legacy.extract_pdf_text(path))
    section_two = text.find("Section II Reading Comprehension")
    part_a = text.find("Part A", section_two)
    start = text.find("Part B", part_a)
    end = text.find("Part C", start)
    return text[start:end] if start >= 0 and end > start else ""


def body_start(block: str) -> int:
    match = re.search(r"\(\s*(?:10|[l1][o0])\s*points?\s*\)", block, flags=re.I)
    return match.end() if match else 0


def first_a(block: str, start: int = 0) -> int:
    match = re.search(r"(?m)^\s*(?:\[\s*A\s*\]|A\s*[.\uff0e]\s+)", block[start:])
    return start + match.start() if match else -1


def strip_ordering_chain(option: str) -> str:
    return re.sub(
        r"\s+(?:[A-H]\s*→\s*)?41\.?\s*→[\s\S]*?45\.?\s*$",
        "",
        option,
    ).strip()


def extract_content(year: int, kind: str, current_options: list[str]) -> tuple[list[str], str]:
    # The combined source already recovered ordering paragraphs more cleanly than
    # several standalone PDFs whose option labels OCR as [BJ/[q.  Keep those
    # paragraphs, remove the printed sequence suffix, and add 2023's fixed H.
    if kind == "ordering":
        options = [strip_ordering_chain(option) for option in current_options]
        if year == 2023 and not any(option.startswith("H.") for option in options):
            options.append(Y2023_OPTION_H)
        return options, ""

    block = part_b_block(year)
    if not block:
        options = list(current_options)
        if year == 2023 and not any(option.startswith("H.") for option in options):
            options.append(Y2023_OPTION_H)
        return options, ""

    start = body_start(block)
    marker = PASSAGE_AFTER_OPTIONS.get(year)
    letters = "ABCDEFGH" if year == 2023 else "ABCDEFG"

    if marker:
        marker_at = block.find(marker, start)
        passage = legacy.clean_passage(block[marker_at:]) if marker_at >= 0 else ""
        if year == 2020:
            passage = re.sub(r"\by\b", "", passage)
            for bad, good in {
                "e e": "eye", "E e": "Eye", " ou ": " you ", " pa ing": " paying",
                "friendl ": "friendly ", " wa ": " way ", "Personalit ": "Personality ",
            }.items():
                passage = passage.replace(bad, good)
            passage = re.sub(r"\s{2,}", " ", passage)
        return list(current_options), passage

    option_start = first_a(block, start)
    if option_start < 0:
        return list(current_options), ""

    if kind in {"sentence", "subheading", "viewpoint"}:
        passage = legacy.clean_passage(block[start:option_start])
        options = legacy.options_from(block[option_start:], letters)
        if len(options) != len(letters):
            options = list(current_options)
        return options, passage

    options = legacy.options_from(block[option_start:], letters)
    return [strip_ordering_chain(option) for option in options], ""


def repair_payload(payload: dict) -> tuple[int, int]:
    repaired_sections = 0
    removed_crops = 0

    for bank in payload["banks"]:
        year = int(bank["id"].split("-")[1])
        kind = PART_B_KIND.get(year)
        for chapter in bank["chapters"]:
            for section in chapter["sections"]:
                questions = [question for question in section["questions"] if question.get("type") == "阅读理解 Part B"]
                if not questions:
                    continue
                if not kind:
                    raise ValueError(f"{year}: Part B exists but has no structure classification")

                current_options = questions[0].get("options", [])
                options, passage = extract_content(year, kind, current_options)
                if year == 2023 and not any(option.startswith("H.") for option in options):
                    options.append(Y2023_OPTION_H)
                options = [strip_ordering_chain(option) if kind == "ordering" else option.strip() for option in options]
                expected = 8 if year == 2023 else 7
                letters = "ABCDEFGH" if year == 2023 else "ABCDEFG"
                if len(options) != expected:
                    raise ValueError(f"{year}: found {len(options)} Part B options, expected {expected}")

                section["name"] = KIND_NAMES[kind]
                section["partBKind"] = kind
                if kind == "ordering":
                    section.pop("passage", None)
                    section.pop("passageImageUrls", None)
                    section["partBSequence"] = ORDERING_SEQUENCES[year]
                else:
                    section.pop("partBSequence", None)
                    if year in SCAN_PASSAGE_IMAGES:
                        section.pop("passage", None)
                        section["passageImageUrls"] = SCAN_PASSAGE_IMAGES[year]
                    elif passage:
                        section["passage"] = passage
                        section.pop("passageImageUrls", None)
                    else:
                        # Never retain the known Part C/translation fallback as Part B source.
                        section.pop("passage", None)
                        section.pop("passageImageUrls", None)

                for question in questions:
                    number = int(question["number"])
                    question["options"] = options
                    question["text"] = QUESTION_TEXT[kind](number)
                    if kind == "viewpoint":
                        question["text"] = f"为 {VIEWPOINT_NAMES[number]}（{number}）选择最匹配的观点。"
                    answer_letter = question.get("answer", "")[:1]
                    if answer_letter in letters:
                        question["answer"] = options[ord(answer_letter) - ord("A")]
                    if year in INVALID_CROP_YEARS and question.pop("answerImageUrl", None):
                        removed_crops += 1
                repaired_sections += 1

    return repaired_sections, removed_crops


def main() -> None:
    path = Path("src/englishBanks.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    repaired_sections, removed_crops = repair_payload(payload)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"repairedSections": repaired_sections, "removedInvalidCrops": removed_crops}, ensure_ascii=False))


if __name__ == "__main__":
    main()
