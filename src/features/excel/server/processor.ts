import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { z } from "zod";
import type { CellValue, DataRow, ExcelOperation, ProcessResult, ProcessSummary } from "@/features/excel/types";
import { RuleBasedPromptInterpreter } from "@/features/excel/server/prompt-interpreter";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions = new Set(["xlsx", "csv"]);
const requestSchema = z.object({ prompt: z.string().trim().min(3).max(10000) });

function normalizeCell(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value);
}

function worksheetToRows(worksheet: ExcelJS.Worksheet): DataRow[] {
  const headerRow = worksheet.getRow(1);
  const columns = Array.from({ length: headerRow.cellCount }, (_, index) => String(normalizeCell(headerRow.getCell(index + 1).value) ?? "").trim());
  if (columns.some((column) => !column)) throw new Error("Jede Spalte benötigt eine Überschrift in der ersten Zeile.");

  const rows: DataRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = Object.fromEntries(columns.map((column, index) => [column, normalizeCell(row.getCell(index + 1).value)]));
    if (Object.values(record).some((value) => value !== null && value !== "")) rows.push(record);
  });
  return rows;
}

function comparable(value: unknown) {
  if (typeof value === "number") return value;
  const number = Number(String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && String(value).trim() !== "" ? number : String(value ?? "").toLocaleLowerCase("de-DE");
}

function normalizeDomain(value: CellValue) {
  return typeof value === "string" ? value.trim().replace(/^https?:\/\//i, "") : value;
}

function normalizeCompany(value: CellValue) {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(gmbh|ag|ug|kg|ohg|inc|ltd|llc|co|company)\b\.?/g, "")
    .replace(/&/g, "und")
    .replace(/[^a-z0-9äöüß]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findCompanyColumn(rows: DataRow[], preferredColumn?: string) {
  const columns = Object.keys(rows[0] ?? {});
  if (preferredColumn && columns.includes(preferredColumn)) return preferredColumn;
  const normalizedPreferred = preferredColumn?.toLocaleLowerCase("de-DE");
  const sameMeaningColumn = columns.find((column) => column.toLocaleLowerCase("de-DE") === normalizedPreferred);
  if (sameMeaningColumn) return sameMeaningColumn;

  const companyPatterns = [/^firma$/i, /firmenname/i, /unternehmen/i, /company/i, /name.*firma/i];
  return columns.find((column) => companyPatterns.some((pattern) => pattern.test(column)));
}

function applyOperations(input: DataRow[], operations: ExcelOperation[], comparisonRows?: DataRow[]) {
  let rows = [...input];
  const descriptions: string[] = [];
  const summary: ProcessSummary = {};
  let highlightedRows: number[] = [];

  for (const operation of operations) {
    if (operation.type === "compareCompaniesWithList") {
      if (!comparisonRows?.length) {
        throw new Error("Für diesen Vergleich muss eine zweite Excel- oder CSV-Liste hochgeladen werden.");
      }
      const primaryColumn = findCompanyColumn(rows, operation.column);
      if (!primaryColumn) {
        throw new Error("In der ersten Liste wurde keine Firmenspalte gefunden. Verwenden Sie z. B. eine Spalte „Firma“, „Unternehmen“ oder „Firmenname“.");
      }
      const comparisonColumn = findCompanyColumn(comparisonRows, primaryColumn);
      if (!comparisonColumn) {
        throw new Error("In der zweiten Liste wurde keine passende Firmenspalte gefunden.");
      }

      const comparisonCompanies = new Set(
        comparisonRows
          .map((row) => normalizeCompany(row[comparisonColumn]))
          .filter(Boolean),
      );
      highlightedRows = rows
        .map((row, index) => ({ index, key: normalizeCompany(row[primaryColumn]) }))
        .filter(({ key }) => key && comparisonCompanies.has(key))
        .map(({ index }) => index);
      summary.matchingCompanies = new Set(highlightedRows.map((index) => normalizeCompany(rows[index][primaryColumn]))).size;
      summary.markedRows = highlightedRows.length;
      summary.comparedCompanies = comparisonCompanies.size;
      descriptions.push(`Erste Liste über „${primaryColumn}“ mit zweiter Liste verglichen`);
      descriptions.push(`${summary.matchingCompanies} gleiche Firmen gefunden und ${summary.markedRows} Zeilen rot markiert`);
    }

    if (operation.type === "domainDuplicateWorkflow") {
      let processedDomains = 0;
      const normalizedRows = rows.map((row) => {
        const original = row[operation.column];
        const normalized = normalizeDomain(original);
        if (normalized !== original) processedDomains += 1;
        return { row: { ...row, [operation.column]: normalized } };
      });
      const counts = new Map<string, number>();
      normalizedRows.forEach(({ row }) => {
        const value = String(row[operation.column] ?? "").trim();
        if (!value) return;
        const key = value.toLocaleLowerCase("de-DE");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      const duplicateKeys = new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
      const marked = normalizedRows.filter(({ row }) => duplicateKeys.has(String(row[operation.column] ?? "").trim().toLocaleLowerCase("de-DE")));
      const unmarked = normalizedRows.filter(({ row }) => !duplicateKeys.has(String(row[operation.column] ?? "").trim().toLocaleLowerCase("de-DE")));
      rows = [...marked, ...unmarked].map(({ row }) => row);
      highlightedRows = marked.map((_, index) => index);
      summary.duplicateDomains = duplicateKeys.size;
      summary.markedRows = marked.length;
      summary.processedDomains = processedDomains;
      descriptions.push(`Protokolle in „${operation.column}“ entfernt`);
      descriptions.push(`${duplicateKeys.size} doppelte Domains erkannt und ${marked.length} Zeilen markiert`);
      descriptions.push("Markierte Zeilen stabil an den Tabellenanfang verschoben");
    }

    if (operation.type === "sort" || operation.type === "group") {
      const direction = operation.type === "group" ? "asc" : operation.direction;
      rows.sort((a, b) => String(a[operation.column] ?? "").localeCompare(String(b[operation.column] ?? ""), "de", { numeric: true }) * (direction === "asc" ? 1 : -1));
      descriptions.push(operation.type === "group" ? `Nach „${operation.column}“ gruppiert` : `Nach „${operation.column}“ ${direction === "asc" ? "aufsteigend" : "absteigend"} sortiert`);
    }

    if (operation.type === "deduplicate") {
      const seen = new Set<string>();
      rows = rows.filter((row) => {
        const key = operation.column ? JSON.stringify(row[operation.column]) : JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      descriptions.push(operation.column ? `Doppelte Werte in „${operation.column}“ entfernt` : "Doppelte Datensätze entfernt");
    }

    if (operation.type === "filter") {
      rows = rows.filter((row) => {
        const left = comparable(row[operation.column]);
        const right = comparable(operation.value);
        if (operation.operator === "contains") return String(left).includes(String(right));
        if (operation.operator === "eq") return left === right;
        if (operation.operator === "gt") return left > right;
        if (operation.operator === "gte") return left >= right;
        if (operation.operator === "lt") return left < right;
        return left <= right;
      });
      descriptions.push(`„${operation.column}“ nach Wert ${operation.operator} ${operation.value} gefiltert`);
    }

    if (operation.type === "normalize") {
      const canonical = new Map<string, string>();
      rows = rows.map((row) => {
        const raw = String(row[operation.column] ?? "").trim();
        const key = raw.toLocaleLowerCase("de-DE").replace(/[^a-z0-9äöüß]/gi, "");
        const value = canonical.get(key) ?? raw;
        if (raw) canonical.set(key, value);
        return { ...row, [operation.column]: value };
      });
      descriptions.push(`Ähnliche Werte in „${operation.column}“ vereinheitlicht`);
    }
  }

  return { rows, descriptions, highlightedRows, summary };
}

async function readWorkbookRows(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) throw new Error("Nur .xlsx- und .csv-Dateien werden unterstützt.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Die Datei darf maximal 10 MB groß sein.");

  const input = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  if (extension === "csv") await workbook.csv.read(Readable.from(input));
  else await workbook.xlsx.load(input as never);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Die Datei enthält kein Tabellenblatt.");

  const originalRows = worksheetToRows(worksheet);
  if (originalRows.length === 0) throw new Error("Die Tabelle enthält keine Datensätze.");
  return { rows: originalRows, sheetName: worksheet.name };
}

export async function processExcelFile(file: File, rawPrompt: string, comparisonFile?: File): Promise<ProcessResult> {
  const { prompt } = requestSchema.parse({ prompt: rawPrompt });
  const { rows: originalRows, sheetName } = await readWorkbookRows(file);
  const comparisonRows = comparisonFile ? (await readWorkbookRows(comparisonFile)).rows : undefined;

  const interpreter = new RuleBasedPromptInterpreter();
  const operations = interpreter.interpret(prompt, originalRows);
  const { rows, descriptions, highlightedRows, summary } = applyOperations(originalRows, operations, comparisonRows);
  const outputWorkbook = new ExcelJS.Workbook();
  const outputSheet = outputWorkbook.addWorksheet("Ergebnis");
  const columns = Object.keys(originalRows[0]);
  outputSheet.addRow(columns);
  rows.forEach((row, index) => {
    const outputRow = outputSheet.addRow(columns.map((column) => row[column]));
    if (highlightedRows.includes(index)) {
      outputRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
        cell.font = { color: { argb: "FF9C0006" } };
      });
    }
  });
  outputSheet.getRow(1).font = { bold: true };
  outputSheet.columns.forEach((column) => { column.width = 18; });
  const output = Buffer.from(await outputWorkbook.xlsx.writeBuffer());
  const baseName = file.name.replace(/\.(xlsx|csv)$/i, "");

  return {
    fileName: `${baseName}-bearbeitet.xlsx`,
    sheetName,
    originalRowCount: originalRows.length,
    resultRowCount: rows.length,
    columns,
    before: originalRows.slice(0, 8),
    after: rows.slice(0, 8),
    highlightedAfterRows: highlightedRows.filter((index) => index < 8),
    operations: descriptions,
    summary,
    downloadBase64: output.toString("base64"),
  };
}
