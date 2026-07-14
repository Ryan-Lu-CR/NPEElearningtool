#!/usr/bin/env python3
"""Consolidate yearly English exam banks into one bank with one chapter per year."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


BANK_ID = "english-exams"
BANK_NAME = "英语一真题"
ENGLISH_VERSION = 6
YEAR_BANK = re.compile(r"english-(20\d{2})$")
YEAR_CHAPTER = re.compile(r"english-exams-(20\d{2})$")


def year_chapter(year: int, bank: dict) -> dict:
    return {
        "id": f"english-exams-{year}",
        "name": f"{year}年考研英语一真题",
        "sections": [section for chapter in bank.get("chapters", []) for section in chapter.get("sections", [])],
    }


def merge_english_banks(payload: dict, replacements: list[dict] | None = None) -> dict:
    chapters: dict[int, dict] = {}
    retained = []

    for bank in payload.get("banks", []):
        if bank.get("id") == BANK_ID:
            for chapter in bank.get("chapters", []):
                match = YEAR_CHAPTER.fullmatch(chapter.get("id", ""))
                if match:
                    chapters[int(match.group(1))] = chapter
            continue
        match = YEAR_BANK.fullmatch(bank.get("id", ""))
        if match:
            year = int(match.group(1))
            chapters[year] = year_chapter(year, bank)
        else:
            retained.append(bank)

    for bank in replacements or []:
        match = YEAR_BANK.fullmatch(bank.get("id", ""))
        if not match:
            raise ValueError(f"Not a yearly English bank: {bank.get('id')}")
        year = int(match.group(1))
        chapters[year] = year_chapter(year, bank)

    if chapters:
        retained.append({
            "id": BANK_ID,
            "name": BANK_NAME,
            "description": "2004—2026 年考研英语一真题；每年为一章，题型为小节。",
            "source": "local",
            "chapters": [chapters[year] for year in sorted(chapters)],
        })

    folders = {key: value for key, value in payload.get("folders", {}).items() if not key.startswith("english-")}
    if chapters:
        folders[BANK_ID] = BANK_NAME
    payload["banks"] = retained
    payload["folders"] = folders
    payload["builtinEnglishVersion"] = ENGLISH_VERSION
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    merge_english_banks(payload)
    args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bank = next(bank for bank in payload["banks"] if bank["id"] == BANK_ID)
    print(json.dumps({"bank": BANK_ID, "chapters": len(bank["chapters"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
