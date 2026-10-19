import { spawn } from "node:child_process";
import { z } from "zod";
import { HttpError } from "./errors";
import type { ExtractionRun } from "./extract";
import type { RfqInput } from "./input";
import { buildSystemPrompt } from "./prompt";
import { ExtractionSchema, type Catalog } from "./schema";

/** Runs a headless Claude Code session (`claude -p`) on the signed-in Claude plan. Local demo use only. */
export async function extractWithClaudeCode(input: RfqInput, catalog: Catalog, today: string): Promise<ExtractionRun> {
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--tools", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--system-prompt", buildSystemPrompt(catalog, today),
    "--json-schema", JSON.stringify(z.toJSONSchema(ExtractionSchema, { target: "draft-7" })),
  ];
  const message = { type: "user", message: { role: "user", content: buildContent(input) } };
  const lines = await run(process.env.CLAUDE_BIN || "claude", args, JSON.stringify(message) + "\n");

  const events = lines.flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const model: string | undefined = events.find((e) => e.type === "system" && e.subtype === "init")?.model;
  const result = events.findLast((e) => e.type === "result");
  if (!result || result.is_error || !result.structured_output) {
    throw new HttpError(502, "claude_code_failed", `Claude Code didn't return an extraction${result?.result ? `: ${String(result.result).slice(0, 200)}` : "."}`);
  }
  const parsed = ExtractionSchema.safeParse(result.structured_output);
  if (!parsed.success) throw new HttpError(502, "llm_unparseable", "Claude Code's response didn't match the extraction schema.");

  return {
    extraction: parsed.data,
    model: model ? `${model} (Claude Code)` : "Claude Code",
    usage: result.usage && { input_tokens: result.usage.input_tokens ?? 0, output_tokens: result.usage.output_tokens ?? 0 },
  };
}

function run(bin: string, args: string[], stdin: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), 240000);
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new HttpError(500, "claude_code_missing", `Couldn't start Claude Code (${e.message}). Is \`claude\` on PATH?`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.includes('"type":"result"')) {
        reject(new HttpError(502, "claude_code_failed", `Claude Code exited with ${code}: ${err.trim().slice(0, 200)}`));
      } else resolve(out.split("\n").filter(Boolean));
    });
    child.stdin.end(stdin);
  });
}

function buildContent(input: RfqInput) {
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
