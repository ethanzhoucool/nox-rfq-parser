import * as XLSX from "xlsx";
import { HttpError } from "./errors";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export type RfqInput =
  | { kind: "pdf"; filename: string; data: string }
  | { kind: "image"; filename: string; mediaType: ImageMediaType; data: string }
  | { kind: "text"; filename: string; text: string };

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Text sent to the model, after a spreadsheet is converted. Far more than any RFQ, well short of a runaway export. */
export const MAX_TEXT_CHARS = 1_000_000;
/** Rows read per sheet. Capping the parse keeps a huge export from tying up the server for seconds. */
export const MAX_SHEET_ROWS = 5_000;

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);
const ZIP_SPREADSHEETS = new Set(["xlsx", "ods"]);
const TEXT_EXTENSIONS = new Set(["txt", "eml", "csv", "tsv", ""]);

export const ACCEPTED_EXTENSIONS = ["pdf", ...Object.keys(IMAGE_TYPES), ...SPREADSHEET_EXTENSIONS, "txt", "eml", "csv", "tsv"];

export function fromText(text: string, filename = "pasted.txt"): RfqInput {
  if (!text.trim()) throw new HttpError(400, "empty_input", "Paste some RFQ text or drop a file.");
  if (text.length > MAX_TEXT_CHARS) {
    throw new HttpError(
      413,
      "text_too_large",
      `${filename} has ${text.length.toLocaleString("en-US")} characters of text; the limit is ${MAX_TEXT_CHARS.toLocaleString("en-US")}. Send only the material lines.`,
    );
  }
  return { kind: "text", filename, text };
}

export function fromFile(filename: string, bytes: Buffer): RfqInput {
  if (bytes.byteLength === 0) throw new HttpError(400, "empty_input", `${filename} is empty.`);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "file_too_large", `${filename} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }

  const extension = extensionOf(filename);
  if (extension === "pdf") {
    // The header may follow a little junk, but must be in the first 1 KB.
    if (!bytes.subarray(0, 1024).includes("%PDF-")) throw unreadable(filename, "a PDF");
    return { kind: "pdf", filename, data: bytes.toString("base64") };
  }
  if (extension in IMAGE_TYPES) {
    // Trust the bytes over the extension: a JPEG saved as .png is still a JPEG to the model.
    const mediaType = imageType(bytes);
    if (!mediaType) throw unreadable(filename, "a PNG, JPEG, GIF or WebP image");
    return { kind: "image", filename, mediaType, data: bytes.toString("base64") };
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) return fromText(spreadsheetToCsv(filename, extension, bytes), filename);
  if (TEXT_EXTENSIONS.has(extension)) return fromText(decodeText(filename, bytes), filename);

  throw new HttpError(415, "unsupported_file", `Unsupported file type ".${extension}". Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
}

function spreadsheetToCsv(filename: string, extension: string, bytes: Buffer): string {
  // xlsx and ods are zip archives. Without this check SheetJS reads any bytes as a one-column CSV.
  if (ZIP_SPREADSHEETS.has(extension) && !startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw unreadable(filename, `a .${extension} spreadsheet`);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer", sheetRows: MAX_SHEET_ROWS + 1 });
  } catch {
    throw new HttpError(422, "unreadable_file", `Couldn't read ${filename} as a spreadsheet. If it's password-protected, save an unprotected copy.`);
  }

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const ref = sheet["!fullref"] ?? sheet["!ref"];
    // sheetRows stops one row past the limit, so a sheet that reaches it has more rows than we read: never send a partial sheet.
    const rows = ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
    if (rows > MAX_SHEET_ROWS) {
      throw new HttpError(
        413,
        "too_many_rows",
        `Sheet "${name}" in ${filename} has more than ${MAX_SHEET_ROWS.toLocaleString("en-US")} rows. Delete the rows that aren't material, or split the file.`,
      );
    }
  }
  return workbook.SheetNames.map((name) => `## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false })}`).join(
    "\n\n",
  );
}

/**
 * Excel's "Unicode Text" export is UTF-16, and Windows CSVs are often Windows-1252, where reading them
 * as UTF-8 turns "±.005" and "Ø2" into replacement characters. Anything with NUL bytes left is binary.
 */
function decodeText(filename: string, bytes: Buffer): string {
  let text: string;
  if (startsWith(bytes, [0xff, 0xfe])) text = new TextDecoder("utf-16le").decode(bytes);
  else if (startsWith(bytes, [0xfe, 0xff])) text = new TextDecoder("utf-16be").decode(bytes);
  else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  if (text.includes("\0")) throw unreadable(filename, "a text file");
  return text;
}

function imageType(bytes: Buffer): ImageMediaType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  const head = bytes.subarray(0, 12).toString("latin1");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

function unreadable(filename: string, expected: string): HttpError {
  return new HttpError(415, "unreadable_file", `${filename} doesn't look like ${expected}. Check the file and try again.`);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}
