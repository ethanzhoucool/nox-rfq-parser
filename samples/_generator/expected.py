#!/usr/bin/env python3
"""Source of truth for samples/expected/*.json (hand-authored ground truth). Stdlib only.

    python3 samples/_generator/expected.py
"""
import json, pathlib
OUT = pathlib.Path(__file__).resolve().parent.parent / "expected"

def L(ref, alloy, temper, pt, shape, qty, *, t=None, w=None, l=None, d=None, h=None,
      compliance="none", certs=(), pn=None, tol=None):
    return {
        "ref": ref, "customer_part_number": pn, "alloy": alloy, "temper": temper,
        "product_type": pt, "shape": shape,
        "thickness_in": t, "width_in": w, "length_in": l, "height_in": h, "diameter_in": d,
        "quantity": qty, "cut_tolerance": tol, "compliance": compliance,
        "certifications": [{"family": f, "designation": des} for f, des in certs],
    }

def F(line_ref, field, severity, why):
    return {"line_ref": line_ref, "field": field, "severity": severity, "why": why}

def cust(name, company, email, phone):
    return {"name": name, "company": company, "email": email, "phone": phone}

samples = {}

samples["01-sloppy-email"] = {
  "expected": {
    "document_type": "email", "po_number": None, "job_number": None,
    "customer": cust("Mike Dombrowski", "Kessler Precision Machining", "mdombrowski@kesslerprecision.com", "(586) 555-0192"),
    "ship_to_address": None,
    "required_date": "2026-10-08", "mill_certs_required": True,
    "lines": [
      L("L1", "6061", None, "Plate", "Plate", 10, t=0.5, w=12, l=24),
      L("L2", "6061", None, "Plate", "Plate", 2, t=1.0, w=12, l=12),
      L("L3", "7075", None, "Plate", "Plate", 4, t=0.75, w=8, l=10),
    ],
  },
  "expected_flags": [
    F("L1", "temper", "warning", "No temper given. 6061 plate is stocked only as T651, so suggest T651 and confirm."),
    F("L2", "alloy", "warning", "\"also 2 pcs 1\\\" thick 12x12\" names no alloy; 6061 is inferred from the previous line (low/medium confidence). Confirm."),
    F("L2", "temper", "warning", "No temper; inherits 6061 plate default T651 only if the alloy inference holds."),
    F("L3", "temper", "warning", "No temper on 7075 plate. Nox stocks both T651 and T7351, so there is no safe default: ask the customer."),
    F(None, "required_date", "info", "\"need by thurs\" resolved relative to Fri 2026-10-02 to Thu 2026-10-08. Not tight (4 business days)."),
  ],
  "notes": "Phone-typed, no line structure, mixed dimension styles (1/2, 1\", 12x12, 3/4), qty in three formats (\"qty 10\", \"2 pcs\", \"(4 pcs)\"). L2 has no alloy and must borrow 6061 from L1 with a flag, not silently. No temper anywhere: 6061 has one stocked plate temper (default T651 is fine to suggest) but 7075 has two (T651/T7351), so L3 must be asked. \"certs pls\" means mill_certs_required=true. Signature address is the company address, not an explicit ship-to, so ship_to stays null. \"Sent from my iPhone\" is noise.",
}

