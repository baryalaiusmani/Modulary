// Bulk-Validierung: liest XLSX/CSV/TXT, erkennt die E-Mail-Spalte, validiert
// jede Zeile, erkennt Duplikate/leere Zeilen und erzeugt eine Ergebnisdatei,
// die ALLE Originalspalten unveraendert behaelt und die Pruefspalten anhaengt.

import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { validateEmail } from "./validate";
import type { BulkResult, BulkRowResult, BulkSummary, EmailValidationResult, ValidationOptions } from "./types";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_ROWS = Number(process.env.EMAIL_VALIDATOR_MAX_ROWS || 5000);

type ParsedFile = { columns: string[]; rows: Record<string, string>[] };

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && value.text) return String(value.text);
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("hyperlink" in value) return String(value.hyperlink);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

async function parseWorkbook(buffer: Buffer, extension: string): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  if (extension === "csv") await workbook.csv.read(Readable.from(buffer));
  else await workbook.xlsx.load(buffer as never); // xlsx (xls-Binaer wird nicht unterstuetzt)

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Die Datei enthaelt kein Tabellenblatt.");

  const headerRow = worksheet.getRow(1);
  const columns = Array.from({ length: headerRow.cellCount }, (_, i) => cellToString(headerRow.getCell(i + 1).value).trim() || `Spalte ${i + 1}`);

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    columns.forEach((column, index) => { record[column] = cellToString(row.getCell(index + 1).value).trim(); });
    if (Object.values(record).some((value) => value !== "")) rows.push(record);
  });
  return { columns, rows };
}

function parseText(buffer: Buffer): ParsedFile {
  const lines = buffer.toString("utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { columns: ["email"], rows: lines.map((line) => ({ email: line })) };
}

/** Erkennt die wahrscheinlichste E-Mail-Spalte (case-insensitive). */
export function detectEmailColumn(columns: string[]): { column: string; candidates: string[] } {
  const candidates = columns.filter((column) => /^e-?mail\b/i.test(column) || /e-?mail/i.test(column) || /mail(adresse)?$/i.test(column));
  const exact = candidates.find((column) => /^e-?mail(adresse)?$/i.test(column.trim()));
  const chosen = exact ?? candidates[0] ?? (columns.length === 1 ? columns[0] : "");
  if (!chosen) throw new Error("Keine E-Mail-Spalte gefunden. Bitte Spalte z. B. 'Email' oder 'E-Mail' nennen.");
  return { column: chosen, candidates: candidates.length ? candidates : [chosen] };
}

const RESULT_KEYS: (keyof BulkRowResult)[] = [
  "original_email", "normalized_email", "duplicate_email", "row_without_email",
  "syntax_ok", "syntax_reason", "did_you_mean", "gibberish_localpart",
  "domain_exists", "dns_ok", "mx_found", "mx_record", "a_record_fallback",
  "smtp_server_reachable", "smtp_provider", "smtp_check", "mailbox_exists",
  "mailbox_full", "account_disabled", "alias_detected", "catch_all",
  "disposable", "long_term_disposable", "free_or_webmail", "role_based",
  "spamtrap_risk", "abuse_risk", "toxic_risk", "suppression_risk",
  "high_risk_domain", "subdomain_mailer_risk", "immature_domain", "tld_risk", "invalid_tld",
  "website_exists", "registrant_company", "public_sources_found", "public_sources_count",
  "activity_signal", "engagement_signal", "bot_risk",
  "spf_present", "dkim_present", "dmarc_present", "tls_or_mta_sts_signal",
  "reason_codes", "confidence_score", "detail_status", "final_status", "verdict_simple",
];

function formatCell(value: unknown): string | number {
  if (value === null || value === undefined) return "unbekannt";
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function emptyResult(original: string): EmailValidationResult {
  // Basis fuer Zeilen ohne E-Mail (kein Netzwerkaufruf).
  return {
    original_email: original, normalized_email: "", syntax_ok: false, syntax_reason: "keine E-Mail",
    did_you_mean: null, gibberish_localpart: false, domain_exists: null, dns_ok: null, mx_found: null,
    mx_record: null, a_record_fallback: null, smtp_server_reachable: null, smtp_provider: null,
    smtp_check: "skipped", mailbox_exists: null, mailbox_full: null, account_disabled: null,
    alias_detected: null, catch_all: null, disposable: false, long_term_disposable: null,
    free_or_webmail: false, role_based: false, spamtrap_risk: null, abuse_risk: null, toxic_risk: null,
    suppression_risk: null, high_risk_domain: false, subdomain_mailer_risk: false, immature_domain: null,
    tld_risk: false, invalid_tld: false, website_exists: null, registrant_company: null,
    spf_present: null, dkim_present: null, dmarc_present: null, tls_or_mta_sts_signal: null,
    public_sources_found: false, public_sources_count: 0, public_sources_details: [],
    activity_signal: null, engagement_signal: null, bot_risk: null, reason_codes: ["ROW_WITHOUT_EMAIL"],
    confidence_score: 0, detail_status: "Zeile ohne E-Mail", final_status: "ungültig", verdict_simple: "ungültig",
  };
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, run));
}

function buildSummary(results: BulkRowResult[]): BulkSummary {
  const total = results.length;
  const count = (predicate: (r: BulkRowResult) => boolean) => results.filter(predicate).length;
  const gültig = count((r) => r.final_status === "gültig");
  const ungültig = count((r) => r.final_status === "ungültig");
  const riskant = count((r) => r.final_status === "riskant");
  const unbekannt = count((r) => r.final_status === "unbekannt");
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    total, gültig, ungültig, riskant, unbekannt,
    catch_all: count((r) => r.catch_all === true),
    disposable: count((r) => r.disposable),
    role_based: count((r) => r.role_based),
    spamtrap_risk: count((r) => r.spamtrap_risk === true),
    abuse_risk: count((r) => r.abuse_risk === true),
    toxic_risk: count((r) => r.toxic_risk === true),
    duplicate: count((r) => r.duplicate_email),
    rows_without_email: count((r) => r.row_without_email),
    percent: { gültig: pct(gültig), ungültig: pct(ungültig), riskant: pct(riskant), unbekannt: pct(unbekannt) },
  };
}

