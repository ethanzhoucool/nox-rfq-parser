# RFQ Parser for Nox Metals

Buyers send RFQs as sloppy emails, SAP-style PDF POs, BOM spreadsheets and phone photos of handwritten notes. This app turns any of those into a validated request for Nox's public API (`POST /api/v1/rfqs`). Anything missing or ambiguous gets flagged for a person to check. Nothing is filled in silently.

```
file / text ─► Claude (structured output) ─► normalize ─► validate vs catalog ─► CreateRfqDto ─► dry run or live submit
                 every value has a          fractions, mm,   missing fields, qty      only lines with
                 verbatim source quote      glued tempers,   1..200, stocked alloy/   no errors
                 + confidence               spec callouts    temper, need-by date
```

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in what you have
npm run dev                  # http://localhost:3000
```

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | for real parsing | Extraction with `claude-opus-5-5` (adaptive thinking, medium effort, Zod structured output). If it's missing, the UI shows a banner and `/api/parse` returns a clear 500 JSON error. |
| `NOX_API_KEY` | no | Turns on the live materials catalog (`GET /api/v1/materials`, cached for 10 min) and enables the **Submit to Nox** button. |
| `NOX_API_BASE_URL` | no | Defaults to `https://developer-api.noxmetals.co`. |
| `MOCK_LLM` | no | `1` returns a canned extraction of a fictional aerospace PO instead of calling Claude. Every input gets the same result. Use it to try the UI, validation and payload flow without a key. |

## Dry run vs live

Submission is **dry run by default**. A real `POST /api/v1/rfqs` only goes out when both of these are true:

1. `NOX_API_KEY` is set on the server, and
2. a user clicks **Submit to Nox** and confirms the dialog. The client sends `{ payload, live: true }`.

In every other case (no key, or **Create RFQ (dry run)**), `/api/submit` returns the exact request it would have sent: method, URL, headers with the key redacted to `$NOX_API_KEY`, and the body. The payload panel shows the same request as a copyable `curl`. The `Idempotency-Key` header is a SHA-256 of the body, so a retry or double-click replays the original RFQ and doesn't create a duplicate. After a live submit, the UI polls `GET /api/v1/rfqs/{id}` through `/api/rfqs/[id]` until `pricing_status` leaves `pricing`.

## Demo script (about 2 minutes)

Run `MOCK_LLM=1 npm run dev` if you have no key. With a key, use the samples:

1. **`02-aerospace-po.pdf`**: pick it from *Try a sample*. Four lines come back with AMS/QQ certs, DFARS on every line, and a tight need-by date. Hover any cell to see the verbatim quote it came from. The dot shows confidence.
2. **Flags**: errors block a line, warnings ask for confirmation (for example "T6 requested on plate; Nox stocks T651"). Click **Copy questions as email** to get a ready-to-send reply to the buyer.
3. **Fix a cell**: change a temper or a qty. The flags, the excluded lines and the payload all recompute right away. Accept a warning to clear it.
4. **Payload**: switch between JSON and curl, then click **Create RFQ (dry run)**. With a Nox key, **Submit to Nox** creates the real RFQ and shows Wayne's pricing status.
5. Optional: **`06-scanned-note.png`** (handwriting, crossed-out line skipped) and **`05-rfq-out-of-catalog.pdf`** (qty 250 blocked, 17-4 PH routed to sales).

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests: units, spec callouts, normalization, validation, payload, request/curl, email, mock pipeline |
| `npm run eval` | Runs the parse pipeline over every `samples/*` file that has `samples/expected/<name>.json`. Prints field accuracy and flag recall, and writes `eval-report.json`. Needs `ANTHROPIC_API_KEY`. With `MOCK_LLM=1` it only proves the harness runs. |

Eval conventions follow `samples/README.md`. Lines match by ref when every ref agrees, otherwise by order. Flags are scored on `(line_ref, severity)`, and `field` is reported as a secondary soft match. A null expected compliance counts as equal to `"none"`.

## Layout

```
app/page.tsx              single-page UI (input, header card, line table, flags, payload)
app/api/parse             POST multipart file or JSON {text, filename?} → ParseResult
app/api/submit            POST {payload, live?} → dry-run request or live 202
app/api/samples[/name]    list and serve files in samples/
app/api/status            model, catalog source, Nox mode (for the header pills)
app/api/rfqs/[id]         proxy for polling a live RFQ
components/               UI building blocks
hooks/useRfqEditor.ts     edits + client-side re-validation
lib/schema.ts             Zod schema for the LLM and the shared types (ExtractedRfq, Flag, CreateRfqDto…)
lib/extract.ts, prompt.ts Claude call and system prompt
lib/normalize.ts          deterministic clean-up of the LLM output
lib/validate.ts           rule flags
lib/analyze.ts            validate + merge flags + build payload (shared by server and client)
lib/payload.ts            ExtractedRfq → CreateRfqDto
lib/request.ts, nox.ts    HTTP request/curl builder and the Nox client
lib/specs.ts              AMS/QQ/ASTM callout table
data/materials.seed.json  approximate catalog, used when there's no Nox key
scripts/eval.ts           accuracy harness
```

## Notes and limits

- The seed catalog is an approximation built from public noxmetals.co pages. The header shows which catalog is active. Following the real API docs, `Tube` is empty, since tube isn't quoted through the API.
- The API has no need-by, PO or tolerance fields. The PO number, customer part number, cut tolerance, need-by date and the mill-cert requirement go into each line's `job_detail`. The PO number, company and date also go into `subject`.
- Lines with blocking errors are left out of the payload, and the UI says which ones. You can still submit the clean lines.
- `xlsx` (SheetJS 0.18.5 from npm) has a known advisory that applies to untrusted spreadsheets. That's acceptable for a demo. For production, switch to the SheetJS CDN build.
