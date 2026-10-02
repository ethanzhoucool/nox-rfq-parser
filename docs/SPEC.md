# RFQ Parser for Nox Metals: build spec

A demo for a job application to Nox Metals (Detroit; automated aluminum plate/bar/tube service center).
Goal: a buyer's messy RFQ/PO (email text, PDF, spreadsheet, photo) goes in. A structured, validated
RFQ comes out, ready for Nox's public API `POST /api/v1/rfqs` (which prices it via their internal
quoting engine "Wayne"). Missing or ambiguous details are flagged for a human, never guessed silently.

Demo story (30 seconds): drop in a messy PDF PO → see line items extracted with source quotes →
2–3 red/yellow flags ("temper not specified", "DFARS required on 7050, confirm") → fix/accept →
"Create RFQ" → exact JSON payload for Nox's API (dry run), or a real submit if a Nox key is set.

## Stack
- Next.js (App Router) + TypeScript + React + Tailwind. Nox's stack is TS/NestJS/React/Supabase.
- `@anthropic-ai/sdk` with `zod` + `zodOutputFormat` (`client.messages.parse`, `output_config.format`).
  - Model: `claude-opus-5-5`, `thinking: {type: "adaptive"}`, `output_config.effort: "medium"`.
  - PDFs go as `document` content blocks (base64, media_type application/pdf); images as `image` blocks;
    .xlsx/.csv converted to CSV text first (use the `xlsx` npm package); .eml/.txt as plain text.
  - Check `stop_reason` before trusting output (handle `refusal`, `max_tokens`).
- No database. Everything is stateless, per request.

## Ground truth: Nox API contract
`docs/nox-openapi.json` is the real OpenAPI spec downloaded from
`https://developer-api.noxmetals.co/api/docs-json`. Read `CreateRfqDto`, `RfqLineDto`, `RfqCertificationDto`,
`MaterialsListDto`. Key rules:
- `alloy` is the bare code ("6061"), `temper` is separate ("T651"). Both must exist in `GET /api/v1/materials` for that product type.
- `product_type`: Plate | Bar | Tube; `shape`: Plate, Round, Square, Rectangle.
- Dimensions are INCHES (decimal). Plate needs thickness+width+length; round bar needs diameter+length; etc.
- `requested_quantity` 1..200. `compliance`: none | dfars | domestic.
- `certifications[]`: `{family: AMS|QQ|ASME|ASTM, designation: "AMS 4027"}` (max 10 per line).
- `lines` 1..100. Optional `subject`, `job_number`, `customer{name,company,email,phone}`, `ship_to_address`, `bill_to_address`. Per-line `ref`, `job_detail`.
- Auth header `x-api-key`. `POST /rfqs` REQUIRES an `Idempotency-Key` header. Returns 202 `{id, status, created_at, poll_url}`; poll `GET /api/v1/rfqs/{id}` until `pricing_status` is `priced`.
- There is no ship-date / need-by field in the API. Put the requested date and PO number in `job_detail`/`subject` and flag if the date looks infeasible.

