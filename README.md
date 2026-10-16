# RFQ Parser for Nox Metals

Buyers send RFQs as sloppy emails, SAP-style PDF POs, BOM spreadsheets and phone photos of handwritten notes. This app turns any of those into a validated request for Nox's public API (`POST /api/v1/rfqs`). Anything missing or ambiguous gets flagged for a person to check. Nothing is filled in silently.

```
file / text ─► Claude / OpenAI (structured output) ─► normalize ─► validate vs catalog ─► CreateRfqDto ─► dry run or live submit
                 every value has a          fractions, mm,   missing fields, qty      only lines with
                 verbatim source quote      glued tempers,   1..200, stocked alloy/   no errors
                 + confidence               spec callouts    temper, stock thickness,
                                                                      need-by date
```

## How this differs from Upload PO on noxmetals.co

The **Upload PO** button on [noxmetals.co/quote](https://noxmetals.co/quote) already reads scanned and handwritten PDFs well. It's built for a buyer self-serving an instant quote, so it fits each request to what the quote form can price. This tool is built for the person at Nox who reviews the request, so it keeps everything the buyer asked for and shows what needs a decision.

I ran the same two image-only PDFs (no text layer) through both on 2026-10-15:

| Buyer asked for | Upload PO | This tool |
|---|---|---|
| 7075-T651 **.375** × 3 × 5 (handwritten) | Quoted as **0.5"** thick, with no notice | Keeps 0.375 and warns that it isn't a stock thickness for 7075 (nearest 0.25" or 0.5") |
| 5083 1/4 × 48 × 96 (handwritten) | Line dropped, no notice | Kept. Asks "H116 or H321?" |
| 2024-T351 1.25 × 10 × 20 (scanned PO) | Line dropped, no notice | Kept and checked against the catalog. If it isn't stocked, it's flagged for sales instead of dropped |
| "need Mon AM!!" / need-by 10/05 + EXPEDITE | Shows its standard ship date | Flags the tight date and asks if it's a dock or ship date |
| Crossed-out line on the note | Skipped ✅ | Skipped ✅ |
| Phone photo (PNG/JPG), XLSX BOM, forwarded `.eml` thread | Not accepted (PDF, DOC, DOCX, CSV only) | Accepted |
| Where each value came from | Not shown | Hover any cell to see the verbatim quote it was read from, with a confidence dot |
| Follow-up to the buyer | None | **Copy questions as email** drafts the reply |

Both tools read the documents correctly. The difference is what happens to a line the instant quote can't price: Upload PO changes or drops it, and this tool keeps it and asks someone. That matters most on the larger aerospace and defense POs that go to sales anyway. The two test files are `samples/06-scanned-note.pdf` and an image-only copy of `samples/02-aerospace-po.pdf`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in what you have
npm run dev                  # http://127.0.0.1:3000
```

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | for Claude parsing | Extraction with `claude-opus-5-5` (adaptive thinking, medium effort, Zod structured output). |
| `OPENAI_API_KEY` | for OpenAI API parsing | Uses the Responses API; usage is billed to your OpenAI Platform account. |
| `OPENAI_ACCESS_TOKEN` | no | Optional app-issued OAuth access token with `chatgpt.tokens.use.direct`. The UI sign-in flow is preferred because it also stores and rotates refresh tokens. An environment token must be renewed by its owner. |
| `OPENAI_MODEL` | no | Defaults to `gpt-6.1-sol`. Choose a model available to the API account or connected ChatGPT plan. |
| `LLM_PROVIDER` | no | `claude`, `openai`, or `chatgpt`. Without an explicit setting, a connected ChatGPT plan takes priority, followed by an OpenAI API key, then Claude. The app displays the provider and model. Errors never silently switch providers or billing accounts. |
| `CHATGPT_AUTH_DIR` | no | Protected local credentials directory; defaults to gitignored `.chatgpt/`. Run one server process per directory. |
| `NOX_API_KEY` | no | Turns on the live materials catalog (`GET /api/v1/materials`, cached for 10 min) and enables the **Submit to Nox** button. |
| `NOX_API_BASE_URL` | no | Defaults to `https://developer-api.noxmetals.co`. |
| `MOCK_LLM` | no | `1` returns a canned extraction of a fictional aerospace PO instead of calling an AI provider. Every input gets the same result. Use it to try the UI, validation and payload flow without a key. |

## Dry run vs live

Submission is **dry run by default**. A real `POST /api/v1/rfqs` only goes out when both of these are true:

1. `NOX_API_KEY` is set on the server, and
2. a user clicks **Submit to Nox** and confirms the dialog. The client sends `{ payload, live: true }`.

In every other case (no key, or **Create RFQ (dry run)**), `/api/submit` returns the exact request it would have sent: method, URL, headers with the key redacted to `$NOX_API_KEY`, and the body. The payload panel shows the same request as a copyable `curl`. The `Idempotency-Key` header is a SHA-256 of the body, so a retry or double-click replays the original RFQ and doesn't create a duplicate. After a live submit, the UI polls `GET /api/v1/rfqs/{id}` through `/api/rfqs/[id]` until `pricing_status` leaves `pricing`.

## Extraction cache

A live extraction takes one to two minutes, so the AI output is cached by a SHA-256 of the input's content. Running the same document again returns the cached extraction instantly. Normalization, validation, flags and the payload are still recomputed on every run, so date checks use today's date and catalog changes apply.

- `samples/extractions/` (committed) holds extractions of the bundled demo samples, so the demo works without a connected AI provider.
- `.cache/extractions/` (gitignored, override with `EXTRACTION_CACHE_DIR`) holds everything else, because uploads can be real customer documents.
- A cached result says **Cached extraction from** its date and offers **Re-run live**, which calls `/api/parse?fresh=1` to skip the cache and overwrite the entry.
- Bump `CACHE_VERSION` in `lib/extraction-cache.ts` when the prompt or extraction schema changes.
- `MOCK_LLM=1` bypasses the cache.

## Connect your ChatGPT plan locally

1. Run `npm run dev` and open `http://127.0.0.1:3000`.
2. Click **Continue with ChatGPT**, sign in, and allow RFQ Parser to use your ChatGPT plan. Opening the app on `localhost` also works; sign-in first redirects to `127.0.0.1` so its callback and browser cookie use the same host.
3. After the browser returns, the app displays **Using your ChatGPT plan**. Upload a document or paste an RFQ. The normal extraction schema, normalization, validation, and Nox submission flow apply.
4. Use the account selector to add, reconnect, or switch accounts. **Manage usage** opens ChatGPT usage settings. **Disconnect** attempts to revoke the renewable session, clears its local tokens, and retains the account/client mapping for later sign-in. If remote revocation can't be confirmed, the UI says so.

No partner API key or client secret is needed for this local personal-project flow. RFQ Parser registers its own OAuth client and persists a stable host ID. It requests `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, uses PKCE/state/nonce, verifies ID-token signatures and claims, and checks plan permission before inference. It keeps each account's client ID and tokens separate; refreshes are serialized and replacement credentials are written atomically with file mode `0600` in a directory with mode `0700`.

Tokens stay on the Node server and are never returned to browser JavaScript or API status responses. **Do not paste a cached Codex login token into source code**; this app needs its own ChatGPT plan authorization. For a manually provisioned app token, use the server-only `OPENAI_ACCESS_TOKEN` variable. It cannot be disconnected through the UI, and RFQ Parser doesn't refresh it.

The dev and production scripts bind to loopback. ChatGPT authentication routes and plan-backed parsing reject remote hosts; account mutations and plan parsing also require the app's same-origin `Origin` header. This is a single-user local app, not a hosted multi-user authentication service. Use a separate credential directory for each installation/process. Moving it into a paid or remotely hosted product requires reviewing the available integration and a different session/storage design.

The official [Sign in with ChatGPT guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) documents eligibility and registration. [Plan-backed inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) uses `POST https://api.openai.com/v1/responses` with a bearer access token, `store: false`, and `stream: true`. Requests consume existing ChatGPT plan usage; they don't provide a separate allowance or access to past ChatGPT conversations. PDFs and images are sent inline, and spreadsheets are converted to text locally.

For API-key access instead, set `OPENAI_API_KEY` in `.env.local` and optionally `LLM_PROVIDER=openai`. For Claude, set `ANTHROPIC_API_KEY` and optionally `LLM_PROVIDER=claude`. `MOCK_LLM=1` continues to bypass all model calls.

## Demo script (about 2 minutes)

The three featured samples are pre-cached, so they work with no key. Run `npm run dev` and use them:

1. **`02-aerospace-po.pdf`**: click it in the empty state (it's pre-cached, so it returns instantly). Four lines come back with AMS/QQ certs, DFARS on every line, and a tight need-by date. Hover any cell to see the verbatim quote it came from. A dot marks a medium or low-confidence value.
2. **Flags**: errors block a line, warnings ask for confirmation (for example "T6 requested on plate; Nox stocks T651"). Click **Copy questions as email** to get a ready-to-send reply to the buyer.
3. **Fix a cell**: change a temper or a qty. The flags, the excluded lines and the payload all recompute right away. Accept a warning to clear it.
4. **Payload**: switch between JSON and curl, then click **Create RFQ (dry run)**. With a Nox key, **Submit to Nox** creates the real RFQ and shows Wayne's pricing status.
5. **Side by side**: upload `06-scanned-note.pdf` to Upload PO on noxmetals.co/quote, then open `06-scanned-note.png` here. There, the 7075 line comes back as 0.5" and the 5083 line is missing. Here, every line is kept, the 0.375" thickness and the 5083 temper are flagged, and the crossed-out line is still skipped.
6. Optional: **`05-rfq-out-of-catalog.pdf`** (qty 250 blocked, 17-4 PH routed to sales).

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: existing pipeline rules plus OAuth validation/refresh/revocation and streamed OpenAI extraction, input formats, and failure handling. Uses mocked provider responses; no credentials required. |
| `npm run eval` | Runs the parse pipeline over every `samples/*` file that has `samples/expected/<name>.json`. Prints field accuracy and flag recall, and writes `eval-report.json`. Needs credentials for the selected provider. With `MOCK_LLM=1` it only proves the harness runs. |

Eval conventions follow `samples/README.md`. Lines match by ref when every ref agrees, otherwise by order. Flags are scored on `(line_ref, severity)`, and `field` is reported as a secondary soft match. A null expected compliance counts as equal to `"none"`.

## Layout

```
app/page.tsx              single-page UI (input, header card, line table, flags, payload)
app/api/parse             POST multipart file or JSON {text, filename?} → ParseResult
app/api/submit            POST {payload, live?} → dry-run request or live 202
app/api/samples[/name]    list and serve files in samples/
app/api/status            model, catalog source, Nox mode (for the header pills)
app/api/chatgpt/*          loopback sign-in, callback, account selection, disconnect
app/api/rfqs/[id]         proxy for polling a live RFQ
components/               UI building blocks
hooks/useRfqEditor.ts     edits + client-side re-validation
lib/schema.ts             Zod schema for the LLM and the shared types (ExtractedRfq, Flag, CreateRfqDto…)
lib/extract.ts, prompt.ts Claude call and system prompt
lib/extract-openai.ts     OpenAI Responses extraction with an API key or app OAuth token
lib/chatgpt-auth.ts       local OAuth registrations, private storage, refresh/revocation
lib/llm.ts               provider selection and readiness
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
- Stock plate thicknesses for 6061, 7075 and 7050 come from the instant-quote dropdown (`data/plate-thicknesses.json`, read 2026-10-15). The materials API doesn't return thicknesses, so this list needs a refresh when Nox changes its stock. Other alloys aren't thickness-checked.
- The API has no need-by, PO or tolerance fields. The PO number, customer part number, cut tolerance, need-by date and the mill-cert requirement go into each line's `job_detail`. The PO number, company and date also go into `subject`.
- Lines with blocking errors are left out of the payload, and the UI says which ones. You can still submit the clean lines.
- `xlsx` (SheetJS 0.18.5 from npm) has a known advisory that applies to untrusted spreadsheets. That's acceptable for a demo. For production, switch to the SheetJS CDN build.