function buildWorkbook(originalColumns: string[], rows: Record<string, string>[], results: BulkRowResult[], summary: BulkSummary): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Modulary EmailValidator";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Validierung");
  const header = [...originalColumns, ...RESULT_KEYS];
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF635BFF" } };

  rows.forEach((row, index) => {
    const result = results[index];
    const originalValues = originalColumns.map((column) => row[column] ?? "");
    const resultValues = RESULT_KEYS.map((key) => formatCell(result[key]));
    sheet.addRow([...originalValues, ...resultValues]);
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: header.length } };

  // Zusammenfassung.
  const overview = workbook.addWorksheet("Zusammenfassung");
  overview.addRow(["Kennzahl", "Anzahl", "Prozent"]);
  overview.getRow(1).font = { bold: true };
  overview.addRow(["Gesamt", summary.total, "100%"]);
  overview.addRow(["Gueltig", summary.gültig, `${summary.percent.gültig}%`]);
  overview.addRow(["Ungueltig", summary.ungültig, `${summary.percent.ungültig}%`]);
  overview.addRow(["Riskant", summary.riskant, `${summary.percent.riskant}%`]);
  overview.addRow(["Unbekannt", summary.unbekannt, `${summary.percent.unbekannt}%`]);
  overview.addRow([]);
  overview.addRow(["Catch-all", summary.catch_all, ""]);
  overview.addRow(["Disposable", summary.disposable, ""]);
  overview.addRow(["Role-based", summary.role_based, ""]);
  overview.addRow(["Spamtrap-Risiko", summary.spamtrap_risk, ""]);
  overview.addRow(["Abuse-Risiko", summary.abuse_risk, ""]);
  overview.addRow(["Toxic-Risiko", summary.toxic_risk, ""]);
  overview.addRow(["Duplikate", summary.duplicate, ""]);
  overview.addRow(["Zeilen ohne E-Mail", summary.rows_without_email, ""]);

  // Filteransichten je Endstatus.
  (["gültig", "ungültig", "riskant", "unbekannt"] as const).forEach((status) => {
    const filtered = rows.map((row, index) => ({ row, result: results[index] })).filter(({ result }) => result.final_status === status);
    if (!filtered.length) return;
    const view = workbook.addWorksheet(status.charAt(0).toUpperCase() + status.slice(1));
    view.addRow(["original_email", "normalized_email", "confidence_score", "detail_status", "reason_codes"]);
    view.getRow(1).font = { bold: true };
    filtered.forEach(({ result }) => view.addRow([
      result.original_email, result.normalized_email, result.confidence_score, result.detail_status, result.reason_codes.join(", "),
    ]));
  });

  sheet.columns.forEach((column) => { column.width = 20; });
  return workbook;
}

export async function processBulkValidation(file: File, options: ValidationOptions = {}): Promise<BulkResult> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["xlsx", "xls", "csv", "txt"].includes(extension)) {
    throw new Error("Nur .xlsx, .xls, .csv oder .txt werden unterstuetzt.");
  }
  if (file.size > MAX_FILE_SIZE) throw new Error("Die Datei darf maximal 15 MB gross sein.");

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed: ParsedFile;
  try {
    parsed = extension === "txt" ? parseText(buffer) : await parseWorkbook(buffer, extension === "csv" ? "csv" : "xlsx");
  } catch {
    throw new Error(extension === "xls"
      ? "Das alte .xls-Format wird nicht unterstuetzt. Bitte als .xlsx oder .csv speichern."
      : "Die Datei konnte nicht gelesen werden.");
  }

  if (parsed.rows.length > MAX_ROWS) throw new Error(`Zu viele Zeilen (max. ${MAX_ROWS}).`);
  const { column: emailColumn, candidates } = detectEmailColumn(parsed.columns);

  // Duplikate vormerken (auf normalisierter E-Mail).
  const seen = new Set<string>();
  const results: BulkRowResult[] = new Array(parsed.rows.length);
  const concurrency = options.smtp ? 3 : 6;

  await runPool(parsed.rows, concurrency, async (row, index) => {
    const raw = (row[emailColumn] ?? "").trim();
    if (!raw) {
      results[index] = { ...emptyResult(""), duplicate_email: false, row_without_email: true };
      return;
    }
    const validation = await validateEmail(raw, options);
    const key = validation.normalized_email.toLowerCase();
    const duplicate = key ? seen.has(key) : false;
    if (key) seen.add(key);
    results[index] = { ...validation, duplicate_email: duplicate, row_without_email: false };
  });

  const summary = buildSummary(results);
  const workbook = buildWorkbook(parsed.columns, parsed.rows, results, summary);
  const output = Buffer.from(await workbook.xlsx.writeBuffer());

  const preview = parsed.rows.slice(0, 10).map((row, index) => ({
    ...row,
    final_status: results[index].final_status,
    verdict_simple: results[index].verdict_simple,
    confidence_score: results[index].confidence_score,
    reason_codes: results[index].reason_codes.join(", "),
  }));

  return {
    fileName: `${file.name.replace(/\.[^.]+$/, "")}-validiert.xlsx`,
    emailColumn,
    candidateColumns: candidates,
    totalRows: parsed.rows.length,
    summary,
    preview,
    downloadBase64: output.toString("base64"),
  };
}
