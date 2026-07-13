import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_yuge_math_banks import leading_number, parse_question_label, parse_source_folder


class SourceStyleParsingTests(unittest.TestCase):
    def test_source_folder_styles(self) -> None:
        self.assertEqual(parse_source_folder("01 例题.assets"), (1, "例题"))
        self.assertEqual(parse_source_folder("第1讲-示例.assets"), (1, "例题"))
        self.assertEqual(parse_source_folder("第01章_练习题.assets"), (1, "习题"))
        self.assertEqual(parse_source_folder("01习题.assets"), (1, "习题"))

    def test_compact_export_name(self) -> None:
        self.assertEqual(parse_question_label("0101 ", 1), 1)
        self.assertEqual(parse_question_label("0912", 9), 12)

    def test_example_label_styles(self) -> None:
        self.assertEqual(parse_question_label("例1.1", 1), 1)
        self.assertEqual(parse_question_label("【例 1-1】", 1), 1)
        self.assertEqual(parse_question_label("P22-[例1.1]", 1), 1)
        self.assertEqual(parse_question_label("示例1", 1), 1)

    def test_exercise_label_styles(self) -> None:
        self.assertEqual(parse_question_label("第12题", 3), 12)
        self.assertEqual(parse_question_label("（12）", 3), 12)
        self.assertEqual(parse_question_label("练习题12", 3), 12)

    def test_rejects_a_different_chapter(self) -> None:
        self.assertIsNone(parse_question_label("例2.1", 1))
        self.assertIsNone(parse_question_label("说明1.1", 1))

    def test_nested_36_chapter_and_lesson_names(self) -> None:
        self.assertEqual(leading_number("02 线代9讲"), 2)
        self.assertEqual(leading_number("第1讲 行列式"), 1)


if __name__ == "__main__":
    unittest.main()
