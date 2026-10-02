import { addBusinessDays } from "./dates";
import type { Confidence, ExtractedLine, Extraction, Field } from "./schema";

export const MOCK_MODEL = "mock (MOCK_LLM=1)";

const f = <T,>(value: T | null, confidence: Confidence = "high", source: string | null = null): Field<T> => ({
  value,
  confidence,
  source: value === null ? null : source,
});

const EMPTY_LINE = {
  customer_part_number: f<string>(null),
  temper: f<string>(null),
  thickness_in: f<number>(null),
  width_in: f<number>(null),
  length_in: f<number>(null),
  height_in: f<number>(null),
  diameter_in: f<number>(null),
  outer_diameter_in: f<number>(null),
  outer_dimension_in: f<number>(null),
  wall_thickness_in: f<number>(null),
  cut_tolerance: f<string>(null),
  compliance: f<"none" | "dfars" | "domestic">(null),
  certifications: [],
  notes: null,
} satisfies Partial<ExtractedLine>;

/** Canned extraction of a fictional aerospace PO, used when MOCK_LLM=1 so the app runs end to end without a key. */
export function mockExtraction(today: string): Extraction {
  const lines: ExtractedLine[] = [
    {
      ...EMPTY_LINE,
      ref: "10",
      description_raw: "6061-T6 PLATE .500 X 12.00 X 24.00 PER AMS-QQ-A-250/11 QTY 10 EA",
      customer_part_number: f("HAS-2201-03", "high", "P/N HAS-2201-03"),
      alloy: f("6061", "high", "6061-T6 PLATE"),
      temper: f("T6", "high", "6061-T6 PLATE"),
      product_type: f("Plate", "high", "6061-T6 PLATE"),
      shape: f("Plate", "high", "PLATE"),
      thickness_in: f(0.5, "high", ".500 X 12.00 X 24.00"),
      width_in: f(12, "high", ".500 X 12.00 X 24.00"),
      length_in: f(24, "high", ".500 X 12.00 X 24.00"),
      quantity: f(10, "high", "QTY 10 EA"),
      cut_tolerance: f("+.125/-0", "high", "SAW CUT +.125/-0"),
      compliance: f("dfars", "medium", "ALL MATERIAL DFARS COMPLIANT"),
      certifications: [{ family: "QQ", designation: "AMS-QQ-A-250/11", source: "PER AMS-QQ-A-250/11" }],
    },
    {
      ...EMPTY_LINE,
      ref: "20",
      description_raw: "7050-T7451 PLT 2.000 X 18 X 36 PER AMS 4050 DFARS QTY 4",
      alloy: f("7050", "high", "7050-T7451 PLT"),
      temper: f("T7451", "high", "7050-T7451 PLT"),
      product_type: f("Plate", "high", "PLT"),
      shape: f("Plate", "high", "PLT"),
      thickness_in: f(2, "high", "2.000 X 18 X 36"),
      width_in: f(18, "high", "2.000 X 18 X 36"),
      length_in: f(36, "high", "2.000 X 18 X 36"),
      quantity: f(4, "high", "QTY 4"),
      compliance: f("dfars", "high", "DFARS"),
      certifications: [{ family: "AMS", designation: "AMS 4050", source: "PER AMS 4050" }],
    },
    {
      ...EMPTY_LINE,
      ref: "30",
      description_raw: "7075 FLAT BAR 1 X 3 X 144 QTY 250 PCS",
      alloy: f("7075", "high", "7075 FLAT BAR"),
      product_type: f("Bar", "high", "FLAT BAR"),
      shape: f("Rectangle", "medium", "FLAT BAR"),
      height_in: f(1, "medium", "1 X 3 X 144"),
      width_in: f(3, "medium", "1 X 3 X 144"),
      length_in: f(144, "high", "1 X 3 X 144"),
      quantity: f(250, "high", "QTY 250 PCS"),
      compliance: f("dfars", "medium", "ALL MATERIAL DFARS COMPLIANT"),
    },
    {
      ...EMPTY_LINE,
      ref: "40",
      description_raw: "6061 PLATE 12.7MM X 300MM X 600MM QTY 5",
      alloy: f("6061", "high", "6061 PLATE"),
      product_type: f("Plate", "high", "6061 PLATE"),
      shape: f("Plate", "high", "PLATE"),
      thickness_in: f(12.7, "medium", "12.7MM"),
      width_in: f(300, "medium", "300MM"),
      length_in: f(600, "medium", "600MM"),
      quantity: f(5, "high", "QTY 5"),
      compliance: f("dfars", "medium", "ALL MATERIAL DFARS COMPLIANT"),
    },
    {
      ...EMPTY_LINE,
      ref: "50",
      description_raw: "17-4 PH RD BAR 1.500 DIA X 12.00 LG PER AMS 5643 QTY 2",
      alloy: f("17-4PH", "high", "17-4 PH RD BAR"),
      temper: f("H1025", "low", "AMS 5643"),
      product_type: f("Bar", "high", "RD BAR"),
      shape: f("Round", "high", "RD BAR"),
      diameter_in: f(1.5, "high", "1.500 DIA"),
      length_in: f(12, "high", "12.00 LG"),
      quantity: f(2, "high", "QTY 2"),
      compliance: f("dfars", "medium", "ALL MATERIAL DFARS COMPLIANT"),
      certifications: [{ family: "AMS", designation: "AMS 5643", source: "PER AMS 5643" }],
    },
  ];

  return {
    rfq: {
      document_type: "po",
      po_number: f("4500-118273", "high", "PURCHASE ORDER NO. 4500-118273"),
      job_number: f("J-77412", "high", "JOB J-77412"),
      customer: {
        name: f("Dana Whitfield", "high", "Buyer: Dana Whitfield"),
        company: f("Halvorsen Aero Structures", "high", "HALVORSEN AERO STRUCTURES, INC."),
        email: f("dwhitfield@halvorsen-aero.example", "high", "dwhitfield@halvorsen-aero.example"),
        phone: f("(248) 555-0143", "high", "Tel (248) 555-0143"),
      },
      ship_to_address: f(
        "Halvorsen Aero Structures, Receiving Dock 3, 2200 Featherstone Rd, Auburn Hills, MI 48326",
        "high",
        "SHIP TO: Receiving Dock 3, 2200 Featherstone Rd, Auburn Hills, MI 48326",
      ),
      bill_to_address: f<string>(null),
      required_date: f(addBusinessDays(today, 1), "medium", "REQUIRED ON DOCK: next business day"),
      mill_certs_required: f(true, "high", "MILL TEST REPORTS REQUIRED WITH SHIPMENT"),
      lines,
      general_notes: "ALL MATERIAL DFARS COMPLIANT (252.225-7009). MILL TEST REPORTS REQUIRED WITH SHIPMENT.",
    },
    flags: [
      {
        severity: "warning",
        line_ref: "20",
        field: "compliance",
        message: "DFARS required on 7050 plate; confirm melt source documentation is available.",
        suggested_question: "Line 20: DFARS on the 7050-T7451. Do you need the melt country on the cert, or is a DFARS statement on the C of C enough?",
      },
      {
        severity: "info",
        line_ref: "30",
        field: "height_in",
        message: "Flat bar read as 1\" thick × 3\" wide × 144\" long.",
        suggested_question: null,
      },
    ],
  };
}
