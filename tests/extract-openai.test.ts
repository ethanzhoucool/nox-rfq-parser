import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractWithOpenAI } from "@/lib/extract-openai";
import { llmSettings } from "@/lib/llm";
import { fromText, type RfqInput } from "@/lib/input";
import { parseRfq } from "@/lib/parse";
import { readStatus } from "@/lib/status";
import { POST } from "@/app/api/parse/route";
import { catalog, rfq, TODAY } from "./fixtures";

let directory: string;
let fetchMock: ReturnType<typeof vi.fn>;
const extraction = () => ({ rfq: rfq(), flags: [] });

function events(options: { status?: string; output?: unknown[]; error?: unknown; text?: string; terminal?: boolean; itemEvents?: boolean } = {}) {
  const message = { id: "msg_test", type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: options.text ?? JSON.stringify(extraction()), annotations: [] }] };
  const created = { id: "resp_test", object: "response", created_at: 0, model: "gpt-test", status: "in_progress", output: [], error: null };
  const response = { ...created, status: options.status || "completed", error: options.error || null,
    output: options.output ?? [message], usage: { input_tokens: 12, output_tokens: 34, total_tokens: 46, input_tokens_details: {}, output_tokens_details: {} } };
  const list = [{ type: "response.created", sequence_number: 0, response: created },
    ...(options.itemEvents
      ? [{ type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { ...message, status: "in_progress", content: [] } },
        { type: "response.output_item.done", sequence_number: 2, output_index: 0, item: message }]
      : []),
    ...(options.terminal === false ? [] : [{ type: `response.${response.status}`, sequence_number: 1, response }])];
  return new Response(list.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "rfq-openai-"));
  vi.stubEnv("CHATGPT_AUTH_DIR", directory); vi.stubEnv("EXTRACTION_CACHE_DIR", join(directory, "extractions"));
  vi.stubEnv("OPENAI_API_KEY", "fake-api-key"); vi.stubEnv("OPENAI_ACCESS_TOKEN", "");
  vi.stubEnv("OPENAI_MODEL", "gpt-test"); vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("LLM_PROVIDER", ""); vi.stubEnv("NOX_API_KEY", ""); vi.stubEnv("MOCK_LLM", "");
  fetchMock = vi.fn().mockImplementation(async () => events()); vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