## Shared types (`lib/schema.ts`): the contract between agents
```ts
type Confidence = "high" | "medium" | "low";
type Field<T> = { value: T | null; confidence: Confidence; source: string | null }; // source = verbatim snippet from input

type ExtractedLine = {
  ref: string;                    // "L1", "L2"... or the customer's line/item number
  customer_part_number: Field<string>;
  description_raw: string;        // the original line text, verbatim
  alloy: Field<string>;           // bare code, e.g. "6061"
  temper: Field<string>;          // e.g. "T651"
  product_type: Field<"Plate" | "Bar" | "Tube">;
  shape: Field<"Plate" | "Round" | "Square" | "Rectangle">;
  thickness_in: Field<number>; width_in: Field<number>; length_in: Field<number>;
  height_in: Field<number>; diameter_in: Field<number>; outer_diameter_in: Field<number>;
  outer_dimension_in: Field<number>; wall_thickness_in: Field<number>;
  quantity: Field<number>;
  cut_tolerance: Field<string>;   // e.g. "+.125/-0"; Nox has no API field, so it goes into job_detail
  compliance: Field<"none" | "dfars" | "domestic">;
  certifications: { family: "AMS" | "QQ" | "ASME" | "ASTM"; designation: string; source: string | null }[];
  notes: string | null;
};

type ExtractedRfq = {
  document_type: "rfq" | "po" | "email" | "drawing" | "spreadsheet" | "other";
  po_number: Field<string>; job_number: Field<string>;
  customer: { name: Field<string>; company: Field<string>; email: Field<string>; phone: Field<string> };
  ship_to_address: Field<string>; bill_to_address: Field<string>;
  required_date: Field<string>;   // ISO yyyy-mm-dd if determinable
  mill_certs_required: Field<boolean>;
  lines: ExtractedLine[];
  general_notes: string | null;
};

type Flag = {
  id: string; severity: "error" | "warning" | "info";
  line_ref: string | null;        // null = header-level
  field: string | null;
  message: string;                // human-readable, metal-buyer language
  suggested_question: string | null; // what to ask the customer
  source: "llm" | "rules";
};

type ParseResult = {
  extracted: ExtractedRfq;
  flags: Flag[];
  payload: CreateRfqDto;          // ready for POST /api/v1/rfqs (only lines with no blocking errors, or all with errors noted)
  blocking: boolean;              // true if any severity=error remains
  meta: { model: string; ms: number; input_tokens?: number; output_tokens?: number; filename?: string };
};
```

## Normalization rules the extractor must handle (put in the system prompt AND enforce in code where deterministic)
- Fractions/mixed numbers: `1/2"`, `1-1/2`, `.500`, `0.5in`; metric (mm) → inches, flagged as info "converted from mm".
- "6061-T6 plate" → alloy 6061, temper T651 is what plate is stocked as; flag warning "T6 requested on plate; Nox stocks T651, confirm".
- Alloy given with temper glued on ("7075T7351", "6061-T651") → split.
- Spec callouts → alloy+temper+certification. Seed table (`lib/specs.ts`), at minimum:
  - AMS 4027 → 6061-T651 (plate/bar), family AMS
  - AMS-QQ-A-250/11 or QQ-A-250/11 → 6061 plate (temper from callout, usually T651), family QQ
  - AMS 4078 → 7075-T7351 plate; AMS 4045 → 7075-T651 plate; AMS-QQ-A-250/12 → 7075 plate
  - AMS 4050 → 7050-T7451 plate
  - ASTM B209 → aluminum sheet/plate general (no alloy implied); ASTM B221 → extruded bar/rod
  - AMS 4117 / AMS-QQ-A-225/8 → 6061 bar
  - AMS 4122 / AMS-QQ-A-225/9 → 7075-T651 bar
  - AMS 5643 → 17-4 PH bar (stainless; flag "outside core aluminum catalog, route to sales")
- Ambiguous dims "1/2 x 12 x 24": for Plate assume thickness × width × length (smallest = thickness), confidence medium.
- "ea", "pcs", "pc", "lot", "(2) ea"; quantity > 200 → error (API max) with suggestion to split into lines.
- "DFARS", "DFARS compliant", "domestic melt", "melted in USA", "252.225-7009" → compliance dfars; "domestic" / "USA origin" without DFARS → domestic.
- "certs required", "C of C", "mill test report", "MTR" → mill_certs_required true.
- Dates: "need by 10/15", "ASAP", "2 wks ARO". Resolve relative to today's date passed in the prompt. "ASAP" → flag info.

