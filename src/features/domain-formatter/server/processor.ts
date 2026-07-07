import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { DomainFormatMode, DomainFormatResult } from "@/features/domain-formatter/types";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedExtensions = new Set(["xlsx", "csv"]);

function normalizeCell(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "text" in value) return String(value.text);
  if (typeof value === "object" && "hyperlink" in value) return String(value.hyperlink);
  return String(value);
}

function cellToEditableText(value: ExcelJS.CellValue) {
  const normalized = normalizeCell(value);
  return normalized === null ? "" : String(normalized).trim();
}

function findDomainColumn(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) => {
    const label = String(normalizeCell(headerRow.getCell(index + 1).value) ?? "").trim();
    return { label, index: index + 1 };
  }).filter((header) => header.label);

  const exact = headers.find((header) => /^domain$/i.test(header.label));
  if (exact) return exact;

  const patterns = [/domain/i, /website/i, /webseite/i, /\burl\b/i, /homepage/i, /internet/i];
  const matched = headers.find((header) => patterns.some((pattern) => pattern.test(header.label)));
  if (matched) return matched;

  throw new Error("Keine Domain-Spalte gefunden. Bitte nennen Sie die Spalte z. B. 'Domain', 'Website' oder 'URL'.");
}

function splitDomain(rawValue: string) {
  let value = rawValue.trim();
  if (!value) return { host: "", path: "" };
  value = value.replace(/^mailto:/i, "").replace(/^https?:\/\//i, "").replace(/^\/\//, "");
  value = value.split(/[?#]/)[0].replace(/\/$/, "");

  const slashIndex = value.indexOf("/");
  if (slashIndex < 0) return { host: value, path: "" };
  return { host: value.slice(0, slashIndex), path: value.slice(slashIndex) };
}

function removeLeadingWww(host: string) {
  return host.replace(/^www\./i, "");
}

function ensureWww(host: string) {
  if (!host || /^www\./i.test(host)) return host;
  return `www.${removeLeadingWww(host)}`;
}

export function formatDomainValue(rawValue: string, mode: DomainFormatMode) {
  const { host, path } = splitDomain(rawValue);
  if (!host) return "";

  if (mode === "https-www") return `https://${ensureWww(host)}${path}`;
  if (mode === "www") return `${ensureWww(host)}${path}`;
  return `${removeLeadingWww(host)}${path}`;
}

function worksheetPreview(worksheet: ExcelJS.Worksheet, maxRows = 8) {
  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) => String(normalizeCell(headerRow.getCell(index + 1).value) ?? "").trim());
  const rows: Array<Record<string, string | number | boolean | null>> = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rows.length >= maxRows) return;
    const record = Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row.getCell(index + 1).value)]));
    if (Object.values(record).some((value) => value !== null && value !== "")) rows.push(record);
  });

  return rows;
}

async function loadWorkbook(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) throw new Error("Nur .xlsx- und .csv-Dateien werden unterstuetzt.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Die Datei darf maximal 15 MB gross sein.");

  const input = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  if (extension === "csv") await workbook.csv.read(Readable.from(input));
  else await workbook.xlsx.load(input as never);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Die Datei enthaelt kein Tabellenblatt.");
  return { workbook, worksheet };
}

export async function formatDomainFile(file: File, mode: DomainFormatMode): Promise<DomainFormatResult> {
  const { workbook, worksheet } = await loadWorkbook(file);
  const domainColumn = findDomainColumn(worksheet);
  const before = worksheetPreview(worksheet);

  let totalRows = 0;
  let changedRows = 0;
  let emptyRows = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = row.getCell(domainColumn.index);
    const original = cellToEditableText(cell.value);
    if (!original) {
      emptyRows += 1;
      return;
    }

    totalRows += 1;
    const formatted = formatDomainValue(original, mode);
    if (formatted !== original) {
      cell.value = formatted;
      changedRows += 1;
    }
  });

  const after = worksheetPreview(worksheet);
  const output = Buffer.from(await workbook.xlsx.writeBuffer());
  const baseName = file.name.replace(/\.(xlsx|csv)$/i, "");

  return {
    fileName: `${baseName}-domains-formatiert.xlsx`,
    sheetName: worksheet.name,
    domainColumn: domainColumn.label,
    totalRows,
    changedRows,
    unchangedRows: Math.max(0, totalRows - changedRows),
    emptyRows,
    before,
    after,
    downloadBase64: output.toString("base64"),
  };
}