describe("OpenAI RFQ extraction", () => {
  it("reuses a cached extraction for identical input and bypasses it when fresh", async () => {
    const input = fromText("6061 plate qty 10", "rfq.txt");
    const first = await parseRfq(input);
    const second = await parseRfq(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.meta.cached_at).toBeUndefined();
    expect(second.meta).toMatchObject({ model: "gpt-test", cached_at: expect.any(String) });
    expect(second.meta.input_tokens).toBeUndefined();
    expect(second.payload).toEqual(first.payload);

    const fresh = await parseRfq(input, { fresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fresh.meta.cached_at).toBeUndefined();
  });

  it("does not reuse a cached extraction for different input", async () => {
    await parseRfq(fromText("6061 plate qty 10", "rfq.txt"));
    await parseRfq(fromText("6061 plate qty 12", "rfq.txt"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses streamed output items when the completed event has an empty output (ChatGPT plan backend)", async () => {
    fetchMock.mockImplementation(async () => events({ itemEvents: true, output: [] }));
    const result = await extractWithOpenAI(fromText("6061 plate qty 10", "rfq.txt"), catalog, TODAY, false);
    expect(result.extraction.rfq.lines).toHaveLength(rfq().lines.length);
  });

  it("uses the Responses API and the existing schema and normalization pipeline", async () => {
    const result = await parseRfq(fromText("6061 plate qty 10", "rfq.txt"));
    expect(result.meta).toMatchObject({ model: "gpt-test", input_tokens: 12, output_tokens: 34, filename: "rfq.txt" });
    expect(result.payload.lines[0]).toMatchObject({ alloy: "6061", requested_quantity: 10 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.openai.com/v1/responses");
    const request = fetchMock.mock.calls[0][1];
    expect(new Headers(request.headers).get("authorization")).toBe("Bearer fake-api-key");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ model: "gpt-test", store: false, stream: true, text: { format: { type: "json_schema", strict: true } } });
    expect(body.instructions).toContain("Never guess silently");
    expect(body.input[0].content[0].text).toContain("6061 plate qty 10");
    expect(body.text.format.schema.properties).toHaveProperty("rfq");
    for (const unsupported of ["temperature", "max_output_tokens", "previous_response_id", "conversation"]) expect(body).not.toHaveProperty(unsupported);
  });

  it.each<RfqInput>([
    { kind: "pdf", filename: "po.pdf", data: "cGRm" },
    { kind: "image", filename: "note.png", mediaType: "image/png", data: "aW1hZ2U=" },
  ])("sends inline PDF and image content: $kind", async (input) => {
    await extractWithOpenAI(input, catalog, TODAY, false);
    const content = JSON.parse(fetchMock.mock.calls[0][1].body).input[0].content;
    expect(content[1]).toMatchObject(input.kind === "pdf"
      ? { type: "input_file", filename: "po.pdf", file_data: "data:application/pdf;base64,cGRm" }
      : { type: "input_image", image_url: "data:image/png;base64,aW1hZ2U=" });
  });

  it("uses an OAuth token as the bearer credential without exposing it in status", async () => {
    vi.stubEnv("OPENAI_ACCESS_TOKEN", "fake-plan-token");
    const status = await readStatus();
    expect(status).toMatchObject({ provider: "chatgpt", llm: "ready" });
    expect(JSON.stringify(status)).not.toContain("fake-plan-token");
    await parseRfq(fromText("RFQ"));
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe("Bearer fake-plan-token");
  });

  it("preserves explicit Claude selection and reports missing OpenAI credentials", async () => {
    vi.stubEnv("LLM_PROVIDER", "claude"); expect(await llmSettings()).toMatchObject({ provider: "claude", ready: false });
    vi.stubEnv("LLM_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "");
    await expect(parseRfq(fromText("RFQ"))).rejects.toMatchObject({ code: "openai_key_missing" });
    vi.stubEnv("LLM_PROVIDER", "typo"); await expect(llmSettings()).rejects.toMatchObject({ code: "llm_provider_invalid" });
  });

  it.each([
    { status: "incomplete", terminal: true }, { terminal: false },
  ])("rejects incomplete or interrupted streams %j", async (options) => {
    fetchMock.mockImplementation(async () => events(options));
    await expect(extractWithOpenAI(fromText("RFQ"), catalog, TODAY, false)).rejects.toMatchObject({ code: "llm_incomplete" });
  });

  it("handles a usage failure delivered after streaming begins", async () => {
    fetchMock.mockImplementation(async () => events({ status: "failed", error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" }, output: [] }));
    await expect(extractWithOpenAI(fromText("RFQ"), catalog, TODAY, false)).rejects.toMatchObject({ status: 429, code: "openai_usage_limit" });
  });

  it("rejects refusals and invalid extraction JSON", async () => {
    fetchMock.mockImplementation(async () => events({ output: [{ id: "msg", type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No" }] }] }));
    await expect(extractWithOpenAI(fromText("RFQ"), catalog, TODAY, false)).rejects.toMatchObject({ code: "llm_refused" });
    fetchMock.mockImplementation(async () => events({ text: '{"rfq":{}}' }));
    await expect(extractWithOpenAI(fromText("RFQ"), catalog, TODAY, false)).rejects.toMatchObject({ code: "llm_unparseable" });
  });

  it("sanitizes authentication errors", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: "secret request content", type: "invalid_request_error" } }), {
      status: 401, headers: { "content-type": "application/json" },
    }));
    await expect(extractWithOpenAI(fromText("RFQ"), catalog, TODAY, false)).rejects.toMatchObject({ code: "openai_auth", message: "OpenAI rejected OPENAI_API_KEY. Check your API key." });
  });

  it("blocks remote or cross-origin requests from consuming ChatGPT plan usage", async () => {
    vi.stubEnv("OPENAI_ACCESS_TOKEN", "fake-plan-token");
    const response = await POST(new Request("http://127.0.0.1:3000/api/parse", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: '{"text":"RFQ"}' }));
    expect(response.status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
});