samples["02-aerospace-po"] = {
  "expected": {
    "document_type": "po", "po_number": "4500118274", "job_number": None,
    "customer": cust("Dana Whitfield", "Arcturus Aerostructures, Inc.", "dwhitfield@arcturus-aero.com", "(316) 555-0129"),
    "ship_to_address": "Arcturus Aerostructures, Inc., Plant 3 - Receiving, Dock 7, 4500 N. Webb Road, Bldg 3, Wichita, KS 67226",
    "bill_to_address": "Arcturus Aerostructures, Inc., Attn: Accounts Payable, P.O. Box 7781, Wichita, KS 67277",
    "required_date": "2026-10-05", "mill_certs_required": True,
    "lines": [
      L("10", "7075", "T7351", "Plate", "Plate", 6, t=0.75, w=24, l=36, compliance="dfars",
        certs=[("QQ", "AMS-QQ-A-250/12")], pn="RM-7075-T7351-0750", tol="+.125/-0"),
      L("20", "7050", "T7451", "Plate", "Plate", 4, t=2.0, w=12, l=18, compliance="dfars",
        certs=[("AMS", "AMS 4050")], pn="RM-7050-T7451-2000"),
      L("30", "2024", "T351", "Plate", "Plate", 8, t=1.25, w=10, l=20, compliance="dfars",
        certs=[("QQ", "AMS-QQ-A-250/4")], pn="RM-2024-T351-1250"),
      L("40", "6061", "T651", "Plate", "Plate", 2, t=0.5, w=48, l=96, compliance="dfars",
        certs=[("AMS", "AMS 4027"), ("ASTM", "ASTM B209")], pn="RM-6061-T651-0500"),
    ],
  },
  "expected_flags": [
    F(None, "required_date", "warning", "Date required 10/05/2026 is the next business day after today (Fri 10/02): inside the 2-business-day window. Tight even for Nox next-day; confirm ship date before acknowledging, since the PO says 'time is of the essence'."),
    F("20", "compliance", "warning", "DFARS-compliant 7050-T7451 at 2.000\" thick: confirm DFARS/country-of-melt material is actually on the shelf in this size before committing to 10/05."),
    F(None, "compliance", "info", "Order-wide note 1 makes every line DFARS 252.225-7009, not just line 20. Aluminum isn't technically a 'specialty metal' under 7009, but the clause is flowed down, so treat all lines as compliance=dfars and certify country of melt."),
  ],
  "notes": "Clean ERP layout, but the facts are spread across the page: DFARS is stated on line 20 AND as order-wide note 1 (all four lines are dfars). MTR + C of C requirement is in the notes block. AMS-QQ-A-250/12 is the 7075 plate spec and carries no temper by itself; the temper T7351 comes from the description. AMS-QQ-A-250/4 is 2024 plate. Line 40 has two cert callouts (AMS 4027 + ASTM B209); B209 is a generic sheet/plate spec and implies no alloy. Line 10 cut tolerance +.125/-0 has no API field and must go into job_detail. Need-by 10/05 is a Monday, one business day out, so the tight-date flag should fire. Page 2 is T&C boilerplate with no line items. The DPAS rating and prime contract number are not job numbers.",
}

samples["03-forwarded-thread"] = {
  "expected": {
    "document_type": "email", "po_number": None, "job_number": "26-0417",
    "customer": cust("Rachel Okafor", "Lakeshore Fluid Power, Inc.", "rokafor@lakeshorefluidpower.com", "231.555.0138"),
    "ship_to_address": "Lakeshore Fluid Power, Inc., 2280 Sherman Blvd, Muskegon, MI 49441",
    "bill_to_address": "Lakeshore Fluid Power, Inc., 2280 Sherman Blvd, Muskegon, MI 49441",
    "required_date": "2026-10-09", "mill_certs_required": True,
    "lines": [
      L("L1", "6061", "T651", "Plate", "Plate", 15, t=1.5, w=6, l=10),
      L("L2", "5083", "H116", "Plate", "Plate", 5, t=0.375, w=24, l=48),
      L("L3", "MIC-6", None, "Plate", "Plate", 2, t=0.25, w=12, l=12),
    ],
  },
  "expected_flags": [
    F("L1", "quantity", "info", "Quantity changed mid-thread: original list said qty 10, Tom's latest email says 'make that 15 on the 6061'. Using 15."),
    F("L3", "temper", "warning", "MIC-6 given with no temper. It's cast tooling plate, catalogued only as F, so suggest F."),
    F(None, "lines", "info", "2024-T3511 1\" sq bar (qty 8) from the original list was cancelled ('scratch the 2024'), so it's excluded. The 4140 mention is steel for a different part and isn't a line."),
  ],
  "notes": "Newest-on-top Outlook thread: the line list is in the OLDEST message at the bottom, and the edits are in a later message above it. The parser has to apply changes in order: 6061 qty 10 becomes 15, the 2024 bar is dropped, MIC-6 is added, 5083 'stays the same'. The requester (Rachel, purchasing) is the customer contact, not Tom (engineering). Job number 26-0417 is in the subject. 'Usual saw cut tolerance' is not a numeric tolerance. The confidentiality disclaimer and the 4140 reference are distractors.",
}

