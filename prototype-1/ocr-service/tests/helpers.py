"""Shared test helpers. Every receipt here is synthetic, generated in the test."""
import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

import pymupdf  # noqa: E402

PDF_LINES = [
    "No. 1234567890",
    "680 00000 21",
    "Mr. Test Example",
    "semester 1/2569",
    "December 26, 2025",
    "Total 21,000.00",
]


def make_pdf(lines=PDF_LINES, producer="PDFsharp 1.50 (test)"):
    doc = pymupdf.open()
    page = doc.new_page()
    y = 72
    for text in lines:
        page.insert_text((72, y), text, fontsize=11, fontname="helv")
        y += 40
    doc.set_metadata({"producer": producer})
    data = doc.tobytes()
    doc.close()
    return data
