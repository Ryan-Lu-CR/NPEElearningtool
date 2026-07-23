#!/usr/bin/env python3
"""Audit split mechanical-course images and build five professional banks.

The original split folders are preferred because every crop retains the full
rendered PDF width. The horizontally auto-cropped ``拆分/output`` tree is used
only to fill missing answers for the 220-question intensive book; those images
are padded back to the book's standard width before being copied.
"""

from __future__ import annotations

import json
import re
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SPLIT_ROOT = ROOT / "拆分"
DEFAULT_ROOT = ROOT / "默认题库"
MANIFEST = DEFAULT_ROOT / "题库数据.json"
AUDIT_REPORT = SPLIT_ROOT / "专业课题库审计.json"
IMAGE_NAME = re.compile(r"^([QA])-(\d+)-(\d+)-(\d+)(?:\.(\d+))?\.png$", re.I)


@dataclass(frozen=True)
class Book:
    bank_id: str
    source_name: str
    display_name: str
    description: str
    chapter_names: tuple[str, ...]
    section_names: dict[int, str]
    chapter_section_names: tuple[dict[int, str], ...] | None = None
    unique_numbers_per_chapter: bool = False
    answer_fallback: str | None = None
    prefer_answer_fallback: bool = False


TYPE_SECTIONS = {
    1: "填空题",
    2: "判断题",
    3: "选择题",
    4: "简答题",
    5: "计算分析题",
    6: "结构与作图题",
    7: "综合题",
}

CHINESE_NUMERALS = (
    "一", "二", "三", "四", "五", "六", "七",
    "八", "九", "十", "十一", "十二", "十三",
)


def numbered_chapters(names: tuple[str, ...], style: str) -> tuple[str, ...]:
    if style == "arabic":
        return tuple(f"第{index}章 {name}" for index, name in enumerate(names, 1))
    if style == "chinese":
        return tuple(f"第{CHINESE_NUMERALS[index - 1]}章 {name}" for index, name in enumerate(names, 1))
    if style == "topic":
        return tuple(f"强化专题{CHINESE_NUMERALS[index - 1]} {name}" for index, name in enumerate(names, 1))
    raise ValueError(f"Unknown chapter numbering style: {style}")