samples["04-bom-export"] = {
  "expected": {
    "document_type": "spreadsheet", "po_number": None, "job_number": "HR-AMR-200-A00",
    "customer": cust("Priya Natarajan", "Halvorsen Robotics", "pnatarajan@halvorsenrobotics.com", "616-555-0109"),
    "ship_to_address": "Halvorsen Robotics, 3350 Kraft Ave SE, Grand Rapids, MI 49512",
    "required_date": "2026-10-16", "mill_certs_required": True,
    "lines": [
      L("10", "6061", "T651", "Plate", "Plate", 4, t=1.0, w=12, l=18, pn="HR-1001-A"),
      L("20", "6061", "T651", "Plate", "Plate", 8, t=0.75, w=8, l=30, pn="HR-1002-B"),
      L("30", "MIC-6", None, "Plate", "Plate", 2, t=0.5, w=18, l=24, pn="HR-1003"),
      L("40", "7075", "T651", "Plate", "Plate", 6, t=1.0, w=5.906, l=11.811, pn="HR-1010"),
      L("50", "6061", "T6511", "Bar", "Round", 4, d=1.25, l=36, pn="HR-1011"),
      L("70", "5052", "H32", "Plate", "Plate", 2, t=0.09, w=10, l=40, pn="HR-1020"),
    ],
  },
  "expected_flags": [
    F("30", "temper", "warning", "'MIC6' gives no temper. Normalize alloy to MIC-6; it's catalogued only as F, so suggest F."),
    F("40", "temper", "warning", "7075-T6 requested on plate. Nox stocks 7075 plate as T651 (and T7351). Normalized to T651; confirm T651 is acceptable."),
    F("40", "dimensions", "info", "Converted from mm: 25.4 x 150 x 300 mm = 1.000 x 5.906 x 11.811 in."),
    F("60", None, "info", "HR-2001 SHCS M6x20 is purchased hardware (Make/Buy = BUY, steel), not raw material. Excluded from the RFQ."),
    F("70", "alloy", "error", "5052-H32 isn't in the Nox catalog (no 5052 plate/sheet stocked). Route to sales or ask if 5083 is acceptable."),
    F("70", "thickness_in", "warning", "0.090\" is sheet gauge, below the 0.125\" minimum for stocked plate. Confirm."),
  ],
  "notes": "PLM export with 4 metadata rows above the real header (need date, contact, ship-to and 'certs required' are only in those rows). Two quantity columns: Qty/Assy and Ext Qty (Build Qty 2). The order quantity is Ext Qty; using Qty/Assy under-orders by half. Alloy formats vary: 'AL 6061-T651', 'AL6061T651' (temper glued on), 'MIC6' (no hyphen, no temper), '6061-T6511 RD' (shape in the material column). One row is in mm via the Units column only. One row is purchased hardware to exclude, and one row is out-of-catalog 5052 sheet. Refs follow the customer's Find # (10..70); eval may match by order if the parser uses L1..Ln. The .csv twin has identical content.",
}

