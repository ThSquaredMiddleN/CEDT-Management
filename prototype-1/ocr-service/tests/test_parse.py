"""Screenshot and PDF parsing, on synthetic input."""
import tempfile
import unittest
from pathlib import Path

import helpers  # noqa: F401  (puts the service folder on sys.path)
from helpers import make_pdf
from receipt_parse import checks, parse_pdf, parse_screenshot
from server import stub_words


def states(kind, fields, term="1/2569", student_id="6800000021"):
    return {c["name"]: c["state"]
            for c in checks(kind, fields, {"term": term, "student_id": student_id}, seen_by=None)}


class ScreenshotParseTest(unittest.TestCase):
    def test_stub_words_give_all_fields(self):
        f = parse_screenshot(stub_words())
        self.assertEqual(f["semester"]["value"], "1/2569")
        self.assertEqual(f["name"]["value"], "นาย ทดสอบ ตัวอย่าง")
        self.assertEqual(f["student_id"]["value"], "680000…")
        self.assertEqual(f["amount"]["value"], "21,000.00")
        self.assertEqual(f["status"]["value"], "ชำระเงินสำเร็จ")
        self.assertEqual(f["paid_at"]["value"], "26 ธ.ค. 68 10:15")
        self.assertEqual(f["reference"]["value"], "1234567890123")
        self.assertEqual(f["type"]["value"], "ชำระผ่านแอป")
        self.assertTrue(f["reference"]["pii"])
        self.assertTrue(f["name"]["pii"])
        self.assertFalse(f["amount"]["pii"])
        self.assertEqual(f["amount"]["box"], [500, 40 + 2 * 70, 700, 80 + 2 * 70])

    def test_stub_words_pass_checks(self):
        f = parse_screenshot(stub_words())
        self.assertEqual(states("screenshot", f), {
            "All key fields read": "ok",
            "Payment completed": "ok",
            "Current semester": "ok",
            "Belongs to this student": "warn",  # screenshots show only the ID prefix
            "Not submitted before": "ok",
        })

    def test_failed_status_fails_payment_check(self):
        f = parse_screenshot(stub_words(status="ยกเลิกรายการ"))
        self.assertEqual(f["status"]["value"], "ยกเลิกรายการ")
        self.assertEqual(states("screenshot", f)["Payment completed"], "fail")

    def test_unsuccessful_status_is_not_paid(self):
        # "ไม่สำเร็จ" contains "สำเร็จ"; also OCR variants of ไม่ (tone mark dropped, ใ for ไ)
        for st in ("ชำระเงินไม่สำเร็จ", "ไม่สำเร็จ", "ไมสำเร็จ", "ใม่ สำเร็จ"):
            with self.subTest(status=st):
                f = parse_screenshot(stub_words(status=st))
                self.assertEqual(states("screenshot", f)["Payment completed"], "fail")

    def test_zero_amount_reports_funding_info(self):
        f = parse_screenshot(stub_words(amount="0.00"))
        self.assertEqual(f["amount"]["value"], "0.00")
        self.assertEqual(states("screenshot", f)["Funding"], "info")

    def test_wrong_student_id_prefix_fails(self):
        f = parse_screenshot(stub_words())
        self.assertEqual(states("screenshot", f, student_id="6900000021")["Belongs to this student"], "fail")

    def full_id_words(self):
        return [{**w, "text": w["text"].replace("680000)", "6800000021)")} for w in stub_words()]

    def test_full_student_id_on_a_screenshot_passes(self):
        f = parse_screenshot(self.full_id_words())
        self.assertEqual(f["student_id"]["value"], "6800000021")
        self.assertEqual(states("screenshot", f)["Belongs to this student"], "ok")

    def test_full_student_id_of_another_student_fails(self):
        f = parse_screenshot(self.full_id_words())
        self.assertEqual(states("screenshot", f, student_id="6800000022")["Belongs to this student"], "fail")

    def test_no_words_gives_no_fields(self):
        f = parse_screenshot([])
        self.assertEqual(f, {})
        self.assertIn("All key fields read", states("screenshot", f))
        self.assertEqual(states("screenshot", f)["All key fields read"], "fail")


class PdfParseTest(unittest.TestCase):
    def parse(self, data):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "receipt.pdf"
            path.write_bytes(data)
            fields, _ = parse_pdf(path)
        return fields

    def test_synthetic_pdfsharp_receipt(self):
        f = self.parse(make_pdf())
        self.assertEqual(f["template"]["value"], "PDFsharp (2568+)")
        self.assertEqual(f["receipt_no"]["value"], "1234567890")
        self.assertEqual(f["student_id"]["value"], "6800000021")
        self.assertEqual(f["name"]["value"], "Mr. Test Example")
        self.assertEqual(f["semester"]["value"], "1/2569")
        self.assertEqual(f["paid_at"]["value"], "December 26, 2025")
        self.assertEqual(f["amount"]["value"], "21,000.00")
        self.assertEqual(f["status"]["value"], "official receipt")
        self.assertNotIn("funding", f)

    def test_pdf_checks(self):
        f = self.parse(make_pdf())
        self.assertEqual(states("pdf", f), {
            "All key fields read": "ok",
            "Payment completed": "ok",
            "Current semester": "ok",
            "Belongs to this student": "ok",
            "Not submitted before": "ok",
        })

    def test_empty_pdf_has_only_the_template(self):
        f = self.parse(make_pdf(lines=[]))
        self.assertEqual(set(f), {"template"})
        self.assertEqual(states("pdf", f)["All key fields read"], "fail")


if __name__ == "__main__":
    unittest.main()
