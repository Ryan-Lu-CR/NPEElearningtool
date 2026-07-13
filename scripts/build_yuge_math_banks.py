#!/usr/bin/env python3
"""Build local Zhang Yu math banks from TEMP images and exported Xiaoyi API data.

The script is deliberately network-free.  It decodes inline data URLs immediately
and writes a curl config for the public HTTP image URLs used by newer banks.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any


BANK_SPECS = (
    ("yuge-30-high", "27基础30讲高数", "yuge-30-high.json", "f418558d-84f4-45cc-9840-8550570648d2"),
    ("yuge-30-linear", "27基础30讲线代", "yuge-30-linear.json", "e08bea54-dd5b-443c-ab9e-109d914e167e"),
    ("yuge-1000-base", "27版1000题数二基础篇", "yuge-1000-base.json", "59dbe354-bfff-4645-b489-01874816cf9e"),
    ("yuge-1000-strengthen", "27版1000题数二强化篇", "yuge-1000-strengthen.json", "d10a330f-8a20-41ee-bf65-ffc9e118752a"),
    ("yuge-36-high", "27张宇强化36讲高数", "yuge-36-high-linear.json", "cea950e6-b079-491e-a892-75a584b6c323"),
    ("yuge-36-linear", "27张宇强化36讲线代", "yuge-36-high-linear.json", "cea950e6-b079-491e-a892-75a584b6c323"),
)

# 数二范围只保留高数前 15 讲；后三讲均为仅数一/数三内容。
MAX_CHAPTERS = {"yuge-30-high": 15}

YUGE_36_CHAPTERS = {
    "yuge-36-high": "89c7fd17-e969-4502-b562-4ba3040e44c3",  # 高数18讲
    "yuge-36-linear": "28c939cc-abf7-4ed5-9887-2a239b183537",  # 线代9讲
}

SECTION_ALIASES = {
    "例": "例题",
    "例题": "例题",
    "示例": "例题",
    "习题": "习题",
    "练习": "习题",
    "练习题": "习题",
}

SOURCE_FOLDER_PATTERN = re.compile(
    r"^(?:第\s*)?(\d{1,2})(?:\s*[讲章节])?\s*[-_.—－]?\s*"
    r"(例题?|示例|习题|练习题?)\s*\.assets$"
)


def normalize_label(value: str) -> str:
    """Normalize OCR/file-name punctuation without changing its meaning."""
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).strip()


def parse_source_folder(name: str) -> tuple[int, str] | None:
    """Parse common source folders such as `01 例题.assets` or `第1讲-练习.assets`."""
    match = SOURCE_FOLDER_PATTERN.fullmatch(unicodedata.normalize("NFKC", name).strip())
    if not match:
        return None
    return int(match.group(1)), SECTION_ALIASES[match.group(2)]


def parse_question_label(value: str, chapter_no: int) -> int | None:
    """Return the question number from common printed/OCR/file-name styles.

    Supported examples include `0101`, `例1.1`, `【例 1-1】`,
    `P22-[例1.1]`, `示例1`, `第1题`, and `（1）`.
    """
    label = normalize_label(value)
    label = re.sub(r"^P\d+[-_:：]?", "", label, flags=re.IGNORECASE)
    label = label.strip("[]【】{}")

    # Existing image exports use a fixed two-digit chapter prefix: 0101 -> 1.
    compact = re.fullmatch(r"\d{4,}", label)
    chapter_prefix = f"{chapter_no:02d}"
    if compact and label.startswith(chapter_prefix):
        return int(label[len(chapter_prefix):])

    qualified = re.fullmatch(
        r"(?:例题?|示例|习题|练习题?)?"
        r"(\d{1,2})[.·\-—_](\d{1,3})(?:题)?",
        label,
    )
    if qualified:
        return int(qualified.group(2)) if int(qualified.group(1)) == chapter_no else None

    simple = re.fullmatch(
        r"(?:例题?|示例|习题|练习题?)?(?:第)?[（(]?([0-9]{1,3})[）)]?(?:题)?",
        label,
    )
    return int(simple.group(1)) if simple else None


def safe_name(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "-", value).strip() or "未命名"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def clean_chapter_name(name: str) -> str:
    return re.sub(r"^\s*第\s*\d+\s*[讲章]\s*", "", name).strip() or name.strip()


def clean_section_name(name: str) -> str:
    return name.strip()


def values_from_field(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item]
    if not isinstance(value, str) or not value.strip():
        return []
    value = value.strip()
    if value.startswith("["):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return [value]
        return [str(item) for item in parsed if item]
    return [value]


def data_url_bytes(value: str) -> bytes | None:
    match = re.match(r"^data:[^;]+;base64,(.+)$", value, re.DOTALL)
    return base64.b64decode(match.group(1)) if match else None


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def write_payload(path: Path, payload: bytes, *, overwrite: bool) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if digest(path.read_bytes()) == digest(payload):
            return "same"
        if not overwrite:
            return "kept"
    path.write_bytes(payload)
    return "written"


def curl_quote(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def add_curl_download(config: list[str], url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    config.extend((f'url = "{curl_quote(url)}"', f'output = "{curl_quote(str(target))}"'))


def local_target(root: Path, bank: str, chapter_no: int, chapter_name: str,
                 section_no: int, section_name: str) -> Path:
    folder = f"{chapter_no:02d} {clean_chapter_name(chapter_name)} {section_no}-{clean_section_name(section_name)}"
    return root / safe_name(bank) / safe_name(folder)


def section_code(sections: list[dict[str, Any]], section: dict[str, Any]) -> int:
    """Return a unique, stable 1-based code even when source display_order collides."""
    return sections.index(section) + 1


def copy_temp_30(temp: Path, output: Path, bank: str, chapters: list[dict[str, Any]],
                 sections_by_chapter: dict[str, list[dict[str, Any]]], stats: dict[str, int]) -> None:
    source = temp / "30讲"
    for image in sorted(source.glob("*.assets/*.png")):
        folder = parse_source_folder(image.parent.name)
        if not folder:
            stats["unmatched_temp_images"] += 1
            continue
        chapter_no, section_name = folder
        question_no = parse_question_label(image.stem, chapter_no)
        if question_no is None:
            stats["unmatched_temp_images"] += 1
            continue
        if not 1 <= chapter_no <= len(chapters):
            stats["unmatched_temp_images"] += 1
            continue
        chapter = chapters[chapter_no - 1]
        sections = sections_by_chapter.get(chapter["id"], [])
        section = next((item for item in sections if item["name"].strip() == section_name), None)
        if not section:
            stats["unmatched_temp_images"] += 1
            continue
        section_no = section_code(sections, section)
        target_dir = local_target(output, bank, chapter_no, chapter["name"], section_no, section["name"])
        target = target_dir / f"Q-{chapter_no:02d}-{section_no}-{question_no:02d}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, target)
        stats["temp_questions"] += 1


def temp_30_hash_lookup(temp: Path) -> dict[tuple[int, str, str], int]:
    lookup: dict[tuple[int, str, str], int] = {}
    for image in sorted((temp / "30讲").glob("*.assets/*.png")):
        folder = parse_source_folder(image.parent.name)
        if not folder:
            continue
        chapter_no, section_name = folder
        question_no = parse_question_label(image.stem, chapter_no)
        if question_no is not None:
            lookup[(chapter_no, section_name, digest(image.read_bytes()))] = question_no
    return lookup


def leading_number(value: str) -> int | None:
    match = re.match(r"^(?:第\s*)?(\d{1,2})", unicodedata.normalize("NFKC", value).strip())
    return int(match.group(1)) if match else None


def copy_temp_36(temp: Path, output: Path, bank: str, chapter: dict[str, Any],
                 sections_by_chapter: dict[str, list[dict[str, Any]]], stats: dict[str, int]) -> None:
    """Copy local repairs arranged as `36讲/<subject>/<lesson>/<question>.png`.

    Each subject is now its own bank/chapter, while the printed label continues
    to use the lesson number (`例1.1`).
    """
    for image in sorted((temp / "36讲").glob("*/*/*.png")):
        if chapter["name"].strip() not in image.parents[1].name:
            continue
        section_no = leading_number(image.parent.name)
        if section_no is None:
            stats["unmatched_temp_images"] += 1
            continue
        sections = sections_by_chapter.get(chapter["id"], [])
        if not 1 <= section_no <= len(sections):
            stats["unmatched_temp_images"] += 1
            continue
        question_no = parse_question_label(image.stem, section_no)
        if question_no is None:
            stats["unmatched_temp_images"] += 1
            continue
        section = sections[section_no - 1]
        chapter_no = 1
        target_dir = local_target(output, bank, chapter_no, chapter["name"], section_no, section["name"])
        target = target_dir / f"Q-{chapter_no:02d}-{section_no}-{question_no:02d}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, target)
        stats["temp_questions"] += 1


def copy_temp_1000(temp: Path, output: Path, bank: str, chapters: list[dict[str, Any]],
                   sections_by_chapter: dict[str, list[dict[str, Any]]], stats: dict[str, int]) -> None:
    source = temp / "1000题"
    high_chapter = next((item for item in chapters if item["name"].strip() == "高等数学"), None)
    if not high_chapter:
        return
    chapter_no = chapters.index(high_chapter) + 1
    sections = sections_by_chapter.get(high_chapter["id"], [])
    for image in sorted(source.glob("*.assets/*.png")):
        folder_match = re.match(r"(\d{2})\s+", image.parent.name)
        stem = re.sub(r"\s+", "", image.stem)
        if not folder_match or not stem.isdigit():
            continue
        source_chapter = int(folder_match.group(1))
        section_no = source_chapter + 1
        section = sections[section_no - 1] if section_no <= len(sections) else None
        if not section:
            continue
        part: int | None = None
        if len(stem) == 6 and stem[:4] == f"{source_chapter:02d}01":
            question_no, part = 1, int(stem[4:])
        elif len(stem) >= 4 and stem[:2] == f"{source_chapter:02d}":
            question_no = int(stem[2:])
        else:
            continue
        target_dir = local_target(output, bank, chapter_no, high_chapter["name"], section_no, section["name"])
        suffix = f".{part}" if part is not None else ""
        target = target_dir / f"Q-{chapter_no:02d}-{section_no}-{question_no:02d}{suffix}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, target)
        stats["temp_questions"] += 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-dir", type=Path, default=Path("/tmp"))
    parser.add_argument("--temp", type=Path, default=Path("TEMP/张宇"))
    parser.add_argument("--output", type=Path, default=Path("默认题库"))
    parser.add_argument("--curl-config", type=Path, default=Path("/tmp/yuge-image-downloads.conf"))
    parser.add_argument("--report", type=Path, default=Path("默认题库/张宇题库导入报告.json"))
    parser.add_argument("--clean", action="store_true", help="replace only the five generated bank directories")
    args = parser.parse_args()

    chapters_all = load_json(args.api_dir / "yuge-chapters.json")
    sections_all = load_json(args.api_dir / "yuge-sections.json")
    sections_by_chapter: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for section in sections_all:
        if section.get("is_enabled", True):
            sections_by_chapter[section["chapter_id"]].append(section)
    for values in sections_by_chapter.values():
        values.sort(key=lambda item: (int(item.get("display_order", 0)), item["name"], item["id"]))

    curl_config = ["create-dirs", "fail", "location", "silent", "show-error"]
    report: dict[str, Any] = {"banks": {}, "missing_question_images": [], "http_downloads": 0}

    if args.clean:
        for _, bank_name, _, _ in BANK_SPECS:
            generated = args.output / safe_name(bank_name)
            if generated.exists():
                shutil.rmtree(generated)

    for bank_id, bank_name, json_name, type_id in BANK_SPECS:
        records = load_json(args.api_dir / json_name)
        chapters = [item for item in chapters_all if item["type_id"] == type_id and item.get("is_enabled", True)]
        chapters.sort(key=lambda item: (int(item.get("display_order", 0)), item["name"], item["id"]))
        if bank_id in MAX_CHAPTERS:
            chapters = chapters[:MAX_CHAPTERS[bank_id]]
        if bank_id in YUGE_36_CHAPTERS:
            chapters = [item for item in chapters if item["id"] == YUGE_36_CHAPTERS[bank_id]]
        chapter_ids = {item["id"] for item in chapters}
        records = [item for item in records if item["chapter_id"] in chapter_ids and item.get("is_enabled", True)]
        stats: dict[str, int] = defaultdict(int)

        if bank_id == "yuge-30-high":
            copy_temp_30(args.temp, args.output, bank_name, chapters, sections_by_chapter, stats)
        elif bank_id == "yuge-1000-base":
            copy_temp_1000(args.temp, args.output, bank_name, chapters, sections_by_chapter, stats)
        elif bank_id in YUGE_36_CHAPTERS:
            copy_temp_36(args.temp, args.output, bank_name, chapters[0], sections_by_chapter, stats)

        temp_hashes = temp_30_hash_lookup(args.temp) if bank_id == "yuge-30-high" else {}
        grouped: dict[tuple[str, str, int], list[dict[str, Any]]] = defaultdict(list)
        for record in records:
            question_no = int(record["question_number"])
            if temp_hashes:
                chapter = next(item for item in chapters if item["id"] == record["chapter_id"])
                chapter_no = chapters.index(chapter) + 1
                section = next((item for item in sections_by_chapter.get(chapter["id"], []) if item["id"] == record.get("section_id")), None)
                q_values = values_from_field(record.get("question_image_url"))
                payload = data_url_bytes(q_values[0]) if q_values else None
                if section and payload is not None:
                    question_no = temp_hashes.get((chapter_no, section["name"].strip(), digest(payload)), question_no)
            grouped[(record["chapter_id"], record.get("section_id") or "", question_no)].append(record)

        for (chapter_id, section_id, question_no), group in grouped.items():
            chapter = next(item for item in chapters if item["id"] == chapter_id)
            chapter_no = chapters.index(chapter) + 1
            sections = sections_by_chapter.get(chapter_id, [])
            section = next((item for item in sections if item["id"] == section_id), None)
            if section is None:
                section = {"id": section_id, "name": "全部题目", "display_order": 1}
            section_no = section_code(sections, section) if section in sections else 1
            target_dir = local_target(args.output, bank_name, chapter_no, chapter["name"], section_no, section["name"])

            q_values: list[str] = []
            a_values: list[str] = []
            for record in group:
                q_values.extend(values_from_field(record.get("question_image_url")))
                a_values.extend(values_from_field(record.get("answer_image_url")))
            q_values = list(dict.fromkeys(q_values))
            a_values = list(dict.fromkeys(a_values))

            existing_questions = sorted(target_dir.glob(f"Q-{chapter_no:02d}-{section_no}-{question_no:02d}*.png"))
            if not q_values and not existing_questions:
                report["missing_question_images"].append({
                    "bank": bank_name, "chapter": chapter["name"], "section": section["name"], "question": question_no,
                })
            if not existing_questions:
                for index, value in enumerate(q_values, 1):
                    suffix = "" if len(q_values) == 1 else f".{index}"
                    target = target_dir / f"Q-{chapter_no:02d}-{section_no}-{question_no:02d}{suffix}.png"
                    payload = data_url_bytes(value)
                    if payload is not None:
                        write_payload(target, payload, overwrite=False)
                        stats["website_question_images"] += 1
                    elif value.startswith("http"):
                        add_curl_download(curl_config, value, target)
                        stats["website_question_images"] += 1
                        report["http_downloads"] += 1
            else:
                stats["temp_questions_kept"] += 1

            for index, value in enumerate(a_values, 1):
                suffix = "" if len(a_values) == 1 else f".{index}"
                target = target_dir / f"A-{chapter_no:02d}-{section_no}-{question_no:02d}{suffix}.png"
                payload = data_url_bytes(value)
                if payload is not None:
                    write_payload(target, payload, overwrite=True)
                    stats["answer_images"] += 1
                elif value.startswith("http"):
                    add_curl_download(curl_config, value, target)
                    stats["answer_images"] += 1
                    report["http_downloads"] += 1

        stats["questions"] = len(grouped)
        stats["records"] = len(records)
        stats["chapters"] = len(chapters)
        stats["sections"] = sum(len(sections_by_chapter.get(item["id"], [])) for item in chapters)
        report["banks"][bank_id] = {"name": bank_name, **dict(stats)}

    args.curl_config.write_text("\n".join(curl_config) + "\n", encoding="utf-8")
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