## Validation rules (`lib/validate.ts`, deterministic, source "rules")
- Missing alloy / quantity → error. Missing temper → warning (suggest default from catalog's only temper if exactly one).
- alloy/temper not in materials catalog for that product_type → error ("not stocked, route to sales").
- Plate missing any of thickness/width/length → error; Round bar missing diameter or length → error, etc.
- quantity > 200 or < 1 → error.
- Any field with confidence "low" → warning.
- required_date < today + 2 business days → warning "tight; Nox next-day turnaround on stocked material, confirm".
- compliance dfars + alloy not in catalog → error.
- Thickness above 6" or below 0.125" on plate → warning ("unusual for stocked plate, confirm").
- LLM may also emit flags (source "llm"); dedupe by (line_ref, field).

## Materials catalog
`lib/catalog.ts`: if `NOX_API_KEY` is set, `GET /api/v1/materials` (cache in memory 10 min). Otherwise use a
seed `data/materials.seed.json` in the same `MaterialsListDto` shape, clearly labeled as an approximation built from noxmetals.co
public pages: Plate 6061[T651], 7075[T651,T7351], 7050[T7451], 2024[T351], 5083[H116,H321], MIC-6[F]; Bar 6061[T6511,T651], 7075[T6511,T651], 2024[T3511]; Tube 6061[T6]. UI shows which catalog is active.

## Nox client (`lib/nox.ts`)
- `buildPayload(extracted) → CreateRfqDto` (pure; unit-testable). Puts PO#, required date, cut tolerance, and customer part number into `job_detail` / `subject`.
- `submitRfq(payload)`: only if `NOX_API_KEY` is set AND the user clicks "Submit to Nox" in the UI (explicit). Sends
  `x-api-key` + `Idempotency-Key` (hash of payload). Otherwise DRY RUN: return the exact HTTP request (method, url, headers with key redacted, body) as a copyable curl.
- `getRfq(id)` poller for status.

## UI (single page, `app/page.tsx`)
Left: input. Drag-drop file (pdf/png/jpg/eml/txt/xlsx/csv) OR paste text, plus a "Samples" dropdown listing `samples/`.
Right: results.
- Header card: customer, PO#, ship-to, required date, compliance, certs, all with confidence dots.
- Line table: one row per line, editable cells, hover a cell to see the verbatim `source` quote.
- Flags panel: grouped by severity, each with suggested question; "Copy questions as email reply to customer" button.
- Payload panel: JSON preview of `CreateRfqDto` + curl, "Submit to Nox" (disabled with tooltip when no key).
- Header shows: catalog source (live vs seed), Nox mode (live vs dry-run), model.
Clean, industrial look (dark slate, one accent color). Must work without any keys up to the point of calling Claude, and show a clear error if `ANTHROPIC_API_KEY` is missing.

## API routes
- `POST /api/parse` multipart (file) or JSON {text, filename?} → ParseResult.
- `POST /api/submit` {payload} → dry-run request or live 202.
- `GET /api/samples`, `GET /api/samples/[name]` → serve sample files.

## Samples (`samples/`) + ground truth (`samples/expected/*.json`)
8–10 realistic messy inputs made by buyers at CNC job shops / aerospace tier suppliers. Every expected file
is a partial `ExtractedRfq` (values only) + `expected_flags: [{line_ref, field, severity}]`. Mix:
1. Short sloppy email body ("need some 6061 plate, 1/2 x 12 x 24 qty 10, also 2 pcs 1" thick... certs pls").
2. Formal PDF PO from an aerospace tier-2 with spec callouts (AMS-QQ-A-250/12, DFARS, MTRs, need-by date), 4 lines.
3. Forwarded email thread where the qty changes mid-thread ("actually make that 15").
4. Excel/CSV BOM export with odd column names, mixed units (one line in mm).
5. PDF RFQ with a line that's out of catalog (17-4 PH / AMS 5643) and a qty of 250.
6. Scanned-looking PDF (render text slightly rotated/noisy as an image-in-PDF, or a PNG photo of a handwritten-style note).
7. Email with missing temper and ambiguous "6061 1x6x48 bar" (bar vs plate? flat bar = Rectangle).
8. Round bar order: "7075-T651 rd 2.5 dia x 12 lg qty 6, cut tol +.06/-0".
Use fictional but plausible companies (no real company names/logos except Nox Metals as the recipient).

## Eval (`scripts/eval.ts`)
Runs `/api/parse` logic over every sample, compares to expected: field-level accuracy (values), flag recall (expected flags raised), prints a table + writes `eval-report.json`. `npm run eval`.

## Definition of done
`npm install && npm run build` passes; `npm run typecheck` passes; `npm test` unit tests for normalization, validation, and buildPayload pass; README explains setup (ANTHROPIC_API_KEY, optional NOX_API_KEY) and the demo script.
