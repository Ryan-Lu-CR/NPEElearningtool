#!/usr/bin/env python3
"""Build the 2010-2024 English I banks from the supplied TEMP archive."""

from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path

import pdfplumber

import build_english_exam_bank as legacy


# Keys are grouped as 1-20, 21-40 and 41-45 to make auditing easier.
KEYS = {
    2010: "ABCBCBDACDCAADBADCBD" + "BADABCDCBABDACCADCBD" + "BFDGA",
    2011: "CDBBABADCABCDCBDADAC" + "CBDBABDCACDCBAACDADB" + "BDACF",
    2012: "ABCDBDAADCACBCBCDDBA" + "ABDCCDACBDBADBABCACD" + "EFDGA",
    2013: "DABACDCDBCAABDCBABCD" + "ACDAADDABBBCCBDADCCB" + "CFGDB",
    2014: "ADCACBDBDADCBBCABDBA" + "ADDCDADCACBCDABABBCB" + "CFDEG",
    2015: "DBCACADABDBABDCCBDCA" + "DABBCCAACBBBDCAABCAC" + "CEGBA",
    2016: "BDCBCACCDADDBABDBACA" + "ADBCADADDCACDBADABCD" + "BGDEF",
    2017: "BADC BDBCADABDBCACACD".replace(" ", "") + "ACDDCBABADDBDCACCABD" + "FEACG",
    2018: "AADBD" + "BCDBABBACDACBAC" + "DCADBDABCABCDDBBAACD" + "EGABD",
    2019: "CCBDABDCADABDCBDAABC" + "ADBCBDAACBCDBACCDCBA" + "EDGBA",
    2020: "CABDABDADCCABDCBABCD" + "CBDBCDACADACDCBCABCB" + "CEGAD",
    2021: "CDABAACBACDBCDDBDAAC" + "DBCDDBDCCAABDAACBBDA" + "GCEBD",
    2022: "ACDCDBCBADCBACBDAADB" + "ABDDBCBCDABAABCDADBC" + "FCADG",
    2023: "CADCCABBADDCCBABDADA" + "CBACDADBCDACAADBCABD" + "BFDCG",
    2024: "DCBABCADADACCDCBDCBA" + "DDABAABDCBBCCDAABADB" + "ECFGB",
}

START_PAGES = {
    2024: 3, 2023: 17, 2022: 31, 2021: 46, 2020: 60,
    2019: 74, 2018: 88, 2017: 102, 2016: 116, 2015: 130,
    2014: 144, 2013: 158, 2012: 172, 2011: 186, 2010: 200,
}


def normalize(text: str) -> str:
    text = legacy.clean(text)
    replacements = {
        "SectionIUseofEnglish": "Section I Use of English",
        "SectionIIReadingComprehension": "Section II Reading Comprehension",
        "SectionIIIWriting": "Section III Writing",
        "PartA": "Part A", "PartB": "Part B", "PartC": "Part C",
        "UseofEnglish": "Use of English", "ReadingComprehension": "Reading Comprehension",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"Section\s*[\u2160ⅡⅢ]", lambda m: {"Ⅰ": "Section I", "Ⅱ": "Section II", "Ⅲ": "Section III"}[m.group()[-1]], text)
    return text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("combined_paper", type=Path)
    parser.add_argument("analysis_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--merge-builtin", type=Path)
    parser.add_argument("--standalone", type=Path)
    args = parser.parse_args()

    paper_texts: dict[int, str] = {}
    years_desc = list(range(2024, 2009, -1))
    with pdfplumber.open(args.combined_paper) as pdf:
        for index, year in enumerate(years_desc):
            start = START_PAGES[year] - 1
            end = START_PAGES[years_desc[index + 1]] - 1 if index + 1 < len(years_desc) else len(pdf.pages)
            paper_texts[year] = normalize("\n".join(page.extract_text(x_tolerance=2, y_tolerance=3) or "" for page in pdf.pages[start:end]))

    original_extract = legacy.extract_pdf_text
    legacy.ANSWER_KEYS.update(KEYS)
    legacy.TRANSLATIONS.update({year: ["参考译文见原解析 PDF。"] * 5 for year in KEYS})
    banks = []
    active_year = 0

    def extract(path: Path) -> str:
        if path.name == "__combined__.pdf":
            return paper_texts[active_year]
        return normalize(original_extract(path))

    legacy.extract_pdf_text = extract
    legacy.crop_writing_image = lambda _path: ""
    for year in range(2010, 2025):
        active_year = year
        analysis_path = args.analysis_dir / f"{year}.pdf"
        if year == 2010 and not analysis_path.exists():
            analysis_path = args.analysis_dir.parent / "2010-clean-analysis.pdf"
        bank = legacy.build_year(year, Path("__combined__.pdf"), analysis_path)
        bank["name"] = f"{year}年考研英语一真题"
        banks.append(bank)

    payload = {"version": 1, "banks": banks}
    for path in [args.output, args.standalone]:
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.merge_builtin:
        current = json.loads(args.merge_builtin.read_text(encoding="utf-8"))
        kept = [bank for bank in current.get("banks", []) if not re.fullmatch(r"english-20(?:1\d|2[0-4])", bank.get("id", ""))]
        merged = copy.deepcopy({"version": 1, "banks": kept + banks})
        args.merge_builtin.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({"banks": len(banks), "questions": sum(len(s["questions"]) for b in banks for c in b["chapters"] for s in c["sections"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
