#!/usr/bin/env python3
"""Build NPEE English question banks from the 2004-2009 paper/analysis PDFs.

The source directory must contain the two folders used by the supplied archive:
  1998-2009年考研英语真题/
  1998-2009年考研英语解析/
"""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import io
import json
import re
from pathlib import Path

import pdfplumber


ANSWER_KEYS = {
    # 2004 has 40 objective questions; Questions 41-45 are translations.
    2004: "CDADABCDABCCDBABBDAC" + "CADBCADCBDDABACCADBC",
    2005: "CBACBADADBCADCDBCDAB" + "CBACBCDADBACDDABDABC" + "ECGFB",
    2006: "ABDADCBCAACBDCCABCAD" + "CACDBABCDCCDCDBDBBDA" + "CABFD",
    2007: "BDCAC" + "DCCBC" + "CDADC" + "DBDCD" + "CBADCDCAABCBDCBDABAD" + "FDBCE",
    2008: "BDACCABDBCBDACDDCABA" + "ADCBDDCAABACBDCDBCAB" + "DGACE",
    2009: "BADBCBDBDADBCDACBCAA" + "ABCAAACDABDBBACBBDAC" + "CEABG",
}

TRANSLATIONS = {
    2004: [
        "希腊人认为，语言结构与思维过程之间存在着某种联系。这一观点在人们尚未认识到语言的千差万别以前就早已在欧洲扎下了根。",
        "我们之所以感激他们（两位先驱），是因为在此之后，这些（土著）语言中有一些已经不复存在了，这是由于说这些语言的部族或是消亡了，或是被同化而丧失了自己的本族语言。",
        "这些新近被描述的语言与已经得到充分研究的欧洲和东南亚地区的语言往往差别显著，以至于有些学者甚至指责博厄斯和萨皮尔编造了材料。",
        "沃尔夫对语言与思维的关系很感兴趣，逐渐形成了这样的观点：在一个社会中，语言的结构决定习惯思维的结构。",
        "沃尔夫进而相信某种类似语言决定论的观点，其极端说法是：语言禁锢思维，语言的语法结构能对一个社会的文化产生深远的影响。",
    ],
    2005: [
        "电视是创造和传递这些情感的手段之一。也许在此之前，就加强不同民族和国家之间的联系而言，电视还从来没有像在最近的欧洲事件中起过如此大的作用。",
        "多媒体集团在欧洲就像在其他地方一样越来越成功了。这些集团把相互关系密切的电视台、电台、报纸、杂志和出版社整合到了一起。",
        "仅这一点就表明电视行业不是一个容易生存的领域。这一事实通过统计数字一目了然：在80家欧洲电视网中，1989年出现亏损的不少于50%。",
        "创造一个尊重不同文化和传统的‘欧洲统一体’绝非易事，需要战略性选择。正是这些文化和传统组成了连接欧洲大陆的纽带。",
        "在应付一个如此规模的挑战时，可以毫不夸张地说：团结，我们就会站起来；分裂，我们就会倒下去。",
    ],
    2006: [
        "我将他定义为一个把以苏格拉底式的方式思考道德问题作为人生首要职责和乐趣的人。",
        "他的职能与法官类似，必须承担这样的责任：尽可能清楚地展示自己得出决定的推理过程。",
        "我之所以把他（普通科学家）排除在外，是因为尽管他的成果可能有助于解决道德问题，但他承担的任务只是研究这些问题的事实方面。",
        "但是，他的首要任务并不是思考支配自己行为的道德规范，正如不能指望商人把精力用于探索商业行为规范一样。",
        "他们可能课教得很好，甚至超额完成了薪酬所要求的工作，但大多数人对涉及道德判断的人类问题很少或根本没有独立思考。",
    ],
    2007: [
        "一直以来，在这些大学里，法律知识的学习被看作是律师的专属，而不是受教育人士必备知识的一部分。",
        "另一方面，法律把这些概念与日常实践联系起来，其方式类似于记者在每天采访和评论新闻时建立联系。",
        "但是，记者必须比普通公民更为深刻地理解法律，这种说法是基于对新闻媒体的既定惯例和特殊职责的理解。",
        "事实上，我们很难想象，对加拿大宪法的基本特征缺乏清楚把握的记者如何能胜任政治方面的报道。",
        "尽管律师的意见和态度可能会增加报道的深度，但记者最好还是应该依靠自己的理解并做出自己的判断。",
    ],
    2008: [
        "达尔文认为，正是这种困难迫使他长时间专心思考每一个句子，这也使得他在观察和推理中发现错误。这种困难反而使他获得了别人所不具备的优势。",
        "达尔文同时声称，进行冗长且纯抽象的思维，自己的能力非常有限。因为这个原因，他相信自己在数学方面根本不会成功。",
        "另一方面，有些批评他的人认为他善于观察而缺乏推理能力，但是他并不接受这种看法，认为这毫无根据。",
        "达尔文很谦虚地补充道，也许自己‘同常人相比，更能注意到别人容易忽略的东西，对这些东西的观察也更仔细’。",
        "达尔文确信，对音乐和绘画方面兴趣的丧失，失去的不仅仅是一种乐趣，而且可能会伤害才智，乃至可能会伤害道德。",
    ],
    2009: [
        "可以说，任何社会制度的价值在于它对扩大和改进经验方面的影响，但是这种影响并不是它原来的动机的一部分。",
        "一种制度的副产品只是逐步被注意到，而这种效果被视为实施这种制度的一个指导性因素则更加缓慢得多。",
        "在和他们接触的时候，虽然容易忽略我们的行动对他们的倾向的影响，但是也不像与成年人打交道那么简单。",
        "既然我们的主要任务在于使年轻人参与共同生活，我们禁不住考虑我们是否在形成获得这种能力的力量。",
        "因此，我们可以在上面所考虑的广阔的教育过程之内区别出一种比较正规的教育，即直接的教导或学校教育。",
    ],
}

