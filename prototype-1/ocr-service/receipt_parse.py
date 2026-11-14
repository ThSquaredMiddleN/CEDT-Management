"""Pull the fields a receipt check needs out of a CU tuition receipt, then run the checks.

Two sources:
- PDF receipts: the text layer (pymupdf). Two templates: PDFsharp (2568+, Thai readable) and
  MS Reporting Services (2567 and some 2568, Thai garbled by the font encoding), so match English labels.
- CU NEX app screenshots: OCR lines [{text, left, top, right, bottom}]. Each value sits on the same row as
  its Thai label, to the right. Engines without boxes (Typhoon) fall back to matching label and value by line.

Every field is {"value", "box", "pii"}; box is [left, top, right, bottom] in the source's own units
(image pixels, or PDF points) so the demo can highlight it.
"""
import re
from datetime import date
from difflib import SequenceMatcher

MONEY = r"\d{1,3}(?:,\d{3})*\.\d{2}"
TERM = r"([123])\s*/\s*(25\d\d)"
TITLE = r"(?:ค่?าเล่?าเรียน|การศึกษา)\S*\s*" + TERM  # EasyOCR drops the tone marks

# Screenshot labels, top to bottom. Phone and channel are left out on purpose (not needed; PDPA minimisation).
LABELS = {
    "amount": "ยอดรวม",
    "status": "สถานะการชำระเงิน",
    "paid_at": "ชำระเงินเมื่อวันที่",
    "reference": "หมายเลขอ้างอิง",
    "type": "ประเภทการชำระ",
}


def norm(s):
    # SARA AM sometimes comes out as NIKHAHIT + SARA AA
    return s.replace("ํา", "ำ").strip()


def fld(value, box=None, pii=False):
    return {"value": value, "box": box, "pii": pii}


def boxof(w):
    return [w["left"], w["top"], w["right"], w["bottom"]]


# ---------- screenshots ----------

def parse_screenshot(words):
    words = [{**w, "text": norm(w["text"])} for w in words if w["text"].strip()]
    if all(w["right"] == 0 for w in words):
        return _parse_lines("\n".join(w["text"] for w in words))
    width = max(w["right"] for w in words)
    words = _join_words(words, width)
    out = {}

    for w in words:
        if "semester" not in out and (m := re.search(TITLE, w["text"])):
            out["semester"] = fld(f"{m[1]}/{m[2]}", boxof(w))
        if "name" not in out and (m := re.search(r"^(.*?)\s*\(?\s*รหัสนิสิต\s*(\d+)", w["text"])):
            out["name"] = fld(m[1].strip(), boxof(w), pii=True)
            out["student_id"] = fld(shown_id(m[2]), boxof(w), pii=True)

    for key, label in LABELS.items():
        cands = [w for w in words if w["left"] < width * 0.45]
        best = max(cands, key=lambda w: SequenceMatcher(None, w["text"], label).ratio(), default=None)
        if not best or SequenceMatcher(None, best["text"], label).ratio() < 0.7:
            continue
        mid = (best["top"] + best["bottom"]) / 2
        row = [w for w in words if w["left"] > best["right"] + 20
               and abs((w["top"] + w["bottom"]) / 2 - mid) < width * 0.04]
        if row:
            v = max(row, key=lambda w: w["right"] - w["left"])
            _screenshot_value(out, key, v["text"], boxof(v))
    return out


def _join_words(words, width):
    """Merge word-level boxes (Vision) into phrases: same row, small horizontal gap. Line-level engines pass through."""
    mid = lambda w: (w["top"] + w["bottom"]) / 2
    bands = []  # words whose vertical centres are close, then split each band where the gap is wide
    for w in sorted(words, key=mid):
        if bands and abs(mid(bands[-1][0]) - mid(w)) < (w["bottom"] - w["top"]) * 0.6:
            bands[-1].append(w)
        else:
            bands.append([w])
    rows = []
    for band in bands:
        band.sort(key=lambda w: w["left"])
        rows.append([band[0]])
        for w in band[1:]:
            if w["left"] - rows[-1][-1]["right"] < width * 0.04:
                rows[-1].append(w)
            else:
                rows.append([w])
    out = []
    for r in rows:
        text = r[0]["text"]
        for a, b in zip(r, r[1:]):
            # Vision splits Thai into unspaced segments; keep a space only where the image has a real gap
            text += (" " if b["left"] - a["right"] > (b["bottom"] - b["top"]) * 0.25 else "") + b["text"]
        out.append({"text": text, "left": min(w["left"] for w in r), "top": min(w["top"] for w in r),
                    "right": max(w["right"] for w in r), "bottom": max(w["bottom"] for w in r)})
    return out


