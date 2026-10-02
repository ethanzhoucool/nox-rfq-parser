import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent, ResponseOutputItem } from "openai/resources/responses/responses";
import { getChatgptAccessToken } from "./chatgpt-auth";
import { config } from "./config";
import { HttpError } from "./errors";
import type { ExtractionRun } from "./extract";
import type { RfqInput } from "./input";
import { buildSystemPrompt } from "./prompt";
import { ExtractionSchema, type Catalog } from "./schema";

export async function extractWithOpenAI(input: RfqInput, catalog: Catalog, today: string, usePlan: boolean): Promise<ExtractionRun> {
  const credential = usePlan ? await getChatgptAccessToken() : config.openaiKey;
  if (!credential) throw new HttpError(500, "openai_key_missing", "Configure OPENAI_API_KEY, or connect ChatGPT to use your plan.");
  const model = config.openaiModel;
  const client = new OpenAI({ apiKey: credential, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 240000 });
  try {
    const stream = client.responses.stream({
      model, instructions: buildSystemPrompt(catalog, today),
      input: [{ role: "user", content: buildContent(input) }],
      text: { format: { ...zodTextFormat(ExtractionSchema, "rfq_extraction") } },
      store: false, stream: true,
    });
    // The ChatGPT-plan backend streams output items but can send `response.completed` with an empty
    // `output`, so keep the items from `response.output_item.done` events as the fallback.
    const streamed: ResponseOutputItem[] = [];
    for await (const event of stream) {
      if (event.type === "response.output_item.done") streamed.push(event.item);
    }
    const response = await stream.finalResponse();
    const output = response.output.length ? response.output : streamed;
    if (response.status !== "completed") {
      if (response.error?.code === "rate_limit_exceeded" || String(response.error?.code).startsWith("subscription_sharing_")) {
        throw new HttpError(429, "openai_usage_limit", "The AI usage limit was reached. Review your ChatGPT usage or API billing, then retry.");
      }
      throw new HttpError(422, "llm_incomplete", "The AI response didn't finish. Try a smaller document or retry.");
    }
    if (output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"))) {
      throw new HttpError(422, "llm_refused", "ChatGPT declined to process this document.");
    }
    const extraction = parseExtraction(outputText(output), output.map((item) => item.type));
    return { extraction, model, usage: response.usage ? {
      input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens,
    } : undefined };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Don't return or log SDK errors: they can contain request headers or document content.
    if (error instanceof OpenAI.APIError && (error.code === "rate_limit_exceeded" || error.code?.startsWith("subscription_sharing_"))) {
      throw new HttpError(429, "openai_usage_limit", "The AI usage limit was reached. Review your ChatGPT usage or API billing, then retry.");
    }
    if (error instanceof OpenAI.AuthenticationError) throw new HttpError(401, "openai_auth", usePlan
      ? "ChatGPT rejected the access token. Reconnect your account; a cached Codex token may not grant this app access."
      : "OpenAI rejected OPENAI_API_KEY. Check your API key.");
    if (error instanceof OpenAI.RateLimitError) throw new HttpError(429, "openai_rate_limited", "The AI usage limit was reached. Review your usage and retry later.");
    if (error instanceof OpenAI.BadRequestError) throw new HttpError(422, "openai_bad_request", "OpenAI couldn't process this input or model. Check model access and try a smaller document.");
    if (error instanceof OpenAI.APIConnectionError) throw new HttpError(502, "openai_unreachable", "Couldn't reach OpenAI. Check your connection and retry.");
    throw new HttpError(502, "openai_error", "The OpenAI response failed. Check your account's model access and try again.");
  }
}

/** Logs only the failure shape (lengths, item types, issue paths), never document content. */
function parseExtraction(text: string, outputTypes: string[]) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("[extract-openai] output is not JSON", { length: text.length, outputTypes });
    throw new HttpError(502, "llm_unparseable", "The AI response wasn't valid JSON. Retry, or try a smaller document.");
  }
  const result = ExtractionSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".")}: ${issue.code}`);
    console.error("[extract-openai] output failed schema validation", { issues });
    throw new HttpError(502, "llm_unparseable", "The AI response didn't match the RFQ extraction schema.");
  }
  return result.data;
}

function buildContent(input: RfqInput): ResponseInputContent[] {
  const instruction = { type: "input_text" as const, text: `Extract the RFQ from ${JSON.stringify(input.filename)}.` };
  switch (input.kind) {
    case "pdf": return [instruction, { type: "input_file", filename: input.filename, file_data: `data:application/pdf;base64,${input.data}` }];
    case "image": return [instruction, { type: "input_image", image_url: `data:${input.mediaType};base64,${input.data}`, detail: "auto" }];
    case "text": return [{ type: "input_text", text: `${instruction.text}\n\n<document>\n${input.text}\n</document>` }];
  }
}

function outputText(output: ResponseOutputItem[]): string {
  return output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .map((part) => (part.type === "output_text" ? part.text : ""))
    .join("");
}