samples["05-rfq-out-of-catalog"] = {
  "expected": {
    "document_type": "rfq", "po_number": "RFQ-26-0912", "job_number": None,
    "customer": cust("Kevin Marsh", "Ridgeline Defense Components", "kmarsh@ridgeline-dc.com", "(256) 555-0173"),
    "ship_to_address": "Ridgeline Defense Components, Shipping & Receiving, 1850 Sparkman Dr NW, Huntsville, AL 35816",
    "required_date": "2026-10-16", "mill_certs_required": True,
    "lines": [
      L("1", "6061", "T651", "Plate", "Plate", 250, t=0.625, w=12, l=12, compliance="dfars",
        certs=[("AMS", "AMS 4027")], pn="RDC-10442"),
      L("2", "17-4 PH", "H1025", "Bar", "Round", 20, d=1.5, l=12, compliance="dfars",
        certs=[("AMS", "AMS 5643")], pn="RDC-20871"),
      L("3", "7075", "T7351", "Plate", "Plate", 40, t=1.0, w=6, l=12, compliance="dfars",
        certs=[("AMS", "AMS 4078")], pn="RDC-30115"),
      L("4", "7075", "T651", "Bar", "Round", 12, d=3.0, l=18, compliance="dfars",
        certs=[("AMS", "AMS 4122"), ("QQ", "AMS-QQ-A-225/9")], pn="RDC-30220"),
    ],
  },
  "expected_flags": [
    F("1", "quantity", "error", "Qty 250 exceeds the Nox API max of 200 per line. Split into two lines (e.g. 200 + 50) or confirm with the customer."),
    F("2", "alloy", "error", "17-4 PH (CRES, AMS 5643, cond H1025) is precipitation-hardening stainless, outside Nox's aluminum catalog. Route to sales; the RFQ allows 'No Quote' per line."),
    F("2", "compliance", "error", "DFARS required on an alloy not in the catalog; can't be quoted through the API."),
    F(None, "required_date", "info", "Delivery is '2 WEEKS ARO' (after receipt of order), not a date. Assumed order today, so 2026-10-16. The 10/07 date is the quote due date, not delivery."),
  ],
  "notes": "Looks clean, but has two blockers: line 1 quantity over the API limit, and line 2 is stainless steel (17-4 PH / AMS 5643) in an aluminum RFQ. 'CRES' = corrosion-resistant steel and 'COND H1025' is a heat-treat condition, not an aluminum temper. The parser should keep the line and flag it, not drop it or force it into an aluminum alloy. AMS 4078 = 7075-T7351 plate. AMS 4122 + AMS-QQ-A-225/9 = 7075 bar (two certs on one line). Quote due date (10/07) vs delivery (2 wks ARO) is a classic date mix-up. DFARS is order-wide in the instructions block. The RFQ number goes in po_number as the customer reference; job_number is also acceptable.",
}

samples["06-scanned-note"] = {
  "expected": {
    "document_type": "other", "po_number": None, "job_number": None,
    "customer": cust("Tony V.", "Vukovich Tool & Die, Inc.", None, "586-555-0147"),
    "ship_to_address": None,
    "required_date": "2026-10-05", "mill_certs_required": True,
    "lines": [
      L("L1", "6061", "T651", "Plate", "Plate", 3, t=2.0, w=4, l=6),
      L("L2", "7075", "T651", "Plate", "Plate", 12, t=0.375, w=3, l=5),
      L("L3", "5083", None, "Plate", "Plate", 1, t=0.25, w=48, l=96),
    ],
  },
  "expected_flags": [
    F(None, "required_date", "warning", "'need Mon AM!!' = Mon 2026-10-05, the next business day after today (Fri 10/02). Tight. Confirm a Friday/same-day ship is possible."),
    F("L3", "temper", "warning", "5083 with no temper. Nox stocks 5083 plate in H116 and H321 (both marine grades), so there's no default: ask."),
    F(None, "lines", "info", "A fourth line '(2) 2024 1 x 6 x 6' is scribbled out and marked 'no'. It's excluded."),
    F(None, "customer", "info", "Handwritten note: no email. Contact is 'Tony V.' at the letterhead company's phone. 'PO to follow', so there's no PO number yet."),
  ],
  "notes": "Image-only input (PNG photo and an image-only scanned PDF with no text layer) of a handwritten memo-pad note. Quantity is in parentheses before the material ('(3) 6061-T651'), the opposite of the other samples. The struck-through 2024 line is still partly legible and must not be extracted. Company comes from the printed letterhead; the handwritten phone (586-555-0147) differs from the letterhead main line (586-555-0140), so prefer the handwritten one for the contact. 'certs w/ matl' = mill certs required. '1/4 x 48 x 96' is a full 4x8 sheet-size plate.",
}

