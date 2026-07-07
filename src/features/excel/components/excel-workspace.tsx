"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, GitCompareArrows, LoaderCircle, Plus, RotateCcw, Search, Trash2, UploadCloud } from "lucide-react";
import type { DataRow, ListCompareResult } from "@/features/excel/types";
import { DataPreview } from "@/features/excel/components/data-preview";

type ColumnMeta = { columns: string[]; rowCount: number; sheetName: string };
type ComparePair = { oldColumn: string; newColumn: string };

function normalizeSearch(value: unknown) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

function suggestColumn(source: string[], target: string[]) {
  const priority = [/^domain$/i, /domain/i, /website/i, /webseite/i, /\burl\b/i, /email/i, /e-mail/i, /unternehmen/i, /firma/i, /company/i, /^name$/i];
  const exact = source.find((column) => target.includes(column) && priority.some((pattern) => pattern.test(column)));
  if (exact) return exact;
  return source.find((column) => priority.some((pattern) => pattern.test(column))) || source[0] || "";
}

function makeSuggestedPair(oldColumns: string[], newColumns: string[]): ComparePair {
  const oldColumn = suggestColumn(oldColumns, newColumns);
  const newColumn = newColumns.includes(oldColumn) ? oldColumn : suggestColumn(newColumns, oldColumns);
  return { oldColumn, newColumn };
}

function rowMatches(row: DataRow, columns: string[], query: string, field: string) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const searchableColumns = field === "__all__" ? columns : [field];
  return searchableColumns.some((column) => {
    const value = normalizeSearch(row[column]);
    return value.startsWith(normalizedQuery) || value.includes(normalizedQuery);
  });
}

