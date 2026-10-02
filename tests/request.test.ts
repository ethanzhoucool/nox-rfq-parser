import { describe, expect, it } from "vitest";
import { REDACTED_KEY, buildRfqRequest, idempotencyKey, toCurl } from "@/lib/request";
import type { CreateRfqDto } from "@/lib/schema";

const payload: CreateRfqDto = { subject: "O'Brien's PO", lines: [{ alloy: "6061", temper: "T651", requested_quantity: 2 }] };

describe("Nox request", () => {
  it("derives a stable idempotency key from the body", async () => {
    const key = await idempotencyKey(payload);
    expect(key).toMatch(/^rfq-[0-9a-f]{40}$/);
    expect(await idempotencyKey(structuredClone(payload))).toBe(key);
    expect(await idempotencyKey({ ...payload, subject: "other" })).not.toBe(key);
  });

  it("builds a redacted POST /api/v1/rfqs request", async () => {
    const request = await buildRfqRequest(payload, "https://api.example.test");
    expect(request).toMatchObject({
      method: "POST",
      url: "https://api.example.test/api/v1/rfqs",
      headers: { "x-api-key": REDACTED_KEY, "Idempotency-Key": expect.stringMatching(/^rfq-/) },
      body: payload,
    });
  });

  it("renders a copyable curl that leaves the key as a shell variable", async () => {
    const curl = toCurl(await buildRfqRequest(payload, "https://api.example.test"));
    expect(curl).toContain(`-H "x-api-key: $NOX_API_KEY"`);
    expect(curl).toContain("curl -X POST 'https://api.example.test/api/v1/rfqs'");
    expect(curl).toContain(`O'\\''Brien'\\''s PO`);
  });
});
