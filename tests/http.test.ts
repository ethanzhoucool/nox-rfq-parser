import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as parse } from "@/app/api/parse/route";
import { POST as submit } from "@/app/api/submit/route";
import { assertSameOrigin } from "@/lib/http";

const URL = "http://127.0.0.1:3000/api/submit";
const request = (headers: Record<string, string>) => new Request(URL, { method: "POST", headers: { host: "127.0.0.1:3000", ...headers } });

describe("assertSameOrigin", () => {
  it("allows the app's own page and non-browser clients", () => {
    expect(() => assertSameOrigin(request({ origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" }))).not.toThrow();
    expect(() => assertSameOrigin(request({}))).not.toThrow();
    expect(() => assertSameOrigin(request({ "sec-fetch-site": "none" }))).not.toThrow();
  });

  it("allows the public host behind a proxy", () => {
    expect(() =>
      assertSameOrigin(request({ host: "internal:8080", "x-forwarded-host": "rfq.example.com", origin: "https://rfq.example.com" })),
    ).not.toThrow();
  });

  it("rejects requests a browser sent from another site", () => {
    const rejected = { status: 403, code: "cross_site_request" };
    expect(() => assertSameOrigin(request({ origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).toThrow(
      expect.objectContaining(rejected),
    );
    expect(() => assertSameOrigin(request({ origin: "https://evil.example" }))).toThrow(expect.objectContaining(rejected));
    expect(() => assertSameOrigin(request({ "sec-fetch-site": "same-site" }))).toThrow(expect.objectContaining(rejected));
    expect(() => assertSameOrigin(request({ origin: "null" }))).toThrow(expect.objectContaining(rejected));
  });
});

describe("POST routes", () => {
  beforeEach(() => {
    vi.stubEnv("MOCK_LLM", "1");
    vi.stubEnv("NOX_API_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  const crossSite = { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "text/plain" };
  const payload = JSON.stringify({ payload: { lines: [{ alloy: "6061", requested_quantity: 1 }] } });

  it("won't submit an RFQ for a cross-site form post", async () => {
    const response = await submit(new Request(URL, { method: "POST", headers: crossSite, body: payload }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "cross_site_request" } });
  });

  it("still submits from the app's page", async () => {
    const headers = { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "content-type": "application/json" };
    const response = await submit(new Request(URL, { method: "POST", headers, body: payload }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "dry-run" });
  });

  it("won't run an extraction for a cross-site post", async () => {
    const body = JSON.stringify({ text: "6061 plate 1/2 x 12 x 24 qty 10" });
    const response = await parse(new Request("http://127.0.0.1:3000/api/parse", { method: "POST", headers: crossSite, body }));
    expect(response.status).toBe(403);
  });
});
