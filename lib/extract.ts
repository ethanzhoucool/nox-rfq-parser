import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, config } from "./config";
import { HttpError } from "./errors";
import type { RfqInput } from "./input";
import { buildSystemPrompt } from "./prompt";
import { ExtractionSchema, type Catalog, type Extraction } from "./schema";

export type ExtractionRun = { extraction: Extraction; model?: string; usage?: { input_tokens: number; output_tokens: number } };

export async function extractWithClaude(input: RfqInput, catalog: Catalog, today: string): Promise<ExtractionRun> {
  const apiKey = config.anthropicKey;
  if (!apiKey) {
    throw new HttpError(
      500,
      "anthropic_key_missing",
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart, or run with MOCK_LLM=1 to use the canned extraction.",
    );
  }

  const client = new Anthropic({ apiKey });
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(ExtractionSchema) },
    system: buildSystemPrompt(catalog, today),
    messages: [{ role: "user", content: buildContent(input) }],
  });

  if (res.stop_reason === "refusal") {
    throw new HttpError(422, "llm_refused", "Claude declined to process this document.");
  }
  if (res.stop_reason === "max_tokens") {
    throw new HttpError(422, "llm_truncated", "The document produced more output than fits in one response. Try splitting it.");
  }
  if (!res.parsed_output) {
    throw new HttpError(502, "llm_unparseable", "Claude's response didn't match the extraction schema.");
  }

  return {
    extraction: res.parsed_output,
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
  };
}

function buildContent(input: RfqInput): Anthropic.ContentBlockParam[] {
  const instruction = `Extract the RFQ from "${input.filename}".`;
  switch (input.kind) {
    case "pdf":
      return [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.data } },
        { type: "text", text: instruction },
      ];
    case "image":
      return [
        { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.data } },
        { type: "text", text: instruction },
      ];
    case "text":
      return [{ type: "text", text: `${instruction}\n\n<document filename="${input.filename}">\n${input.text}\n</document>` }];
  }
}