BOOKS = (
    Book(
        "default-mechanical-theory-basic-450",
        "机械原理-基础过关450题",
        "机械原理-基础过关450题",
        "飞轮哥机械原理基础过关题库；题图保留原始页面宽度。",
        numbered_chapters((
            "平面机构的结构分析", "平面机构的运动分析", "平面机构的力分析",
            "机械效率和自锁", "平面机构平衡", "机器的运转及其速度波动的调节",
            "平面连杆机构及其设计", "凸轮机构及其设计", "齿轮机构及其设计",
            "轮系及其设计", "其他常用机构",
        ), "arabic"),
        TYPE_SECTIONS,
        answer_fallback="原始答案重匹配/机械原理-基础过关450题",
    ),
    Book(
        "default-mechanical-theory-intensive-220",
        "机械原理-强化冲关220题",
        "机械原理-强化冲关220题",
        "飞轮哥机械原理强化冲关题库；按板块整理，题图保留原始页面宽度。",
        numbered_chapters((
            "平面机构的结构分析", "平面机构的运动分析", "平面连杆机构及其设计",
            "凸轮机构及其设计", "齿轮机构及其设计", "轮系及其设计",
            "力分析与效率自锁", "机械的平衡",
            "机械的运转及其速度波动的调节", "其他常用机构",
        ), "chinese"),
        {index: f"强化板块 {index}" for index in range(1, 8)},
        unique_numbers_per_chapter=True,
        answer_fallback="原始答案重匹配/机械原理-强化冲关220题",
        prefer_answer_fallback=True,
    ),
    Book(
        "default-mechanical-design-basic-600",
        "机械设计-基础过关600题",
        "机械设计-基础过关600题",
        "飞轮哥机械设计基础过关题库；题图保留原始页面宽度。",
        numbered_chapters((
            "机械设计总论", "机械零件的疲劳强度", "摩擦、磨损与润滑概述",
            "螺纹连接和螺旋传动", "轴毂连接", "带传动", "链传动",
            "齿轮传动", "蜗杆传动", "滑动轴承", "滚动轴承",
            "联轴器和离合器", "轴",
        ), "chinese"),
        TYPE_SECTIONS,
        answer_fallback="原始答案重匹配/机械设计-基础过关600题",
    ),
    Book(
        "default-mechanical-design-pass-680",
        "机械设计-考研通关680题",
        "机械设计-考研通关680题",
        "飞轮哥机械设计考研通关题库；题图保留原始页面宽度。",
        numbered_chapters((
            "机械设计总论", "机械零件的强度", "摩擦、磨损与润滑概述",
            "螺纹连接和螺旋传动", "键连接和花键连接", "带传动", "链传动",
            "齿轮传动", "蜗杆传动", "滑动轴承", "滚动轴承",
            "联轴器和离合器", "轴",
        ), "chinese"),
        TYPE_SECTIONS,
        chapter_section_names=(
            {1: "载荷与应力", 2: "失效形式和设计准则", 3: "材料及其选用", 4: "机械零件的设计"},
            {1: "疲劳曲线", 2: "极限应力线图", 3: "疲劳极限计算", 4: "接触强度"},
            {1: "摩擦", 2: "磨损", 3: "润滑"},
            {1: "螺纹", 2: "螺纹连接", 3: "螺纹连接的强度计算", 4: "螺栓组连接的结构设计与受力分析", 5: "螺旋传动"},
            {1: "键连接", 2: "花键连接"},
            {1: "概述", 2: "带传动的受力分析与打滑", 3: "带的应力分析", 4: "带的弹性滑动", 5: "失效形式与额定功率", 6: "参数选择", 7: "带的布置和张紧"},
            {1: "链传动的特点和结构", 2: "运动特性、动载荷与受力分析", 3: "链传动的设计计算", 4: "链传动的布置和张紧"},
            {1: "概述", 2: "失效形式和设计准则", 3: "受力分析与计算载荷", 4: "齿根弯曲疲劳强度", 5: "齿面接触疲劳强度", 6: "参数选取"},
            {1: "概述", 2: "失效形式及常用材料", 3: "受力分析", 4: "效率、润滑与热平衡计算"},
            {1: "概述", 2: "不完全径向滑动轴承的计算", 3: "雷诺方程与流体动压润滑", 4: "径向滑动轴承的参数与工作能力计算"},
            {1: "构造、类型及类型选择", 2: "工作情况与设计计算", 3: "轴承装置的设计"},
            {1: "联轴器", 2: "离合器"},
            {1: "轴的类型和应力状态", 2: "强度和刚度计算", 3: "轴系结构设计综合"},
        ),
        unique_numbers_per_chapter=True,
    ),
    Book(
        "default-mechanical-design-intensive-notes",
        "机械设计-强化班补充讲义",
        "机械设计-强化班补充讲义",
        "飞轮哥机械设计强化班补充讲义题库；题图保留原始页面宽度。",
        numbered_chapters((
            "机械零件的疲劳强度计算", "螺纹连接和螺旋传动",
            "键连接和花键连接", "带传动", "链传动", "齿轮传动",
            "蜗杆传动", "滑动轴承", "滚动轴承", "轴的计算",
            "轴系结构作图与改错", "画图题专题",
        ), "topic"),
        {index: f"强化考点 {index}" for index in range(1, 8)},
        answer_fallback="原始答案重匹配/机械设计-强化班补充讲义",
    ),
)

INTENSIVE_220_RANGES = {
    1: {1: (1, 11), 2: (12, 19)},
    2: {1: (1, 5), 2: (6, 25), 3: (26, 29)},
    3: {1: (1, 6), 2: (7, 19), 3: (20, 33), 4: (34, 39), 5: (40, 43), 6: (44, 54), 7: (55, 57)},
    4: {1: (1, 8), 2: (9, 16)},
    5: {1: (1, 10), 2: (11, 23)},
    6: {1: (1, 10), 2: (11, 20), 3: (21, 38)},
    7: {1: (1, 9), 2: (10, 16)},
    8: {1: (1, 13), 2: (14, 20)},
    9: {1: (1, 10), 2: (11, 16)},
    10: {1: (1, 6)},
}


def collect(root: Path) -> dict[str, dict[tuple[int, int, int], list[Path]]]:
    groups: dict[str, dict[tuple[int, int, int], list[Path]]] = {
        "Q": defaultdict(list),
        "A": defaultdict(list),
    }
    if not root.exists():
        return groups
    for path in sorted(root.rglob("*.png")):
        match = IMAGE_NAME.match(path.name)
        if not match:
            continue
        kind, chapter, section, question, _part = match.groups()
        groups[kind.upper()][(int(chapter), int(section), int(question))].append(path)
    for kind in groups:
        for paths in groups[kind].values():
            paths.sort(key=image_part)
    return groups


