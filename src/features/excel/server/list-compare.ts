import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { CellValue, DataRow, ListCompareResult } from "@/features/excel/types";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedExtensions = new Set(["xlsx", "csv"]);

function normalizeCell(value: ExcelJS.CellValue): CellValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "text" in value) return String(value.text);
  if (typeof value === "object" && "hyperlink" in value) return String(value.hyperlink);
  return String(value);
}

function worksheetToRows(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  const columns = Array.from({ length: headerRow.cellCount }, (_, index) => String(normalizeCell(headerRow.getCell(index + 1).value) ?? "").trim());
  if (!columns.length || columns.some((column) => !column)) {
    throw new Error("Jede Spalte benoetigt eine Ueberschrift in der ersten Zeile.");
  }

  const rows: DataRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = Object.fromEntries(columns.map((column, index) => [column, normalizeCell(row.getCell(index + 1).value)])) as DataRow;
    if (Object.values(record).some((value) => value !== null && value !== "")) rows.push(record);
  });

  return { columns, rows, sheetName: worksheet.name };
}

async function readWorkbookRows(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) throw new Error("Nur .xlsx- und .csv-Dateien werden unterstuetzt.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Die Datei darf maximal 15 MB gross sein.");

  const input = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  if (extension === "csv") await workbook.csv.read(Readable.from(input));
  else await workbook.xlsx.load(input as never);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Die Datei enthaelt kein Tabellenblatt.");
  return worksheetToRows(worksheet);
}

function normalizeDomain(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function normalizeValue(value: CellValue, column: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/domain|website|webseite|url|homepage/i.test(column)) return normalizeDomain(raw);
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildPairKey(row: DataRow, pair: { column: string; normalizeAs: string }) {
  return normalizeValue(row[pair.column], pair.normalizeAs);
}

function buildPairKeySets(rows: DataRow[], pairs: Array<{ column: string; normalizeAs: string }>) {
  return pairs.map((pair) => new Set(rows.map((row) => buildPairKey(row, pair)).filter(Boolean)));
}

function hasMatch(row: DataRow, pairs: Array<{ column: string; normalizeAs: string }>, keySets: Array<Set<string>>) {
  return pairs.some((pair, index) => {
    const key = buildPairKey(row, pair);
    return key && keySets[index]?.has(key);
  });
}

function parseComparePairs(rawPairs: string, oldColumns: string[], newColumns: string[]) {
  try {
    const parsed = JSON.parse(rawPairs || "[]") as Array<{ oldColumn?: string; newColumn?: string }>;
    const pairs = parsed
      .map((pair) => ({ oldColumn: pair.oldColumn?.trim() || "", newColumn: pair.newColumn?.trim() || "" }))
      .filter((pair) => pair.oldColumn && pair.newColumn);

    if (pairs.length) {
      const missing = pairs.filter((pair) => !oldColumns.includes(pair.oldColumn) || !newColumns.includes(pair.newColumn));
      if (missing.length) throw new Error("Mindestens eine ausgewaehlte Vergleichsspalte fehlt in einer Datei.");
      return pairs;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Vergleichsspalte")) throw error;
  }

  const sharedColumns = oldColumns.filter((column) => newColumns.includes(column));
  if (!sharedColumns.length) {
    throw new Error("Die beiden Listen haben keine Spalten mit gleichem Namen. Bitte waehlen Sie je eine Spalte aus der alten und neuen Liste.");
  }

  const priority = [/^domain$/i, /domain/i, /website/i, /webseite/i, /\burl\b/i, /email/i, /e-mail/i, /unternehmen/i, /firma/i, /company/i, /^name$/i];
  const automatic = sharedColumns.find((column) => priority.some((pattern) => pattern.test(column)));
  const column = automatic || sharedColumns[0];
  return [{ oldColumn: column, newColumn: column }];
}

function unionColumns(left: string[], right: string[]) {
  return [...left, ...right.filter((column) => !left.includes(column))];
}

function informativeColumns(columns: string[], rows: DataRow[]) {
  const filled = columns.filter((column) =>
    rows.some((row) => {
      const value = row[column];
      return value !== null && value !== undefined && String(value).trim() !== "";
    }),
  );
  return filled.length ? filled : columns;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: string[], rows: DataRow[], fillColor?: string) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.addRow(columns);
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF635BFF" } };
  rows.forEach((row) => {
    const outputRow = worksheet.addRow(columns.map((column) => row[column] ?? null));
    if (fillColor) {
      outputRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      });
    }
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };
  worksheet.columns.forEach((column) => { column.width = 22; });
}

