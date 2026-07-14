#!/usr/bin/env python3
"""Add the supplied 2025-2026 English I papers to the built-in bank."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import pdfplumber
from PIL import Image

import build_english_exam_bank as legacy
from build_english_exam_bank_2010_2024 import normalize
from english_bank_structure import merge_english_banks


ANSWER_KEYS = {
    2025: "BCBCBADAADDADCDCBBBA" + "CAABABDCACDAACDCBBCD" + "DGBEF",
    2026: "ADBCBCADADDDCABCCBBA" + "CDABBDABCAAACBDDCBDC" + "BEAGD",
}

TRANSLATIONS = {
    2025: [
        "近几十年来，科学已经进入了一种惯例，在这种惯例中，只有通过大学等机构才能参与这一学科。",
        "但是，通过利用公众的自然好奇心，可以让非科学家通过直接参与研究过程来克服许多挑战。",
        "科学家们采用了多种方式让公众参与他们的研究，例如将数据分析转化为在线游戏，或将样本收集转化为智能手机应用程序。",
        "这些群体是城市科学家和专业科学家迅速扩大的生物技术社会运动的一部分，他们寻求将发现机构交到任何有热情的人手中。",
        "他们汇集资源，开展合作，跳出思维定式，找到解决方案和绕过障碍的方法，为了科学而探索科学，在这个过程中不受正式工作环境中传统界限的束缚。",
    ],
    2026: [
        "追溯该术语的历史，我们可以看到科学素养的定义如何随时间推移而变化，这使得对科学教育目标的确定变得模糊不清。",
        "回归那种更侧重于教授科学的本质与运作方式，而非死记科学事实的科学素养理念，似乎是当今社会迫切需要的。",
        "教育家们曾提出让学生在高中阶段完成详细的实验训练的想法，他们认为这种工作主要有利于增强逻辑推理和观察能力。",
        "直到20世纪40年代“科学素养”这一说法出现后，科学才有了其所需的响亮口号，从而引起公众的关注，并使改进科学教育成为重要的国家目标。",
        "美国对科学素养的高度关注，最初源于科学技术在二战中的关键作用，以及当时对美国士兵能力不足的认识。",
    ],
}

SEQUENCES = {
    2025: "41 → 42 → C → 43 → H → 44 → A → 45",
    2026: "F → 41 → 42 → H → 43 → C → 44 → 45",
}

ANALYSIS_GROUPS = {
    "cloze": (1, 13),
    "text-1": (14, 20),
    "text-2": (21, 27),
    "text-3": (28, 34),
    "text-4": (35, 41),
    "part-b": (42, 46),
    "part-c": (47, 49),
    "writing": (50, 52),
}


def render_composite(pdf: pdfplumber.PDF, first: int, last: int, output: Path) -> None:
    if output.exists():
        return
    pages: list[Image.Image] = []
    for page_number in range(first, last + 1):
        image = pdf.pages[page_number - 1].to_image(resolution=112).original.convert("RGB")
        width = 820
        image.thumbnail((width, 2000), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (width, image.height + 18), "white")
        canvas.paste(image, ((width - image.width) // 2, 9))
        pages.append(canvas)
    result = Image.new("RGB", (820, sum(page.height for page in pages)), "white")
    top = 0
    for page in pages:
        result.paste(page, (0, top))
        top += page.height
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output, "WEBP", quality=84, method=6)


def render_page(pdf_path: Path, page_number: int, output: Path) -> None:
    if output.exists():
        return
    with pdfplumber.open(pdf_path) as pdf:
        image = pdf.pages[page_number - 1].to_image(resolution=140).original.convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=88, method=6)


def fix_part_b(bank: dict, year: int, paper_text: str) -> None:
    section_two = paper_text.index("Section II Reading Comprehension")
    start = paper_text.index("Part B", section_two)
    end = paper_text.index("Part C", start)
    options = legacy.options_from(paper_text[start:end], "ABCDEFGH")
    if len(options) != 8:
        raise ValueError(f"{year}: found {len(options)} ordering paragraphs, expected 8")
    options[-1] = re.sub(r"\s+F\s+41\.?\s+42\.?\s+H\s+43\.?\s+C\.?\s+44\.?\s+45\.?\s*$", "", options[-1]).strip()

    section = next(
        section
        for chapter in bank["chapters"]
        for section in chapter["sections"]
        if any(question.get("type") == "阅读理解 Part B" for question in section["questions"])
    )
    section["name"] = "Part B 段落排序"
    section["partBKind"] = "ordering"
    section["partBSequence"] = SEQUENCES[year]
    section.pop("passage", None)
    for question in section["questions"]:
        number = int(question["number"])
        letter = ANSWER_KEYS[year][number - 1]
        question["text"] = f"选择应放在第 {number} 空位置的段落。"
        question["options"] = options
        question["answer"] = options[ord(letter) - ord("A")]


def asset_url(year: int, filename: str) -> str:
    relative = f"英语一真题/{year}年考研英语一真题/资源/{filename}"
    return f"/api/default-workspace/file?path={quote(relative, safe='')}"


def attach_2025_analysis(bank: dict) -> None:
    for chapter in bank["chapters"]:
        for section in chapter["sections"]:
            if section["id"].endswith("01-1"):
                group = "cloze"
            elif "text-" in section["id"]:
                group = section["id"].rsplit("-", 2)[-2] + "-" + section["id"].rsplit("-", 1)[-1]
            elif section.get("partBKind") == "ordering":
                group = "part-b"
            elif any(question.get("type") == "英译汉" for question in section["questions"]):
                group = "part-c"
            else:
                group = "writing"
            url = asset_url(2025, f"analysis-2025-{group}.webp")
            for question in section["questions"]:
                question["answerImageUrl"] = url


def build_bank(year: int, paper_path: Path) -> dict:
    original_extract = legacy.extract_pdf_text
    legacy.extract_pdf_text = lambda path: "" if path.name == "__blank__.pdf" else normalize(original_extract(path))
    legacy.crop_writing_image = lambda _path: ""
    try:
        bank = legacy.build_year(year, paper_path, Path("__blank__.pdf"))
        paper_text = normalize(original_extract(paper_path))
    finally:
        legacy.extract_pdf_text = original_extract
    bank["name"] = f"{year}年考研英语一真题"
    fix_part_b(bank, year, paper_text)
    return bank


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paper_2025", type=Path)
    parser.add_argument("paper_2026", type=Path)
    parser.add_argument("analysis_2025", type=Path)
    parser.add_argument("--bank", type=Path, default=Path("默认题库/题库数据.json"))
    parser.add_argument("--assets", type=Path, default=Path("默认题库/英语一真题"))
    args = parser.parse_args()

    legacy.ANSWER_KEYS.update(ANSWER_KEYS)
    legacy.TRANSLATIONS.update(TRANSLATIONS)
    banks = [build_bank(2025, args.paper_2025), build_bank(2026, args.paper_2026)]

    with pdfplumber.open(args.analysis_2025) as analysis_pdf:
        for name, (first, last) in ANALYSIS_GROUPS.items():
            output = args.assets / "2025年考研英语一真题" / "资源" / f"analysis-2025-{name}.webp"
            legacy_output = Path("public/builtin-english") / output.name
            if legacy_output.exists() and not output.exists():
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(legacy_output, output)
            render_composite(analysis_pdf, first, last, output)
    attach_2025_analysis(banks[0])

    for year, paper_path, bank in ((2025, args.paper_2025, banks[0]), (2026, args.paper_2026, banks[1])):
        asset = args.assets / f"{year}年考研英语一真题" / "资源" / f"paper-{year}-writing.webp"
        legacy_asset = Path("public/builtin-english") / asset.name
        if legacy_asset.exists() and not asset.exists():
            asset.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(legacy_asset, asset)
        render_page(paper_path, 15, asset)
        for chapter in bank["chapters"]:
            for section in chapter["sections"]:
                for question in section["questions"]:
                    if question.get("type") in {"应用文写作", "短文写作"}:
                        question["imageUrl"] = asset_url(year, asset.name)

    payload = json.loads(args.bank.read_text(encoding="utf-8"))
    ids = {bank["id"] for bank in banks}
    merge_english_banks(payload, banks)
    payload["updatedAt"] = datetime.now().astimezone().isoformat(timespec="seconds")
    args.bank.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"added": sorted(ids), "analysisAssets": len(ANALYSIS_GROUPS)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
