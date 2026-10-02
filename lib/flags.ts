import type { Flag, LlmFlag, Severity } from "./schema";

type FlagInput = {
  severity: Severity;
  line_ref: string | null;
  field: string | null;
  message: string;
  suggested_question?: string | null;
};

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function ruleFlag(kind: string, input: FlagInput): Flag {
  return {
    ...input,
    id: ["rules", input.line_ref ?? "header", input.field ?? "general", kind].join(":"),
    source: "rules",
    suggested_question: input.suggested_question ?? null,
  };
}

export function fromLlm(flags: LlmFlag[]): Flag[] {
  return flags.map((flag, index) => ({ ...flag, id: `llm:${index}`, source: "llm" }));
}

const key = (flag: Flag) => `${flag.line_ref ?? ""}|${flag.field ?? ""}`;

/** Rule flags always win; an LLM flag is dropped when a rule already covers the same line and field. */
export function mergeFlags(ruleFlags: Flag[], llmFlags: Flag[]): Flag[] {
  const covered = new Set(ruleFlags.filter((f) => f.field !== null).map(key));
  const llm = llmFlags.filter((f) => f.field === null || !covered.has(key(f)));
  return sortFlags([...ruleFlags, ...llm]);
}

function sortFlags(flags: Flag[]): Flag[] {
  return [...flags].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function worstSeverity(flags: Flag[]): Severity | undefined {
  return (["error", "warning", "info"] as const).find((severity) => flags.some((f) => f.severity === severity));
}