function addMarkedOldSheet(columns: string[], rows: DataRow[], redundantIndexes: Set<number>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Modulary AI Workspace";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Alte Liste markiert");
  worksheet.addRow(columns);
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF635BFF" } };
  rows.forEach((row, index) => {
    const outputRow = worksheet.addRow(columns.map((column) => row[column] ?? null));
    if (redundantIndexes.has(index)) {
      outputRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
        cell.font = { color: { argb: "FF9C0006" } };
      });
    }
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: columns.length },
  };
  worksheet.columns.forEach((column) => { column.width = 22; });
  return workbook;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function inspectExcelColumns(file: File) {
  const data = await readWorkbookRows(file);
  return { columns: data.columns, rowCount: data.rows.length, sheetName: data.sheetName };
}

export async function compareExcelLists(oldFile: File, newFile: File, rawComparePairs: string): Promise<ListCompareResult> {
  const oldData = await readWorkbookRows(oldFile);
  const newData = await readWorkbookRows(newFile);
  const comparePairs = parseComparePairs(rawComparePairs, oldData.columns, newData.columns);
  const oldKeyPairs = comparePairs.map((pair) => ({ column: pair.oldColumn, normalizeAs: pair.newColumn }));
  const newKeyPairs = comparePairs.map((pair) => ({ column: pair.newColumn, normalizeAs: pair.newColumn }));
  const compareColumns = comparePairs.map((pair) => pair.oldColumn === pair.newColumn ? pair.oldColumn : `${pair.oldColumn} -> ${pair.newColumn}`);
  const sharedColumns = oldData.columns.filter((column) => newData.columns.includes(column));

  const oldKeySets = buildPairKeySets(oldData.rows, oldKeyPairs);
  const newKeySets = buildPairKeySets(newData.rows, newKeyPairs);
  const existingRows = newData.rows.filter((row) => hasMatch(row, newKeyPairs, oldKeySets));
  const newOnlyRows = newData.rows.filter((row) => !hasMatch(row, newKeyPairs, oldKeySets));
  const redundantOldIndexes = new Set(
    oldData.rows
      .map((row, index) => ({ index, redundant: hasMatch(row, oldKeyPairs, newKeySets) }))
      .filter(({ redundant }) => redundant)
      .map(({ index }) => index),
  );
  const columns = unionColumns(oldData.columns, newData.columns);
  const cleanNewColumns = informativeColumns(newData.columns, newOnlyRows);
  const combinedRows = [...oldData.rows, ...newOnlyRows];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Modulary AI Workspace";
  workbook.created = new Date();
  addSheet(workbook, "Neue Datensaetze", cleanNewColumns, newOnlyRows, "FFD9EAD3");
  addSheet(workbook, "Schon vorhanden", columns, existingRows, "FFFFF2CC");
  addSheet(workbook, "Alt plus Neu", columns, combinedRows);

  const output = Buffer.from(await workbook.xlsx.writeBuffer());
  const oldMarkedOutput = Buffer.from(await addMarkedOldSheet(oldData.columns, oldData.rows, redundantOldIndexes).xlsx.writeBuffer());

  return {
    fileName: `excel-vergleich-${stamp()}.xlsx`,
    oldMarkedFileName: `alte-liste-redundant-markiert-${stamp()}.xlsx`,
    oldSheetName: oldData.sheetName,
    newSheetName: newData.sheetName,
    compareColumns,
    comparePairs,
    sharedColumns,
    columns,
    informativeColumns: cleanNewColumns,
    oldRowCount: oldData.rows.length,
    newRowCount: newData.rows.length,
    existingRowCount: existingRows.length,
    newOnlyRowCount: newOnlyRows.length,
    combinedRowCount: combinedRows.length,
    oldRows: oldData.rows,
    newRows: newData.rows,
    newOnlyRows,
    existingRows,
    newOnlyPreview: newOnlyRows.slice(0, 8),
    existingPreview: existingRows.slice(0, 8),
    combinedPreview: combinedRows.slice(0, 8),
    downloadBase64: output.toString("base64"),
    oldMarkedDownloadBase64: oldMarkedOutput.toString("base64"),
  };
}
