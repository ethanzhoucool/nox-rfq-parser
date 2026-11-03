import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { MAX_SHEET_ROWS, MAX_TEXT_CHARS, fromFile, fromText } from "@/lib/input";

const sample = (name: string) => readFileSync(path.join(process.cwd(), "samples", name));
const textOf = (input: ReturnType<typeof fromFile>) => (input.kind === "text" ? input.text : null);
const rejected = (code: string, status: number) => expect.objectContaining({ code, status });

function workbook(rows: number, bookType: XLSX.BookType = "xlsx"): Buffer {
  const aoa = [["Find #", "Descr.", "Qty"], ...Array.from({ length: rows - 1 }, (_, i) => [String(i), "PLATE 6061-T651 .500 X 12 X 24", "1"])];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), "BOM");
  return XLSX.write(book, { type: "buffer", bookType, compression: true });
}

describe("fromFile", () => {
  it("accepts the bundled samples", () => {
    expect(fromFile("02-aerospace-po.pdf", sample("02-aerospace-po.pdf")).kind).toBe("pdf");
    expect(fromFile("06-scanned-note.png", sample("06-scanned-note.png"))).toMatchObject({ kind: "image", mediaType: "image/png" });
    expect(textOf(fromFile("04-bom-export.xlsx", sample("04-bom-export.xlsx")))).toContain("AL6061T651");
    expect(textOf(fromFile("04-bom-export.csv", sample("04-bom-export.csv")))).toContain("AL6061T651");
  });

  it("rejects a file whose bytes don't match its extension", () => {
    expect(() => fromFile("po.pdf", Buffer.from("hello, not a pdf"))).toThrow(rejected("unreadable_file", 415));
    expect(() => fromFile("note.png", Buffer.from("not an image"))).toThrow(rejected("unreadable_file", 415));
    expect(() => fromFile("bom.xlsx", Buffer.from("not a spreadsheet"))).toThrow(rejected("unreadable_file", 415));
    expect(() => fromFile("scan", sample("06-scanned-note.png"))).toThrow(rejected("unreadable_file", 415));
  });

  it("sends an image with the media type its bytes have", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(fromFile("photo.png", jpeg)).toMatchObject({ kind: "image", mediaType: "image/jpeg" });
  });

  it("answers a corrupt spreadsheet with a 4xx, not a server error", () => {
    expect(() => fromFile("bom.xlsx", Buffer.from("PK\x03\x04 truncated archive"))).toThrow(rejected("unreadable_file", 422));
  });

  it("rejects a sheet with more rows than it reads, instead of sending part of it", () => {
    expect(textOf(fromFile("bom.xlsx", workbook(MAX_SHEET_ROWS)))).toContain(`${MAX_SHEET_ROWS - 2},PLATE`);
    expect(() => fromFile("bom.xlsx", workbook(MAX_SHEET_ROWS + 1))).toThrow(rejected("too_many_rows", 413));
    expect(() => fromFile("bom.ods", workbook(MAX_SHEET_ROWS + 1, "ods"))).toThrow(rejected("too_many_rows", 413));
    const csvSavedAsXls = Buffer.from(Array.from({ length: MAX_SHEET_ROWS + 1 }, (_, i) => `${i},PLATE,1`).join("\n"));
    expect(() => fromFile("export.xls", csvSavedAsXls)).toThrow(rejected("too_many_rows", 413));
  });

  it("decodes Windows-1252 and UTF-16 text instead of mangling ± and Ø", () => {
    const cp1252 = Buffer.from([0x52, 0x44, 0x20, 0xd8, 0x32, 0x20, 0xb1, 0x2e, 0x30, 0x33]);
    expect(textOf(fromFile("rfq.csv", cp1252))).toBe("RD Ø2 ±.03");
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Find #\tQty\r\n10\t2", "utf16le")]);
    expect(textOf(fromFile("bom.txt", utf16))).toBe("Find #\tQty\r\n10\t2");
    expect(textOf(fromFile("rfq.txt", Buffer.from("﻿6061 plate ±.005")))).toBe("6061 plate ±.005");
  });

  it("rejects binary data posing as text", () => {
    expect(() => fromFile("rfq.txt", Buffer.from([0x36, 0x30, 0x00, 0x00, 0x01]))).toThrow(rejected("unreadable_file", 415));
  });
});

describe("fromText", () => {
  it("rejects text over the size limit", () => {
    expect(() => fromText("x".repeat(MAX_TEXT_CHARS + 1))).toThrow(rejected("text_too_large", 413));
    expect(fromText("6061 plate").kind).toBe("text");
  });
});

describe("POST /api/parse", () => {
  it("refuses an oversized body before reading it", async () => {
    const { POST } = await import("@/app/api/parse/route");
    const request = new Request("http://127.0.0.1:3000/api/parse", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(64 * 1024 * 1024) },
      body: JSON.stringify({ text: "6061 plate" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "file_too_large" } });
  });
});
