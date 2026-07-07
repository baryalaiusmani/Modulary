"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, Globe, LoaderCircle, RotateCcw, UploadCloud } from "lucide-react";
import type { DomainFormatMode, DomainFormatResult } from "@/features/domain-formatter/types";
import { DataPreview } from "@/features/excel/components/data-preview";

const formatOptions: Array<{ mode: DomainFormatMode; title: string; example: string; description: string }> = [
  {
    mode: "https-www",
    title: "Mit https und www",
    example: "https://www.example.com",
    description: "Ergaenzt https:// und www. Pfade bleiben erhalten.",
  },
  {
    mode: "www",
    title: "Ohne https, mit www",
    example: "www.example.com",
    description: "Entfernt Protokolle und sorgt fuer www.",
  },
  {
    mode: "plain",
    title: "Reine Domain",
    example: "example.com",
    description: "Entfernt Protokolle und www.",
  },
];

export function DomainFormatterWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<DomainFormatMode>("https-www");
  const [result, setResult] = useState<DomainFormatResult | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function acceptFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!/\.(xlsx|csv)$/i.test(nextFile.name)) {
      setError("Bitte waehlen Sie eine .xlsx- oder .csv-Datei aus.");
      return;
    }
    setFile(nextFile);
    setResult(null);
    setError("");
  }

  async function submit() {
    if (!file) {
      setError("Bitte laden Sie zuerst eine Excel- oder CSV-Datei hoch.");
      return;
    }

    setProcessing(true);
    setResult(null);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);

    try {
      const response = await fetch("/api/features/domain-formatter/process", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Domains konnten nicht formatiert werden.");
    } finally {
      setProcessing(false);
    }
  }

  function download() {
    if (!result) return;
    const bytes = Uint8Array.from(atob(result.downloadBase64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setFile(null);
    setMode("https-www");
    setResult(null);
    setError("");
    setProcessing(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const columns = result ? Object.keys(result.before[0] ?? result.after[0] ?? {}) : [];

  return (
    <>
      <section className="workspace-card">
        <div
          className={`upload-zone single ${file ? "has-file" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => { event.preventDefault(); acceptFile(event.dataTransfer.files[0]); }}
        >
          <input ref={fileInput} type="file" accept=".xlsx,.csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0])} />
          <div className="upload-icon">{file ? <FileSpreadsheet size={25} /> : <UploadCloud size={25} />}</div>
          {file ? <><strong>{file.name}</strong><span>Nur die Domain-Spalte wird veraendert</span></> : <><strong>Excel- oder CSV-Datei hochladen</strong><span>Spalte sollte Domain, Website oder URL heissen</span></>}
        </div>

        <div className="format-options">
          {formatOptions.map((option) => (
            <button
              key={option.mode}
              className={`format-option ${mode === option.mode ? "active" : ""}`}
              onClick={() => setMode(option.mode)}
              type="button"
            >
              <span><Globe size={17} /> {option.title}</span>
              <strong>{option.example}</strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="action-row">
          <button className="button secondary" onClick={reset} disabled={processing}>
            <RotateCcw size={18} /> Zuruecksetzen
          </button>
          <button className="button primary process-button inline" onClick={submit} disabled={processing}>
            {processing ? <LoaderCircle className="spin" size={18} /> : <Globe size={18} />}
            {processing ? "Domains werden formatiert" : "Domains formatieren"}
          </button>
        </div>
      </section>

      {result && (
        <section className="result-section">
          <div className="result-summary">
            <div><span className="eyebrow">Ergebnis</span><h2>Domain-Spalte formatiert</h2></div>
            <button className="button secondary" onClick={download}><Download size={17} /> Excel herunterladen</button>
          </div>

          <div className="operation-list">
            <span><Check size={15} /> Spalte: {result.domainColumn}</span>
            <span>{result.changedRows} Domains geaendert</span>
            <span>{result.unchangedRows} bereits passend</span>
            <span>{result.emptyRows} leere Zellen</span>
          </div>

          <div className="preview-grid">
            <DataPreview title="Vorher" rows={result.before} columns={columns} />
            <DataPreview title="Nachher" rows={result.after} columns={columns} />
          </div>
        </section>
      )}
    </>
  );
}
