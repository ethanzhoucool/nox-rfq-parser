# Sample documents

Realistic buyer RFQs and POs addressed to Nox Metals (sales@noxmetals.co). "Today" for all of them is **Fri 2026-10-02**. Every company, person, address, part number and contract number is fictional, and the phone numbers are in the 555-01xx range.

| File | What it is | What it tests |
|---|---|---|
| `01-sloppy-email.txt` | A one-paragraph email from a shop lead's iPhone | Fractions and inch marks, three different qty styles, a line with no alloy (inherits 6061 from the line before it, with a flag), no tempers anywhere (6061 has a single default; 7075 has two options and must be asked), "certs pls", and "thurs" resolving to 10/08 |
| `02-aerospace-po.pdf` | A 2-page SAP-style PO from an aerospace tier-2: header, bill-to/ship-to, ship-via/FOB, 3 lines, "TBD" pricing, and a T&C page | Spec callouts (AMS-QQ-A-250/12, AMS 4050, AMS 4027 + ASTM B209), DFARS on a line and order-wide, MTR + C of C, cut tolerance, and a **tight date** (10/05, 1 business day out) |
| `03-forwarded-thread.eml` | An Outlook FW: of a 3-message thread between purchasing and engineering | Applying edits in order: qty 10 becomes 15, the 2024 bar is cancelled, MIC-6 is added, 5083 "stays the same". Picks the right contact (purchasing, not the engineer) and the job # from the subject |
| `04-bom-export.xlsx` (+ `.csv` twin) | A PLM BOM export with metadata rows above the header | Qty/Assy vs Ext Qty columns, glued tempers (`AL6061T651`), `MIC6`, a row in **mm**, a purchased-hardware row to exclude, out-of-catalog 5052 sheet below 0.125" |
| `05-rfq-out-of-catalog.pdf` | An Epicor-style RFQ from a defense machine shop | **17-4 PH / AMS 5643** stainless in an aluminum RFQ (out of catalog), **qty 250** (over the API max of 200), quote-due date vs "2 WEEKS ARO" delivery, two certs on one line |
| `06-scanned-note.png` (+ `.pdf`, image only) | A photo of a handwritten memo-pad note, plus the same note as a scanned PDF with no text layer | Vision/OCR, "(3) 6061-T651" qty-first format, a **scribbled-out line** that must not be extracted, 5083 with no temper (H116 vs H321), and a **tight date** ("need Mon AM!!" = 10/05) |
| `07-ambiguous-bar.txt` | A short email from a marine fabricator | Bar vs plate: "1x6x48 bar" is a Rectangle (flat) bar with height and width; "2 x 2 x 24" with no form is probably Square bar. No tempers. "Domestic" is not DFARS. "End of month" |
| `08-round-bar.txt` | A round-bar RFQ with shop shorthand | `rd`/`dia`/`lg`, per-line cut tolerances (`+.06/-0`, `+/-.03`) that go to job_detail, **12 ft converted to 144"**, and 2024-T351 bar not in the catalog (only T3511 is) |
| `09-launch-vehicle-po.pdf` | A two-page PO from a fictional launch-vehicle maker, with an original logo drawn in code | Revision A changes line 20 qty (10 to 12); DFARS on **line 40 only** (Inconel 718, a true specialty metal); 2219-T87 and 718 aren't stocked, so both route to sales; line 50 temper is "per drawing"; AS9102 FAI and export-control clauses are noise for extraction |

They double as an evaluation set (`npm run eval`). The ground truth is in `expected/<basename>.json`. Each file has `expected` (a partial `ExtractedRfq` with plain values, not `Field` wrappers), `expected_flags` (`line_ref`, `field`, `severity`, `why`), and `notes` explaining what makes the sample hard. Both 04 files share `04-bom-export.json`, and both 06 files share `06-scanned-note.json`.

How to score against it:
- **Refs.** Where the document numbers its lines (02: 10–40, 04: Find #, 05: 1–4, 08: 1–3), `ref` uses the customer's numbers. Otherwise refs are `L1..Ln`. If the parser numbers lines differently, match lines by order.
- **Rectangle bar.** It uses `height_in` + `width_in` (Nox's `LineDimensionsDto`), not `thickness_in`. Square bar uses `width_in` only.
- **Flag fields.** Treat `field` as a soft match. One flag uses `"dimensions"` (the mm conversion in 04) and two header flags use `"lines"` and `"customer"`. Scoring flags on `(line_ref, severity)` is the robust choice.
- **`null`** means the value is genuinely not in the document. The parser should flag it, not guess.

## Regenerating

`_generator/generate.py` builds the PDFs, the XLSX/CSV and the PNG. `_generator/expected.py` writes `expected/*.json`. The text samples (01, 03, 07, 08) are hand-written. Sample 09's logo is drawn with reportlab vector shapes (`corvane_logo()`). Keep the generator dependencies out of the project root:

```bash
python3 -m venv /tmp/rfq-samples-venv
/tmp/rfq-samples-venv/bin/pip install reportlab openpyxl pillow
/tmp/rfq-samples-venv/bin/python samples/_generator/generate.py
python3 samples/_generator/expected.py   # stdlib only
```

The handwriting uses macOS system fonts (Bradley Hand, with Noteworthy and Marker Felt as fallbacks). On other systems it falls back to Pillow's default font. The output is seeded, so it's reproducible on the same machine.
