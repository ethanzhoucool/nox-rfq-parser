import { describe, expect, it } from "vitest";
import { buildQuestionsEmail } from "@/lib/email";
import { ruleFlag } from "@/lib/flags";
import { known, rfq, unknown } from "./fixtures";

const question = (q: string | null) => ruleFlag(q ?? "none", { severity: "warning", line_ref: "L1", field: "temper", message: "m", suggested_question: q });

describe("buildQuestionsEmail", () => {
  it("numbers unique questions and greets the buyer by first name", () => {
    const email = buildQuestionsEmail(
      rfq({ customer: { name: known("Mike Dombrowski"), company: unknown(), email: unknown(), phone: unknown() }, po_number: known("7781") }),
      [question("Which temper?"), question("Which temper?"), question(null), question("How many?")],
    );
    expect(email).toContain("Hi Mike,");
    expect(email).toContain("for PO 7781");
    expect(email).toContain("1. Which temper?\n2. How many?");
  });

  it("returns null when there is nothing to ask", () => {
    expect(buildQuestionsEmail(rfq(), [question(null)])).toBeNull();
  });
});