def image_part(path: Path) -> int:
    match = IMAGE_NAME.match(path.name)
    return int(match.group(5) or 1) if match else 1


@lru_cache(maxsize=None)
def image_is_usable(path: Path) -> bool:
    try:
        with Image.open(path) as opened:
            image = opened.convert("L")
    except OSError:
        return False
    if image.width < 100 or image.height < 10:
        return False
    sample_width = min(280, image.width)
    sample_height = max(1, round(image.height * sample_width / image.width))
    sample = image.resize((sample_width, sample_height))
    dark_pixels = sum(pixel < 180 for pixel in sample.get_flattened_data())
    # A page break can leave a few strokes from the following question as a
    # tiny second image. Keep short standalone answers, but reject these
    # low-information continuation fragments.
    if image_part(path) > 1 and image.height < 90 and dark_pixels < 16:
        return False
    return dark_pixels >= 3


def usable(paths: list[Path]) -> bool:
    return any(image_is_usable(path) for path in paths)


def group_score(paths: list[Path]) -> tuple[int, int]:
    area = 0
    valid = 0
    for path in paths:
        try:
            with Image.open(path) as image:
                if image.width >= 100 and image.height >= 35:
                    valid += 1
                    area += image.width * image.height
        except OSError:
            pass
    return valid, area


def choose_unique(groups: dict[tuple[int, int, int], list[Path]]) -> dict[tuple[int, int], tuple[int, list[Path]]]:
    candidates: dict[tuple[int, int], list[tuple[int, list[Path]]]] = defaultdict(list)
    for (chapter, section, question), paths in groups.items():
        if chapter > 0 and usable(paths):
            candidates[(chapter, question)].append((section, paths))
    return {
        key: max(values, key=lambda value: group_score(value[1]))
        for key, values in candidates.items()
    }


def choose_unambiguous(groups: dict[tuple[int, int, int], list[Path]]) -> dict[tuple[int, int], list[Path]]:
    candidates: dict[tuple[int, int], list[list[Path]]] = defaultdict(list)
    for (chapter, _section, question), paths in groups.items():
        if chapter > 0 and usable(paths):
            candidates[(chapter, question)].append(paths)
    return {
        key: values[0]
        for key, values in candidates.items()
        if len(values) == 1
    }


def section_for_220(chapter: int, question: int) -> int:
    for section, (first, last) in INTENSIVE_220_RANGES.get(chapter, {}).items():
        if first <= question <= last:
            return section
    return 1


def section_name_for(book: Book, chapter: int, section: int) -> str:
    if book.chapter_section_names and chapter <= len(book.chapter_section_names):
        return book.chapter_section_names[chapter - 1].get(section, f"板块 {section}")
    return book.section_names.get(section, f"板块 {section}")


def standard_width(root: Path) -> int:
    widths: list[int] = []
    for path in root.rglob("*.png"):
        try:
            with Image.open(path) as image:
                widths.append(image.width)
        except OSError:
            pass
    return Counter(widths).most_common(1)[0][0] if widths else 1400