PART_B_PASSAGE_MARKERS = {
    2007: "How Can a Parent Help?",
    2016: "No matter how formal or informal the work environment",
    2020: "In a social situation, eye contact with another person",
}


def clean(text: str) -> str:
    text = re.sub(r"\n===== PAGE \d+ =====\n", "\n", text)
    text = re.sub(r"(?m)^\s*-\s*\d+\s*-\s*$", "", text)
    text = text.replace("\u00ad", "-").replace("\ufffd", "")
    text = re.sub(r"(?m)^\s*(\d)\s+(\d)\s*\.", lambda m: f"{m.group(1)}{m.group(2)}.", text)
    text = re.sub(r"\(\s*(\d)\s+(\d)\s*\)", lambda m: f"({m.group(1)}{m.group(2)})", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_passage(text: str) -> str:
    """Turn PDF line fragments into readable paragraphs without forced line wraps."""
    text = clean(text)
    paragraphs = []
    for block in re.split(r"\n\s*\n", text):
        joined = re.sub(r"\s*\n\s*", " ", block).strip()
        if joined:
            paragraphs.append(joined)
    text = "\n\n".join(paragraphs)
    # Frequent extraction artefacts in the supplied papers.
    text = re.sub(r"\bdesi\s+gn\b", "design", text, flags=re.I)
    text = re.sub(r"\bsi\s+gn(?:ed|s|ing)?\b", lambda m: m.group(0).replace(" ", ""), text, flags=re.I)
    return text


def extract_pdf_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        return clean("\n".join(page.extract_text(x_tolerance=2, y_tolerance=3) or "" for page in pdf.pages))


def options_from(block: str, letters: str = "ABCD") -> list[str]:
    block = re.sub(r"\[\s*([A-Z])J", r"[\1]", block)
    normalized = re.sub(r"\[\s*([A-Z])\s*\]", r"[\1]", block)
    if not re.search(r"\[A\]", normalized):
        # Newer papers often print all four choices on one physical line.
        normalized = re.sub(rf"(?<![A-Za-z])([{letters}])\s*[\.\uff0e]\s+", r"[\1]", normalized)
    found = []
    for index, letter in enumerate(letters):
        start = re.search(rf"\[{letter}\]", normalized)
        if not start:
            return []
        end = re.search(r"\[[A-Z]\]", normalized[start.end():])
        stop = start.end() + end.start() if end else len(normalized)
        value = clean(normalized[start.end():stop]).replace("\n", " ")
        found.append(f"{letter}. {value}")
        normalized = normalized[stop:]
    return found


def numbered_blocks(text: str, numbers: list[int]) -> dict[int, str]:
    starts = []
    for n in numbers:
        match = re.search(rf"(?m)^\s*{n}\s*\.\s*", text)
        if match:
            starts.append((match.start(), n, match.end()))
    starts.sort()
    result = {}
    for i, (pos, n, content_start) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        result[n] = clean(text[content_start:end])
    return result


def analysis_blocks(text: str) -> dict[int, str]:
    result = {}
    matches = list(re.finditer(r"(?m)^\s*(\d{1,2})\s*[\.\uff0e]\s*(?=(?:\[\s*A|The |In |According|Which|What|Why|By |Dr\.|People|Researchers|Today|We |It |答案|本题))", text))
    for i, match in enumerate(matches):
        n = int(match.group(1))
        if 1 <= n <= 45 and n not in result:
            end = matches[i + 1].start() if i + 1 < len(matches) else min(len(text), match.start() + 5000)
            result[n] = clean(text[match.start():end])[:2500]
    return result


def crop_writing_image(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[-1]
        images = [im for im in page.images if im.get("width", 0) < page.width * 0.9]
        if not images:
            return ""
        x0 = max(0, min(im["x0"] for im in images) - 25)
        top = max(0, min(im["top"] for im in images) - 25)
        x1 = min(page.width, max(im["x1"] for im in images) + 25)
        bottom = min(page.height, max(im["bottom"] for im in images) + 45)
        rendered = page.crop((x0, top, x1, bottom)).to_image(resolution=200).original
        buffer = io.BytesIO()
        rendered.save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def render_page(path: Path, page_number: int) -> str:
    with pdfplumber.open(path) as pdf:
        rendered = pdf.pages[page_number].to_image(resolution=150).original
        buffer = io.BytesIO()
        rendered.save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def qid(year: int, chapter: str, section: str, number: int) -> str:
    return f"english-{year}-{chapter}-{section}-{number:02d}"


def make_question(year: int, chapter: str, section: str, number: int, qtype: str, text: str,
                  answer: str, analysis: str, options: list[str] | None = None, image: str = "") -> dict:
    item = {
        "id": qid(year, chapter, section, number), "number": number, "type": qtype,
        "text": clean(text), "answer": answer, "analysis": clean(analysis) or "详见原解析 PDF。",
    }
    if options:
        item["options"] = options
    if image:
        item["imageUrl"] = image
    return item


def build_year(year: int, paper_path: Path, analysis_path: Path) -> dict:
    paper = extract_pdf_text(paper_path)
    analysis_text = extract_pdf_text(analysis_path)
    explanations = analysis_blocks(analysis_text)
    key = ANSWER_KEYS[year]
    expected_key_length = 40 if year == 2004 else 45
    if len(key) != expected_key_length:
        raise ValueError(f"{year} answer key has {len(key)} entries, expected {expected_key_length}")

    sec1_start = paper.index("Section I Use of English")
    sec2_start = paper.index("Section II Reading Comprehension")
    sec1 = paper[sec1_start:sec2_start]
    first_option = re.search(r"(?m)^\s*1\s*\.\s*(?:\[|A\s*[\.\uff0e])", sec1)
    if not first_option:
        raise ValueError(f"{year}: cannot locate cloze options")
    passage_start = sec1.find("points)", 0, first_option.start())
    if passage_start < 0:
        passage_start = sec1.find("points).", 0, first_option.start())
    cloze_passage = clean_passage(sec1[passage_start + len("points)"):first_option.start()])
    cloze_blocks = numbered_blocks(sec1[first_option.start():], list(range(1, 21)))
    cloze_questions = []
    for n in range(1, 21):
        opts = options_from(cloze_blocks.get(n, ""))
        if len(opts) != 4:
            raise ValueError(f"{year} Q{n}: found {len(opts)} cloze options")
        letter = key[n - 1]
        answer = next((opt for opt in opts if opt.startswith(letter + ".")), letter)
        cloze_questions.append(make_question(year, "01", "1", n, "完形填空", f"Blank {n}", answer, explanations.get(n, ""), opts))

    part_a_marker = re.search(r"Part\s*A", paper[sec2_start:])
    if not part_a_marker:
        raise ValueError(f"{year}: cannot locate Part A")
    part_a_start = sec2_start + part_a_marker.start()
    part_b_marker = re.search(r"Part\s*B", paper[part_a_start:])
    if not part_b_marker:
        raise ValueError(f"{year}: cannot locate Part B")
    part_b_start = part_a_start + part_b_marker.start()
    part_a = paper[part_a_start:part_b_start]
    text_marks = list(re.finditer(r"(?m)^Text\s*([1-4])\s*$", part_a))
    reading_sections = []
    for i, mark in enumerate(text_marks):
        segment = part_a[mark.end(): text_marks[i + 1].start() if i + 1 < len(text_marks) else len(part_a)]
        qnums = list(range(21 + i * 5, 26 + i * 5))
        first_q = re.search(rf"(?m)^\s*{qnums[0]}\s*\.\s*", segment)
        if not first_q:
            raise ValueError(f"{year}: cannot locate Reading Text {i + 1} questions")
        passage = clean_passage(segment[:first_q.start()])
        blocks = numbered_blocks(segment[first_q.start():], qnums)
        text_questions = []
        for n in qnums:
            block = blocks.get(n, "")
            opts = options_from(block)
            if len(opts) != 4:
                raise ValueError(f"{year} Q{n}: found {len(opts)} reading options")
            stem = clean(re.split(r"(?:\[\s*A\s*\]|(?<![A-Za-z])A\s*[\.\uff0e]\s+)", block, maxsplit=1)[0])
            letter = key[n - 1]
            answer = next((opt for opt in opts if opt.startswith(letter + ".")), letter)
            text_questions.append(make_question(year, "02", "1", n, "阅读理解 Part A", f"{n}. {stem}", answer, explanations.get(n, ""), opts))
        reading_sections.append({
            "id": f"english-{year}-02-1-text-{i + 1}",
            "name": f"Part A · Text {i + 1}",
            "passage": passage,
            "questions": text_questions,
        })

    section3_start = paper.index("Section III Writing")
    part_b_end_marker = re.search(r"Part\s*C", paper[part_b_start:section3_start])
    if year == 2004:
        part_b_end = section3_start
    elif part_b_end_marker:
        part_b_end = part_b_start + part_b_end_marker.start()
    else:
        raise ValueError(f"{year}: cannot locate Part C")
    part_b = clean(paper[part_b_start:part_b_end])
    choice_opts = options_from(part_b, "ABCDEFG")
    if year != 2004 and len(choice_opts) != 7:
        raise ValueError(f"{year}: found {len(choice_opts)} Part B options")
    part_b_questions = []
    if year != 2004:
        source = clean_passage(re.split(r"\[\s*A\s*\]", part_b, maxsplit=1)[0])
        marker = PART_B_PASSAGE_MARKERS.get(year)
        if marker and marker in choice_opts[-1]:
            choice, passage = choice_opts[-1].split(marker, 1)
            choice_opts[-1] = choice.strip()
            source = clean_passage(f"{marker}{passage}")
        for n in range(41, 46):
            letter = key[n - 1]
            answer = next((opt for opt in choice_opts if opt.startswith(letter + ".")), letter)
            part_b_questions.append(make_question(year, "02", "2", n, "阅读理解 Part B", f"Choose the sentence for blank ({n}).", answer, explanations.get(n, ""), choice_opts))

    if year == 2004:
        part_c = paper[part_b_start:section3_start]
    else:
        part_c = paper[part_b_end:section3_start]
    translation_questions = []
    translation_page = render_page(paper_path, -2) if year == 2008 else ""
    for offset, n in enumerate(range(41 if year == 2004 else 46, 46 if year == 2004 else 51)):
        marker = re.search(rf"\(\s*{n}\s*\)", part_c)
        next_marker = re.search(rf"\(\s*{n + 1}\s*\)", part_c) if offset < 4 else None
        if not marker:
            source = f"Underlined segment ({n}) in the source passage."
        else:
            end = next_marker.start() if next_marker else len(part_c)
            source = clean(part_c[marker.end():end])
        translation_questions.append(make_question(year, "02", "3", n, "英译汉", source, TRANSLATIONS[year][offset], "参考译文与原解析 PDF 核对；翻译题按意群、逻辑和关键词给分。", image=translation_page))

    writing = clean(paper[section3_start:])
    image = crop_writing_image(paper_path)
    writing_questions = []
    if year == 2004:
        prompt = re.sub(r"^Section III Writing\s*46\.\s*Directions:\s*", "", writing)
        writing_questions.append(make_question(year, "03", "1", 46, "写作", prompt, "参考范文见解析。", analysis_text[analysis_text.find("优秀范文解析") - 1500:][:6000], image=image))
    else:
        a = re.search(r"Part\s*A", writing)
        b = re.search(r"Part\s*B", writing)
        part_a_text = clean(writing[a.end():b.start()] if a and b else writing)
        part_b_text = clean(writing[b.end():] if b else "")
        write_start = max(analysis_text.rfind("Section", 0, len(analysis_text)), analysis_text.find("Part A", int(len(analysis_text) * .75)))
        write_analysis = analysis_text[write_start:] if write_start >= 0 else ""
        split_b = write_analysis.find("Part B")
        a_analysis = write_analysis[:split_b] if split_b >= 0 else write_analysis
        b_analysis = write_analysis[split_b:] if split_b >= 0 else write_analysis
        writing_questions.append(make_question(year, "03", "1", 51, "应用文写作", part_a_text, "参考范文见解析。", a_analysis[:6000]))
        writing_questions.append(make_question(year, "03", "2", 52, "短文写作", part_b_text, "参考范文见解析。", b_analysis[:6000], image=image))

    sections = [
        {"id": f"english-{year}-01-1", "name": "Section I Use of English", "passage": cloze_passage, "questions": cloze_questions},
    ]
    if part_b_questions:
        reading_sections.append({"id": f"english-{year}-02-2", "name": "Part B 新题型", "passage": source, "questions": part_b_questions})
    reading_sections.append({"id": f"english-{year}-02-3", "name": "Part C 英译汉" if year != 2004 else "Part B 英译汉", "questions": translation_questions})
    writing_sections = [{"id": f"english-{year}-03-1", "name": "写作" if year == 2004 else "Part A 应用文", "questions": writing_questions[:1]}]
    if year != 2004:
        writing_sections.append({"id": f"english-{year}-03-2", "name": "Part B 短文写作", "questions": writing_questions[1:]})
    return {
        "id": f"english-{year}", "name": f"{year}年考研英语真题", "description": "由真题与配套解析 PDF 拆分；题号、选项和答案已校验。", "source": "local",
        "chapters": [
            {"id": f"english-{year}-01", "name": "Section I 完形填空", "sections": sections},
            {"id": f"english-{year}-02", "name": "Section II 阅读理解", "sections": reading_sections},
            {"id": f"english-{year}-03", "name": "Section III 写作", "sections": writing_sections},
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--builtin-output", type=Path)
    parser.add_argument("--asset-dir", type=Path)
    args = parser.parse_args()
    papers = args.source / "1998-2009年考研英语真题"
    analyses = args.source / "1998-2009年考研英语解析"
    banks = []
    for year in range(2004, 2010):
        banks.append(build_year(year, papers / f"{year}年考研英语真题.pdf", analyses / f"{year}年考研英语真题解析.pdf"))
    payload = {"version": 1, "banks": banks}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.builtin_output and args.asset_dir:
        builtin_payload = copy.deepcopy(payload)
        args.asset_dir.mkdir(parents=True, exist_ok=True)
        for bank in builtin_payload["banks"]:
            for chapter in bank["chapters"]:
                for section in chapter["sections"]:
                    for question in section["questions"]:
                        image_url = question.get("imageUrl", "")
                        if not image_url.startswith("data:image/png;base64,"):
                            continue
                        content = base64.b64decode(image_url.split(",", 1)[1])
                        filename = f"asset-{hashlib.sha256(content).hexdigest()[:12]}.png"
                        (args.asset_dir / filename).write_bytes(content)
                        question["imageUrl"] = f"/builtin-english/{filename}"
        args.builtin_output.parent.mkdir(parents=True, exist_ok=True)
        args.builtin_output.write_text(json.dumps(builtin_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "banks": len(banks), "questions": sum(len(s["questions"]) for b in banks for c in b["chapters"] for s in c["sections"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