def _parse_lines(text):
    """Fallback for box-less output (Typhoon: Markdown plus HTML tables). A value sits after its label on the
    same line or table row, or on the next line."""
    out = {}
    text = re.sub(r"</t[dh]>\s*<t[dh][^>]*>", " : ", norm(text))  # table cell break → label : value
    text = re.sub(r"<tr[^>]*>|</tr>|<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    lines = [l for l in (re.sub(r"[|*#]", " ", l).strip() for l in text.splitlines()) if l]
    for i, l in enumerate(lines):
        if "semester" not in out and (m := re.search(TITLE, l)):
            out["semester"] = fld(f"{m[1]}/{m[2]}")
        if "name" not in out and (m := re.search(r"^(.*?)\s*\(?\s*รหัสนิสิต\s*(\d+)", l)):
            out["name"] = fld(m[1].strip(), pii=True)
            out["student_id"] = fld(shown_id(m[2]), pii=True)
        for key, label in LABELS.items():
            if key not in out and label in l:
                rest = l.split(label, 1)[1].strip(" :")
                if not rest and i + 1 < len(lines):
                    rest = lines[i + 1]
                _screenshot_value(out, key, rest, None)
    return out


def _screenshot_value(out, key, text, box):
    if key == "amount" and (m := re.search(MONEY, text)):
        out["amount"] = fld(m[0], box)
    elif key == "paid_at" and (m := re.search(r"(\d{1,2}\s*\S+\s*\d{2})\s*\(?\s*(\d{1,2}:\d{2})?", text)):
        out["paid_at"] = fld(m[1] + (f" {m[2]}" if m[2] else ""), box)
    elif key == "reference" and (m := re.search(r"\d{10,}", text.replace(" ", ""))):
        out["reference"] = fld(m[0], box, pii=True)
    elif key in ("status", "type") and text:
        out[key] = fld(text, box)


# ---------- PDFs ----------

def parse_pdf(path):
    import pymupdf
    with pymupdf.open(path) as doc:  # closed before return, so the caller can delete the file
        page = doc[0]
        producer = doc.metadata.get("producer") or ""
        blocks = [(list(b[:4]), b[4]) for b in page.get_text("blocks")]
        rect = page.rect
    flat = " ".join(re.sub(r"\s+", " ", t) for _, t in blocks)
    out = {"template": fld("PDFsharp (2568+)" if "PDFsharp" in producer
                           else "MS Reporting Services" if "Reporting" in producer else producer or "unknown")}
    if not flat.strip():
        return out, rect

    def find(pattern, flags=0):
        for box, t in blocks:
            if m := re.search(pattern, re.sub(r"\s+", " ", t), flags):
                return m, [round(v, 1) for v in box]
        return None, None

    m, box = find(r"(?:No\.?\s*(\d{8,12}))|(?:(\d{8,12})\s*เลขที่ NO)", re.I)
    if m:
        out["receipt_no"] = fld(m[1] or m[2], box, pii=True)
    m, box = find(r"\b(\d{3} \d{5} \d{2})\b")
    if m:
        out["student_id"] = fld(m[1].replace(" ", ""), box, pii=True)
    m, box = find(r"\b(?:Mr|Mrs|Ms|Miss)\.? [A-Z][A-Za-z.' -]+")
    if m:
        out["name"] = fld(m[0].strip(), box, pii=True)
    m, box = find(r"semester.*?" + TERM, re.I)
    if not m:
        m, box = find(TERM)
    if m:
        out["semester"] = fld(f"{m[1]}/{m[2]}", box)
    # The PDFsharp template splits "December 26," and "2025" into two blocks
    if dm := re.search(r"\b([A-Z][a-z]+ \d{1,2}),\s*(\d{4})\b", flat):
        _, box = find(re.escape(dm[1]))
        out["paid_at"] = fld(f"{dm[1]}, {dm[2]}", box)

    total = next(((b, t) for b, t in blocks if "Total" in t), None)
    if total:
        m = re.search(MONEY, total[1])
        if not m:  # MS Reporting Services puts the total in its own block on the same row
            row = [(b, t) for b, t in blocks if abs(b[1] - total[0][1]) < 6 and re.search(MONEY, t)]
            if row:
                total, m = row[0], re.search(MONEY, row[0][1])
        if m:
            out["amount"] = fld(m[0], [round(v, 1) for v in total[0]])

    # Loan (กยศ.): PDFsharp prints it in readable Thai. MS Reporting Services garbles the Thai, but a loan
    # receipt has an extra block on the "Payment by" row, which an ordinary receipt doesn't.
    if "กยศ" in flat:
        b = next(b for b, t in blocks if "กยศ" in t)
        out["funding"] = fld("กยศ. student loan", [round(v, 1) for v in b])
    else:
        pay = next((b for b, t in blocks if "Payment by" in t), None)
        extra = [b for b, t in blocks if pay and abs(b[1] - pay[1]) < 6 and b[0] > pay[0] + 150
                 and "Financial Division" not in t]
        if extra:
            out["funding"] = fld("second payer listed (likely กยศ.; Thai text unreadable)",
                                 [round(v, 1) for v in extra[0]])
    out["status"] = fld("official receipt")
    return out, rect


STUDENT_ID_DIGITS = 10


def shown_id(digits):
    """The app cuts the ID short when the name is long; mark a cut-off ID with an ellipsis."""
    return digits if len(digits) >= STUDENT_ID_DIGITS else digits + "…"


# ---------- checks ----------

def current_term(today=None):
    """CU terms in B.E.: 1 = Aug-Dec, 2 = Jan-May, 3 = Jun-Jul (summer)."""
    d = today or date.today()
    be = d.year + 543
    return f"1/{be}" if d.month >= 8 else f"2/{be - 1}" if d.month <= 5 else f"3/{be - 1}"


def checks(kind, f, expected, seen_by):
    """expected: {term, student_id}; seen_by: the other file this reference was already seen in, if any."""
    val = lambda k: (f.get(k) or {}).get("value")
    res = []

    def add(name, state, detail):
        res.append({"name": name, "state": state, "detail": detail})

    need = ["semester", "amount", "student_id"] + (["status", "reference"] if kind == "screenshot" else ["receipt_no"])
    missing = [k for k in need if not val(k)]
    add("All key fields read", "fail" if missing else "ok",
        "missing: " + ", ".join(missing) if missing else f"{len(need)} of {len(need)} found")

    if kind == "screenshot":
        st = val("status") or ""
        # "ไม่สำเร็จ" = not successful; OCR may drop or swap the tone mark / vowel of ไม่
        paid = bool(re.search(r"ส\S{0,2}เร็จ", st)) and not re.search(r"[ไใ]ม\S?\s*ส\S{0,2}เร็จ", st)
        add("Payment completed", "ok" if paid else "fail", st or "status not found")
    else:
        add("Payment completed", "ok", "official receipt (but no digital signature, so it could be edited)")

    term = expected.get("term")
    if term:
        add("Current semester", "ok" if val("semester") == term else "fail",
            f"receipt {val('semester') or '?'}, expected {term}")

    sid = re.sub(r"\D", "", expected.get("student_id") or "")
    got = re.sub(r"\D", "", val("student_id") or "")
    if sid:
        if not got:
            add("Belongs to this student", "fail", "no student ID found")
        elif kind == "screenshot" and got != sid:
            # A long name pushes the ID off the screen, so only its first digits are readable.
            add("Belongs to this student", "warn" if sid.startswith(got) else "fail",
                f"only the first {len(got)} digits are shown; confirm with the name" if sid.startswith(got)
                else "ID does not match")
        else:
            add("Belongs to this student", "ok" if got == sid else "fail",
                "full ID matches" if got == sid else "ID does not match")

    ref = val("reference") or val("receipt_no")
    if ref:
        add("Not submitted before", "fail" if seen_by else "ok",
            f"same reference already seen in {seen_by}" if seen_by else "reference not seen before (this session)")

    loan = val("funding") or (kind == "screenshot" and val("amount") == "0.00" and "0.00 shown (paid by กยศ. or waived)")
    if loan:
        add("Funding", "info", loan)
    return res