def copy_full_width(source: Path, destination: Path, minimum_width: int, pad: bool) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not pad:
        shutil.copy2(source, destination)
        trim_vertical_artifacts(destination)
        return
    with Image.open(source) as image:
        rgb = image.convert("RGB")
        target_width = max(minimum_width, rgb.width)
        if target_width == rgb.width:
            rgb.save(destination, "PNG")
            trim_vertical_artifacts(destination)
            return
        canvas = Image.new("RGB", (target_width, rgb.height), "white")
        canvas.paste(rgb, ((target_width - rgb.width) // 2, 0))
        canvas.save(destination, "PNG")
    trim_vertical_artifacts(destination)


def trim_vertical_artifacts(path: Path) -> None:
    """Trim bottom whitespace, page numbers and detached QR-code footers.

    Horizontal coordinates are never changed. A median-filtered thumbnail
    suppresses scanner speckles before content rows are measured.
    """
    with Image.open(path) as opened:
        image = opened.convert("RGB")
    if image.height < 80:
        return
    sample_width = min(350, image.width)
    sample_height = max(1, round(image.height * sample_width / image.width))
    gray = image.convert("L").resize((sample_width, sample_height)).filter(ImageFilter.MedianFilter(3))
    pixels = list(gray.get_flattened_data())
    row_threshold = max(3, sample_width // 120)
    active = [
        sum(pixels[y * sample_width + x] < 180 for x in range(sample_width)) >= row_threshold
        for y in range(sample_height)
    ]
    runs: list[tuple[int, int]] = []
    start = None
    for row, is_active in enumerate(active):
        if is_active and start is None:
            start = row
        elif not is_active and start is not None:
            runs.append((start, row - 1))
            start = None
    if start is not None:
        runs.append((start, sample_height - 1))
    merged: list[tuple[int, int]] = []
    for run in runs:
        if merged and run[0] - merged[-1][1] <= 9:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)
    if not merged:
        return

    while len(merged) > 1:
        previous, trailing = merged[-2], merged[-1]
        gap = trailing[0] - previous[1] - 1
        trailing_height = trailing[1] - trailing[0] + 1
        detached_qr_footer = (
            trailing[1] >= sample_height - 3
            and trailing[0] > sample_height * .55
            and gap > sample_height * .08
            and trailing_height > sample_height * .18
        )
        detached_page_number = (
            trailing[0] > sample_height * .78
            and gap > sample_height * .08
            and trailing_height < sample_height * .12
        )
        if not detached_qr_footer and not detached_page_number:
            break
        merged.pop()

    scale = image.height / sample_height
    bottom = min(image.height, round((merged[-1][1] + 1) * scale) + 24)
    if image.height - bottom < 40:
        return
    image.crop((0, 0, image.width, bottom)).save(path, "PNG")


def paths_for_manifest(question_id: str, kind: str, filenames: list[str]) -> list[str]:
    return [
        f"{question_id}/{kind}/{index}-{filename}"
        for index, filename in enumerate(filenames, 1)
    ]


def build_book(book: Book) -> tuple[dict, dict]:
    repaired_root = SPLIT_ROOT / "修复后" / book.source_name
    source_root = repaired_root if repaired_root.exists() else SPLIT_ROOT / book.source_name
    source = collect(source_root)
    fallback_root = SPLIT_ROOT / book.answer_fallback if book.answer_fallback else None
    fallback = collect(fallback_root)["A"] if fallback_root else {}
    target_root = DEFAULT_ROOT / "专业课" / book.source_name
    if target_root.exists():
        shutil.rmtree(target_root)
    target_root.mkdir(parents=True)
    width = standard_width(source_root)

    if book.unique_numbers_per_chapter:
        question_groups = {
            (chapter, section, question): paths
            for (chapter, question), (section, paths) in choose_unique(source["Q"]).items()
        }
    else:
        question_groups = {
            key: paths for key, paths in source["Q"].items()
            if key[0] > 0 and usable(paths)
        }

    source_answers_unique = choose_unique(source["A"])
    source_answers_unambiguous = choose_unambiguous(source["A"])
    fallback_answers_unique = choose_unique(fallback)
    exact_answers = source["A"]
    chapters: dict[int, dict[int, list[dict]]] = defaultdict(lambda: defaultdict(list))
    unmatched_answers = 0
    padded_answers = 0
    skipped_tiny_parts = 0

    for (chapter, detected_section, question), qpaths in sorted(question_groups.items()):
        if chapter < 1 or chapter > len(book.chapter_names):
            continue
        section = section_for_220(chapter, question) if book.bank_id.endswith("intensive-220") else max(1, detected_section)
        fallback_exact = fallback.get((chapter, section, question), [])
        answer_from_fallback = book.prefer_answer_fallback and usable(fallback_exact)
        answer_paths = fallback_exact if answer_from_fallback else exact_answers.get((chapter, section, question), [])
        if not usable(answer_paths) and book.unique_numbers_per_chapter:
            answer_paths = source_answers_unique.get((chapter, question), (0, []))[1]
        if not usable(answer_paths):
            answer_paths = source_answers_unambiguous.get((chapter, question), [])
        if not usable(answer_paths) and fallback_root:
            answer_paths = fallback_exact
            if not usable(answer_paths):
                answer_paths = fallback_answers_unique.get((chapter, question), (0, []))[1]
            answer_from_fallback = usable(answer_paths)
        if not usable(answer_paths):
            answer_paths = []
            unmatched_answers += 1

        section_name = section_name_for(book, chapter, section)
        folder = target_root / f"{chapter:02d} {book.chapter_names[chapter - 1]} {section:02d}-{section_name}"
        q_filenames: list[str] = []
        for source_path in qpaths:
            if not image_is_usable(source_path):
                skipped_tiny_parts += 1
                continue
            saved_index = len(q_filenames) + 1
            suffix = f".{saved_index}"
            filename = f"Q-{chapter:02d}-{section}-{question:02d}{suffix}.png"
            copy_full_width(source_path, folder / filename, width, False)
            q_filenames.append(filename)
        if not q_filenames:
            continue

        a_filenames: list[str] = []
        for source_path in answer_paths:
            if not image_is_usable(source_path):
                skipped_tiny_parts += 1
                continue
            saved_index = len(a_filenames) + 1
            suffix = f".{saved_index}"
            filename = f"A-{chapter:02d}-{section}-{question:02d}{suffix}.png"
            copy_full_width(source_path, folder / filename, width, answer_from_fallback)
            padded_answers += int(answer_from_fallback)
            a_filenames.append(filename)

        question_id = f"{book.bank_id}-{chapter:02d}-{section}-{question:02d}"
        record = {
            "id": question_id,
            "number": question,
            "type": "图片题",
            "text": "",
            "answer": "见答案图片" if a_filenames else "答案图片暂未可靠匹配",
            "analysis": "原书答案与解析" if a_filenames else "请暂时参照原答案册核对",
            "imageKeys": paths_for_manifest(question_id, "question", q_filenames),
        }
        if a_filenames:
            record["answerImageKeys"] = paths_for_manifest(question_id, "answer", a_filenames)
        chapters[chapter][section].append(record)

    bank_chapters = []
    for chapter, sections in sorted(chapters.items()):
        bank_chapters.append({
            "id": f"{book.bank_id}-chapter-{chapter:02d}",
            "name": book.chapter_names[chapter - 1],
            "sections": [{
                "id": f"{book.bank_id}-chapter-{chapter:02d}-section-{section}",
                "name": section_name_for(book, chapter, section),
                "questions": sorted(questions, key=lambda item: item["number"]),
            } for section, questions in sorted(sections.items())],
        })

    bank = {
        "id": book.bank_id,
        "name": book.display_name,
        "description": book.description,
        "subject": "professional",
        "source": "local",
        "chapters": bank_chapters,
    }
    question_count = sum(len(section["questions"]) for chapter in bank_chapters for section in chapter["sections"])
    answer_count = sum(
        1 for chapter in bank_chapters for section in chapter["sections"]
        for question in section["questions"] if question.get("answerImageKeys")
    )
    audit = {
        "bankId": book.bank_id,
        "source": str(source_root.relative_to(ROOT)),
        "standardWidth": width,
        "chapters": len(bank_chapters),
        "questions": question_count,
        "questionsWithAnswers": answer_count,
        "questionsWithoutMatchedAnswers": question_count - answer_count,
        "fallbackAnswerImagesPaddedToFullWidth": padded_answers,
        "invalidTinyPartsSkipped": skipped_tiny_parts,
        "ignoredChapterZeroImages": sum(
            len(paths) for kind in source.values()
            for (chapter, _section, _question), paths in kind.items() if chapter == 0
        ),
    }
    return bank, audit


def main() -> None:
    payload = json.loads(MANIFEST.read_text(encoding="utf-8"))
    generated_ids = {book.bank_id for book in BOOKS}
    banks = [bank for bank in payload["banks"] if bank.get("id") not in generated_ids]
    folders = {
        bank_id: folder for bank_id, folder in payload.get("folders", {}).items()
        if bank_id not in generated_ids
    }
    audits = []
    for book in BOOKS:
        bank, audit = build_book(book)
        banks.append(bank)
        folders[book.bank_id] = f"专业课/{book.source_name}"
        audits.append(audit)
        print(
            f"{book.display_name}: {audit['questions']} 题，"
            f"{audit['questionsWithAnswers']} 题已配答案，"
            f"{audit['questionsWithoutMatchedAnswers']} 题待核对"
        )
    payload["banks"] = banks
    payload["folders"] = folders
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    MANIFEST.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT_REPORT.write_text(json.dumps({
        "generatedAt": payload["updatedAt"],
        "policy": {
            "horizontalCropping": "disabled",
            "sourcePreference": "original full-width split images",
            "uncertainAnswerMatching": "left unmatched instead of risking a wrong answer",
        },
        "banks": audits,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