samples["07-ambiguous-bar"] = {
  "expected": {
    "document_type": "email", "po_number": None, "job_number": None,
    "customer": cust("Glenn Sato", "Bayview Marine Fabrication LLC", "gsato@bayviewmarinefab.com", "810-555-0164"),
    "ship_to_address": "Bayview Marine Fabrication LLC, 1105 Water St, Port Huron, MI 48060",
    "required_date": "2026-10-31", "mill_certs_required": None,
    "lines": [
      L("L1", "6061", None, "Bar", "Rectangle", 20, h=1.0, w=6, l=48, compliance="domestic"),
      L("L2", "6061", None, "Bar", "Square", 8, w=2.0, l=24, compliance="domestic"),
      L("L3", "7075", None, "Bar", "Rectangle", 5, h=1.5, w=3, l=12, compliance="domestic"),
    ],
  },
  "expected_flags": [
    F("L1", "shape", "warning", "'1x6x48 bar' read as 1\" x 6\" rectangular (flat) bar, 48\" long. Could also mean a 1\" plate strip cut 6 x 48. Confirm bar vs plate."),
    F("L1", "temper", "warning", "6061 bar with no temper. Nox stocks T6511 (extruded) and T651. Ask."),
    F("L2", "product_type", "warning", "'6061 2 x 2 x 24' has no form. Read as 2\" square bar x 24\" long (medium confidence). Confirm it isn't plate."),
    F("L2", "temper", "warning", "No temper for 6061 bar (T6511 or T651)."),
    F("L3", "temper", "warning", "7075 flat bar with no temper. Nox stocks T6511 and T651. Ask."),
    F(None, "compliance", "info", "Buyer asked for 'domestic material only' for a Coast Guard end use. Mapped to compliance=domestic, not dfars. Ask whether DFARS 252.225-7009 country-of-melt certs are actually required."),
    F(None, "mill_certs_required", "info", "Certs not mentioned. For a government end use, ask if MTRs are needed."),
  ],
  "notes": "Every line is shape-ambiguous and none has a temper. 'bar' + 1x6 means flat/rectangle bar: Nox models that as product_type Bar, shape Rectangle with height (1) and width (6), not thickness. '2 x 2 x 24' with no form word is most likely square bar (width 2, length 24, no thickness or height). '1 1/2 x 3 x 12 flat' has a mixed fraction with a space. 'Domestic' isn't DFARS. 'End of month' resolves to 2026-10-31 (a Saturday); 2026-10-30, the last business day, is also an acceptable answer. Ship-to is inferred from 'freight to Port Huron' + signature (medium confidence). The export-control footer is boilerplate.",
}

samples["08-round-bar"] = {
  "expected": {
    "document_type": "email", "po_number": None, "job_number": "7731",
    "customer": cust("Luis Herrera", "Summit Motorsport Engineering", "lherrera@summitmotorsport-eng.com", "(704) 555-0186"),
    "ship_to_address": None,
    "required_date": "2026-10-07", "mill_certs_required": True,
    "lines": [
      L("1", "7075", "T651", "Bar", "Round", 6, d=2.5, l=12, tol="+.06/-0"),
      L("2", "6061", "T6511", "Bar", "Round", 4, d=1.0, l=144),
      L("3", "2024", "T351", "Bar", "Round", 10, d=0.75, l=36, tol="+/-.03"),
    ],
  },
  "expected_flags": [
    F("2", "length_in", "info", "Length given as '12 ft', converted to 144\". 'Full lengths ok, don't cut': confirm 12' mill lengths are stocked."),
    F("3", "temper", "error", "2024-T351 round bar isn't in the catalog for Bar (Nox stocks 2024 bar as T3511). Ask if 2024-T3511 is acceptable or route to sales."),
  ],
  "notes": "Shorthand: 'rd' = round, 'lg' = long, 'dia' = diameter, 'w/' = with. Cut tolerances differ per line ('+.06/-0' asymmetric, '+/-.03' symmetric, none on line 2) and have no API field, so they go in job_detail. Line 2 length is in FEET (12 ft = 144 in). Line 3 uses a temper that is real for rolled/drawn 2024 bar but isn't in Nox's bar catalog (T3511). Need-by Wed 10/7 is 3 business days out, so not tight (boundary check: < today+2bd = 10/06). Job 7731 is in the subject.",
}

for name, body in samples.items():
    (OUT / f"{name}.json").write_text(json.dumps(body, indent=2) + "\n")
    print("wrote", name)
