"""Shared test helpers. Every receipt here is synthetic, generated in the test."""
import struct
import sys
import zlib
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


def make_pdf(lines=PDF_LINES, producer="PDFsharp 1.50 (test)", height=842):
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=height)
    y = 72
    for text in lines:
        page.insert_text((72, y), text, fontsize=11, fontname="helv")
        y += 40
    doc.set_metadata({"producer": producer})
    data = doc.tobytes()
    doc.close()
    return data


def make_png(width, height, alpha=False):
    """A plain white PNG of the given pixel size (synthetic, made in the test)."""
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, width, height), alpha)
    pix.clear_with(255)
    return pix.tobytes("png")


def crafted_png_header(width, height):
    """PNG signature and an IHDR chunk claiming this size, and nothing else: no raster, so it cannot be decoded.
    Enough for the header size check, which runs before any decode."""
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr + struct.pack(">I", zlib.crc32(b"IHDR" + ihdr))
    return b"\x89PNG\r\n\x1a\n" + chunk


def crafted_jpeg_header(width, height):
    """JPEG start-of-image, one SOF0 segment claiming this size, end-of-image. No scan data: cannot be decoded."""
    sof = struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"  # length, precision, size, 1 component
    return b"\xff\xd8\xff\xc0" + sof + b"\xff\xd9"
