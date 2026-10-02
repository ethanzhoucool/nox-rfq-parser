import { describe, expect, it } from "vitest";
import { buildPayload } from "@/lib/payload";
import { known, line, rfq, unknown } from "./fixtures";

describe("buildPayload", () => {
  it("maps a plate line to the Nox RfqLineDto", () => {
    const payload = buildPayload(
      rfq({
        lines: [
          line({
            customer_part_number: known("BRK-100"),
            cut_tolerance: known("+.125/-0"),
            compliance: known("dfars"),
            certifications: [{ family: "QQ", designation: "QQ-A-250/11", source: "per QQ-A-250/11" }],
          }),
        ],
        po_number: known("PO-7781"),
        required_date: known("2026-10-15"),
        mill_certs_required: known(true),
        customer: { name: known("Mike D"), company: known("Kessler Precision"), email: unknown(), phone: unknown() },
      }),
    );

    expect(payload).toEqual({
      subject: "PO PO-7781 · Kessler Precision · need by 2026-10-15",
      customer: { name: "Mike D", company: "Kessler Precision" },
      lines: [
        {
          ref: "L1",
          alloy: "6061",
          product_type: "Plate",
          shape: "Plate",
          temper: "T651",
          thickness: 0.5,
          width: 12,
          length: 24,
          requested_quantity: 10,
          compliance: "dfars",
          job_detail: "PO PO-7781; Cust P/N BRK-100; Cut tol +.125/-0; Need by 2026-10-15; Mill certs (MTR) required",
          certifications: [{ family: "QQ", designation: "QQ-A-250/11" }],
        },
      ],
    });
  });

  it("sends only the dimensions that belong to the shape", () => {
    const [bar] = buildPayload(
      rfq({
        lines: [
          line({
            product_type: known("Bar"),
            shape: known("Round"),
            thickness_in: known(1),
            diameter_in: known(2.5),
            length_in: known(12),
          }),
        ],
      }),
    ).lines;
    expect(bar).toMatchObject({ diameter: 2.5, length: 12 });
    expect(bar).not.toHaveProperty("thickness");
    expect(bar).not.toHaveProperty("width");
  });

  it("defaults plate shape and omits empty optional fields", () => {
    const payload = buildPayload(rfq({ lines: [line({ shape: unknown(), temper: unknown() })] }));
    expect(payload).not.toHaveProperty("subject");
    expect(payload).not.toHaveProperty("customer");
    expect(payload.lines[0].shape).toBe("Plate");
    expect(payload.lines[0]).not.toHaveProperty("temper");
    expect(payload.lines[0]).not.toHaveProperty("job_detail");
  });

  it("skips lines the API would reject outright", () => {
    expect(buildPayload(rfq({ lines: [line({ alloy: unknown() }), line({ ref: "L2", quantity: unknown() })] })).lines).toEqual([]);
  });

  it("caps certifications at 10 per line", () => {
    const certifications = Array.from({ length: 12 }, (_, i) => ({ family: "AMS" as const, designation: `AMS ${4000 + i}`, source: null }));
    expect(buildPayload(rfq({ lines: [line({ certifications })] })).lines[0].certifications).toHaveLength(10);
  });
});
