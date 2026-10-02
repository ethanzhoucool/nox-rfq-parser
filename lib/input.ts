import * as XLSX from "xlsx";
import { HttpError } from "./errors";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export type RfqInput =
  | { kind: "pdf"; filename: string; data: string }
  | { kind: "image"; filename: string; mediaType: ImageMediaType; data: string }
  | { kind: "text"; filename: string; text: string };

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "ods"]);
const TEXT_EXTENSIONS = new Set(["txt", "eml", "csv", "tsv", ""]);

export const ACCEPTED_EXTENSIONS = ["pdf", ...Object.keys(IMAGE_TYPES), ...SPREADSHEET_EXTENSIONS, "txt", "eml", "csv", "tsv"];

export function fromText(text: string, filename = "pasted.txt"): RfqInput {
  if (!text.trim()) throw new HttpError(400, "empty_input", "Paste some RFQ text or drop a file.");
  return { kind: "text", filename, text };
}

export function fromFile(filename: string, bytes: Buffer): RfqInput {
  if (bytes.byteLength === 0) throw new HttpError(400, "empty_input", `${filename} is empty.`);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, "file_too_large", `${filename} is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }

  const extension = extensionOf(filename);
  if (extension === "pdf") return { kind: "pdf", filename, data: bytes.toString("base64") };
  if (extension in IMAGE_TYPES) {
    return { kind: "image", filename, mediaType: IMAGE_TYPES[extension], data: bytes.toString("base64") };
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) return { kind: "text", filename, text: spreadsheetToCsv(bytes) };
  if (TEXT_EXTENSIONS.has(extension)) return fromText(bytes.toString("utf8"), filename);

  throw new HttpError(415, "unsupported_file", `Unsupported file type ".${extension}". Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
}

function spreadsheetToCsv(bytes: Buffer): string {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  return workbook.SheetNames.map((name) => `## Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false })}`).join(
    "\n\n",
  );
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}