function SearchTable({ title, rows, columns }: { title: string; rows: DataRow[]; columns: string[] }) {
  const visibleRows = rows.slice(0, 30);
  return (
    <div className="preview-card search-table-card">
      <div className="preview-header"><h3>{title}</h3><span>{rows.length} Treffer - max. 30 sichtbar</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {visibleRows.length === 0 && <tr><td colSpan={columns.length || 1}>Keine Treffer.</td></tr>}
            {visibleRows.map((row, index) => (
              <tr key={index}>{columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExcelWorkspace() {
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [oldMeta, setOldMeta] = useState<ColumnMeta | null>(null);
  const [newMeta, setNewMeta] = useState<ColumnMeta | null>(null);
  const [comparePairs, setComparePairs] = useState<ComparePair[]>([]);
  const [result, setResult] = useState<ListCompareResult | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState("__all__");
  const oldFileInput = useRef<HTMLInputElement>(null);
  const newFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => setProgress((value) => value < 88 ? value + Math.max(1, Math.round((90 - value) / 8)) : value), 250);
    return () => window.clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    if (!oldMeta || !newMeta || comparePairs.length) return;
    setComparePairs([makeSuggestedPair(oldMeta.columns, newMeta.columns)]);
  }, [comparePairs.length, newMeta, oldMeta]);

  const searchColumns = result?.informativeColumns.length ? result.informativeColumns : result?.columns ?? [];
  const oldSearchRows = useMemo(() => result ? result.oldRows.filter((row) => rowMatches(row, result.columns, searchQuery, searchField)) : [], [result, searchField, searchQuery]);
  const newSearchRows = useMemo(() => result ? result.newRows.filter((row) => rowMatches(row, result.columns, searchQuery, searchField)) : [], [result, searchField, searchQuery]);
  const noSharedColumns = Boolean(oldMeta && newMeta && oldMeta.columns.every((column) => !newMeta.columns.includes(column)));
  const hasDifferentColumnNames = comparePairs.some((pair) => pair.oldColumn && pair.newColumn && pair.oldColumn !== pair.newColumn);

  async function inspectFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/features/excel/columns", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data as ColumnMeta;
  }

  async function acceptFile(nextFile: File | undefined, target: "old" | "new") {
    if (!nextFile) return;
    if (!/\.(xlsx|csv)$/i.test(nextFile.name)) {
      setError("Bitte waehlen Sie eine .xlsx- oder .csv-Datei aus.");
      return;
    }
    setError("");
    setResult(null);
    setComparePairs([]);
    try {
      const meta = await inspectFile(nextFile);
      if (target === "old") {
        setOldFile(nextFile);
        setOldMeta(meta);
      } else {
        setNewFile(nextFile);
        setNewMeta(meta);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Spalten konnten nicht gelesen werden.");
    }
  }

  function addPair() {
    if (!oldMeta || !newMeta) return;
    const usedOld = new Set(comparePairs.map((pair) => pair.oldColumn));
    const oldColumn = oldMeta.columns.find((column) => !usedOld.has(column)) || oldMeta.columns[0] || "";
    const newColumn = newMeta.columns.includes(oldColumn) ? oldColumn : newMeta.columns[0] || "";
    setComparePairs((pairs) => [...pairs, { oldColumn, newColumn }]);
  }

  function updatePair(index: number, side: keyof ComparePair, value: string) {
    setComparePairs((pairs) => pairs.map((pair, pairIndex) => pairIndex === index ? { ...pair, [side]: value } : pair));
  }

  function removePair(index: number) {
    setComparePairs((pairs) => pairs.filter((_, pairIndex) => pairIndex !== index));
  }

  function reset() {
    setOldFile(null);
    setNewFile(null);
    setOldMeta(null);
    setNewMeta(null);
    setComparePairs([]);
    setResult(null);
    setError("");
    setProcessing(false);
    setProgress(0);
    setSearchQuery("");
    setSearchField("__all__");
    if (oldFileInput.current) oldFileInput.current.value = "";
    if (newFileInput.current) newFileInput.current.value = "";
  }

  async function runComparison() {
    if (!oldFile || !newFile || comparePairs.length === 0 || comparePairs.some((pair) => !pair.oldColumn || !pair.newColumn)) {
      setError("Bitte laden Sie beide Listen hoch und waehlen Sie mindestens ein vollstaendiges Spaltenpaar aus.");
      return;
    }
    setProcessing(true);
    setProgress(8);
    setError("");

    const formData = new FormData();
    formData.append("oldFile", oldFile);
    formData.append("newFile", newFile);
    formData.append("comparePairs", JSON.stringify(comparePairs));

    try {
      const response = await fetch("/api/features/excel/process", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProgress(100);
      setResult(data);
      setSearchQuery("");
      setSearchField("__all__");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Vergleich ist fehlgeschlagen.");
    } finally {
      setProcessing(false);
    }
  }

  function downloadBase64(base64: string, fileName: string) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="workspace-card">
        <div className="upload-grid">
          <div className={`upload-zone ${oldFile ? "has-file" : ""}`} onClick={() => oldFileInput.current?.click()} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={(event: DragEvent) => { event.preventDefault(); void acceptFile(event.dataTransfer.files[0], "old"); }}>
            <input ref={oldFileInput} type="file" accept=".xlsx,.csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => void acceptFile(event.target.files?.[0], "old")} />
            <div className="upload-icon">{oldFile ? <FileSpreadsheet size={25} /> : <UploadCloud size={25} />}</div>
            {oldFile ? <><strong>{oldFile.name}</strong><span>{oldMeta?.columns.length ?? 0} Spalten erkannt</span></> : <><strong>Alte Liste hochladen</strong><span>Diese Datensaetze gelten als bereits bekannt</span></>}
          </div>

          <div className={`upload-zone ${newFile ? "has-file" : ""}`} onClick={() => newFileInput.current?.click()} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={(event: DragEvent) => { event.preventDefault(); void acceptFile(event.dataTransfer.files[0], "new"); }}>
            <input ref={newFileInput} type="file" accept=".xlsx,.csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => void acceptFile(event.target.files?.[0], "new")} />
            <div className="upload-icon">{newFile ? <FileSpreadsheet size={25} /> : <UploadCloud size={25} />}</div>
            {newFile ? <><strong>{newFile.name}</strong><span>{newMeta?.columns.length ?? 0} Spalten erkannt</span></> : <><strong>Neue Liste hochladen</strong><span>Diese Datensaetze werden gegen die alte Liste verglichen</span></>}
          </div>
        </div>

        {oldMeta && newMeta && (
          <div className="column-picker-card">
            <label><GitCompareArrows size={16} /> Vergleichsspalten</label>
            <p className="helper-text">Ein Treffer in einem der Spaltenpaare reicht aus, damit ein Datensatz als bereits vorhanden gilt. Fuege mehrere Paare hinzu, z. B. Domain und Unternehmensname.</p>
            <div className="pair-list">
              {comparePairs.map((pair, index) => (
                <div className="pair-row" key={`${index}-${pair.oldColumn}-${pair.newColumn}`}>
                  <div>
                    <span>Alte Liste</span>
                    <select value={pair.oldColumn} onChange={(event) => updatePair(index, "oldColumn", event.target.value)}>
                      {oldMeta.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                    </select>
                  </div>
                  <div>
                    <span>Neue Liste</span>
                    <select value={pair.newColumn} onChange={(event) => updatePair(index, "newColumn", event.target.value)}>
                      {newMeta.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                    </select>
                  </div>
                  <button className="icon-button" onClick={() => removePair(index)} disabled={comparePairs.length === 1} aria-label="Spaltenpaar entfernen"><Trash2 size={17} /></button>
                </div>
              ))}
            </div>
            <button className="button secondary add-pair-button" onClick={addPair}><Plus size={17} /> Weiteres Spaltenpaar</button>
            {hasDifferentColumnNames && <div className="warning-message"><AlertTriangle size={16} /> Hinweis: Mindestens ein Spaltenpaar hat unterschiedliche Namen. Das ist erlaubt, wenn beide Spalten dieselbe Bedeutung haben.</div>}
            {noSharedColumns && <div className="warning-message"><AlertTriangle size={16} /> Warnung: Keine gleich benannten Spalten gefunden. Bitte waehle die passenden Spalten bewusst aus.</div>}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
        {processing && <div className="progress"><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><span>{progress}% - Listen werden verglichen</span></div>}

        <div className="action-row">
          <button className="button secondary" onClick={reset} disabled={processing}><RotateCcw size={18} /> Zuruecksetzen</button>
          <button className="button primary process-button inline" onClick={runComparison} disabled={processing || !oldMeta || !newMeta}>
            {processing ? <LoaderCircle className="spin" size={18} /> : <GitCompareArrows size={18} />}
            {result ? "Vergleich erneut ausfuehren" : "Listen vergleichen"}
          </button>
        </div>
      </section>

      {result && (
        <section className="result-section">
          <div className="result-summary">
            <div><span className="eyebrow">Vergleich Ergebnis</span><h2>{result.newOnlyRowCount} neue Datensaetze gefunden</h2></div>
            <div className="button-row">
              <button className="button secondary" onClick={() => downloadBase64(result.downloadBase64, result.fileName)}><Download size={17} /> Ergebnis-Excel</button>
              <button className="button secondary" onClick={() => downloadBase64(result.oldMarkedDownloadBase64, result.oldMarkedFileName)}><Download size={17} /> Alte Liste rot markiert</button>
            </div>
          </div>

          <div className="summary-grid scraper-summary">
            <div><span>Alte Liste</span><strong>{result.oldRowCount}</strong></div>
            <div><span>Neue Liste</span><strong>{result.newRowCount}</strong></div>
            <div><span>Schon vorhanden</span><strong>{result.existingRowCount}</strong></div>
            <div><span>Wirklich neu</span><strong>{result.newOnlyRowCount}</strong></div>
          </div>

          <div className="operation-list">
            <span><Check size={15} /> Verglichen ueber: {result.compareColumns.join(", ")}</span>
            <span>Wenn du weitere Spaltenpaare hinzufuegst, klicke oben auf „Vergleich erneut ausfuehren“.</span>
          </div>

          <section className="workspace-card verification-card">
            <div className="section-heading compact">
              <div><span className="eyebrow">Manuelle Kontrolle</span><h2>Intelligente Suche in beiden Listen</h2></div>
              <p>Suche nach Firmen, Domains, E-Mails, Namen oder Teilbegriffen. Beide Listen werden gleichzeitig gefiltert.</p>
            </div>
            <div className="search-controls">
              <div className="search-input-wrap"><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="z. B. firmenname, domain, email oder 3 Buchstaben" /></div>
              <select value={searchField} onChange={(event) => setSearchField(event.target.value)}>
                <option value="__all__">Alle Felder durchsuchen</option>
                {result.columns.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </div>
            <div className="preview-grid">
              <SearchTable title="Alte Liste" rows={oldSearchRows} columns={searchColumns} />
              <SearchTable title="Neue Liste" rows={newSearchRows} columns={searchColumns} />
            </div>
          </section>

          <div className="preview-grid">
            <DataPreview title="Aktuell neue Datensaetze" rows={result.newOnlyRows.slice(0, 8)} columns={result.informativeColumns} />
            <DataPreview title="Schon vorhanden" rows={result.existingRows.slice(0, 8)} columns={result.informativeColumns} />
          </div>
        </section>
      )}
    </>
  );
}
