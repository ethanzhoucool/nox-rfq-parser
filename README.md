# RFQ Parser for Nox Metals

Buyers send RFQs as sloppy emails, SAP-style PDF POs, BOM spreadsheets and phone photos of handwritten notes. RFQ Parser turns any of them into a validated request for Nox's RFQ API (`POST /api/v1/rfqs`). Anything missing, ambiguous or out of stock becomes a flag with a question for the buyer. Nothing is filled in, rounded or dropped silently.

```
document ─► AI extraction ─► normalize ─► validate against Nox's catalog ─► RFQ payload ─► submit to Nox
            every value keeps   fractions, mm,   alloy/temper, stock thickness,   lines with errors
            its source quote    glued tempers,   qty 1–200, need-by date          are held back
            and a confidence    spec callouts
```

## How it compares with Upload PO on noxmetals.co

The **Upload PO** button on [noxmetals.co/quote](https://noxmetals.co/quote) already reads scanned and handwritten PDFs well. It's built for a buyer getting an instant quote, so it fits each request to what the quote form can price. RFQ Parser is built for the person at Nox who reviews the request: it keeps everything the buyer asked for and shows what needs a decision.

I ran the same two image-only PDFs (no text layer) through both on 2026-10-15:

| Buyer asked for | Upload PO | RFQ Parser |
|---|---|---|
| 7075-T651 **.375** × 3 × 5 (handwritten) | Quoted as **0.5"** thick, with no notice | Keeps 0.375" and warns that it isn't a stock thickness for 7075 (nearest 0.25" or 0.5") |
| 5083 1/4 × 48 × 96 (handwritten) | Line dropped, no notice | Kept. Asks "H116 or H321?" |
| 2024-T351 1.25 × 10 × 20 (scanned PO) | Line dropped, no notice | Kept and checked against the catalog. If it isn't stocked, it's flagged for sales instead of dropped |
| "need Mon AM!!" / need-by 10/05 + EXPEDITE | Shows its standard ship date | Flags the tight date and asks whether it's a dock or ship date |
| Crossed-out line on the note | Skipped ✅ | Skipped ✅ |
| Phone photo (PNG/JPG), XLSX BOM, forwarded `.eml` thread | Not accepted (PDF, DOC, DOCX, CSV only) | Accepted |
| Where each value came from | Not shown | Hover any cell to see the verbatim quote it was read from, with a confidence dot |
| Follow-up to the buyer | None | **Copy questions as email** drafts the reply |

Both read the documents correctly. The difference is what happens to a line the instant quote can't price: Upload PO changes or drops it, and RFQ Parser keeps it and asks someone. That matters most on the larger aerospace and defense POs that go to sales anyway.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev        # http://127.0.0.1:3000
```

The featured samples have cached extractions, so they work with no keys at all. To parse your own documents, set one AI key:

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Extraction with Claude (`claude-opus-5-5`). |
| `OPENAI_API_KEY` | Extraction with the OpenAI Responses API (`OPENAI_MODEL`, default `gpt-6.1-sol`). |
| `NOX_API_KEY` | Uses Nox's live materials catalog and sends RFQs to Nox for real. |
| `NOX_API_BASE_URL` | Defaults to `https://developer-api.noxmetals.co`. |
| `LLM_PROVIDER` | `claude`, `openai` or `chatgpt`, to pick a provider when several are configured. |
| `MOCK_LLM` | `1` returns a canned extraction for every input, for trying the UI without any key. |

You can also parse on your own ChatGPT plan instead of an API key; see [docs/chatgpt-sign-in.md](docs/chatgpt-sign-in.md).

## Submitting to Nox

There's one button. With `NOX_API_KEY` set, it reads **Submit to Nox**, asks for confirmation, sends the RFQ, and then shows Nox's pricing status as it updates. Without a key, it reads **Create RFQ** and does a dry run: nothing is sent, and the panel shows the exact request it would have made, as JSON or a copyable `curl`.

Every request carries an `Idempotency-Key` that is a hash of the body, so a retry or double-click can't create a duplicate RFQ. Lines with blocking errors are held back, and the panel says which ones.

## Demo (about 2 minutes)

1. **`02-aerospace-po.pdf`**: click it on the start screen. Four lines come back with AMS/QQ certs, DFARS on every line and a tight need-by date. Hover any cell to see the quote it came from.
2. **Flags**: errors hold a line back, warnings ask for confirmation (for example "T6 requested on plate; Nox stocks T651"). **Copy questions as email** drafts the reply to the buyer.
3. **Edit a cell**: change a temper or a quantity. Flags and the payload recompute instantly. Accept a warning to clear it.
4. **Create RFQ**: the exact API request appears, or with a Nox key the RFQ is created and priced.
5. **Side by side**: upload `06-scanned-note.pdf` to Upload PO on noxmetals.co/quote, then open `06-scanned-note.png` here. There, the 7075 line comes back as 0.5" and the 5083 line is missing. Here, every line is kept, the 0.375" thickness and the 5083 temper are flagged, and the crossed-out line is still skipped.

`05-rfq-out-of-catalog.pdf` (quantity 250, stainless in an aluminum RFQ) and `03-forwarded-thread.eml` (edits across an email thread) are good follow-ups. [samples/README.md](samples/README.md) describes every sample.

## How it works

- **Extraction** (`lib/extract.ts`, `lib/extract-openai.ts`, `lib/prompt.ts`): the model returns a Zod-typed RFQ in which every value has a verbatim source quote and a confidence. PDFs and images go to the model directly; spreadsheets are converted to text first.
- **Normalization** (`lib/normalize.ts`, `lib/units.ts`, `lib/specs.ts`): fractions, millimetres, glued tempers like `AL6061T651`, and spec callouts such as AMS 4027 are turned into catalog terms.
- **Validation** (`lib/validate.ts`): deterministic checks against Nox's catalog and API limits: missing fields, unstocked alloys and tempers, non-stock plate thicknesses, quantities over 200, tight need-by dates.
- **Payload** (`lib/payload.ts`, `lib/nox.ts`): builds the `CreateRfqDto`. PO number, part number, tolerance, need-by date and cert requirements go into each line's `job_detail`, since the API has no fields for them.
- **Cache** (`lib/extraction-cache.ts`): extraction takes one to two minutes, so results are cached by a hash of the document. Validation always re-runs, and **Re-run live** skips the cache.

## Development

| Command | |
|---|---|
| `npm run dev` | Start the app on 127.0.0.1:3000 |
| `npm test` | Unit tests (no credentials needed) |
| `npm run typecheck` | TypeScript check |
| `npm run eval` | Field accuracy and flag recall over every sample with ground truth in `samples/expected/` (needs an AI key) |

## Notes and limits

- Without `NOX_API_KEY`, the catalog is an approximation built from public noxmetals.co pages (`data/materials.seed.json`). `Tube` is empty because tube isn't quoted through the API.
- Stock plate thicknesses for 6061, 7075 and 7050 come from the instant-quote dropdown (`data/plate-thicknesses.json`, read 2026-10-15). The materials API doesn't return thicknesses, so the list needs a refresh when Nox's stock changes.
- `docs/nox-openapi.json` is Nox's published API spec, which the payload is built against.
- All sample companies, people and part numbers are fictional.
