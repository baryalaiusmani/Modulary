"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Clipboard, Download, FileSpreadsheet, Globe, LoaderCircle, MailSearch, RotateCcw, ShieldCheck, UploadCloud } from "lucide-react";
import type { DomainCheckResult, EmailFinderResult } from "@/features/email-finder/types";
import { DataPreview } from "@/features/excel/components/data-preview";
import { EmailValidatorWorkspace } from "@/features/email-finder/components/email-validator-workspace";

export function EmailFinderWorkspace() {
  const [mode, setMode] = useState<"excel" | "domain" | "validate">("excel");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EmailFinderResult | null>(null);
  const [domain, setDomain] = useState("");
  const [domainResult, setDomainResult] = useState<DomainCheckResult | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => {
      setProgress((value) => value < 92 ? value + Math.max(1, Math.round((94 - value) / 18)) : value);
    }, 900);
    return () => window.clearInterval(timer);
  }, [processing]);

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

  function reset() {
    setFile(null);
    setResult(null);
    setDomain("");
    setDomainResult(null);
    setError("");
    setProcessing(false);
    setProgress(0);
    setCopied("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    if (!file) {
      setError("Bitte laden Sie zuerst eine Datei hoch.");
      return;
    }

    setProcessing(true);
    setProgress(8);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/features/email-finder/process", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProgress(100);
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die E-Mail-Suche ist fehlgeschlagen.");
    } finally {
      setProcessing(false);
    }
  }

  async function runDomainCheck() {
    if (!domain.trim()) {
      setError("Bitte geben Sie eine Domain ein.");
      return;
    }

    setProcessing(true);
    setProgress(10);
    setError("");
    setCopied("");
    setDomainResult(null);

    try {
      const response = await fetch("/api/features/email-finder/domain-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setProgress(100);
      setDomainResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Domain Check ist fehlgeschlagen.");
    } finally {
      setProcessing(false);
    }
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  function download(base64: string, fileName: string) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const previewColumns = result?.preview[0] ? Object.keys(result.preview[0]) : [];

  return (
    <>
      <section className="workspace-card">
        <div className="mode-switch">
          <button className={mode === "excel" ? "active" : ""} onClick={() => { setMode("excel"); setError(""); }}>
            <FileSpreadsheet size={17} /> Excel-Liste
          </button>
          <button className={mode === "domain" ? "active" : ""} onClick={() => { setMode("domain"); setError(""); }}>
            <Globe size={17} /> Domain Check
          </button>
          <button className={mode === "validate" ? "active" : ""} onClick={() => { setMode("validate"); setError(""); }}>
            <ShieldCheck size={17} /> E-Mail prüfen
          </button>
        </div>

        {mode === "validate" && <EmailValidatorWorkspace />}

        {mode === "excel" && (
          <div
            className={`upload-zone single ${file ? "has-file" : ""}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event: DragEvent) => event.preventDefault()}
            onDrop={(event: DragEvent) => { event.preventDefault(); acceptFile(event.dataTransfer.files[0]); }}
          >
            <input ref={fileInput} type="file" accept=".xlsx,.csv" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0])} />
            <div className="upload-icon">{file ? <FileSpreadsheet size={25} /> : <UploadCloud size={25} />}</div>
            {file ? <><strong>{file.name}</strong><span>Domain-/Website-Spalte wird automatisch erkannt oder ergaenzt</span></> : <><strong>Excel- oder CSV-Datei hochladen</strong><span>Das Tool sucht Domains und E-Mails fuer Zeilen ohne vorhandene E-Mail-Adresse</span></>}
          </div>
        )}

        {mode === "domain" && (
          <div className="domain-check-box">
            <label htmlFor="domain-check"><Globe size={16} /> Domain eingeben</label>
            <div className="scraper-url-row">
              <input id="domain-check" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="z. B. example.com oder https://www.example.com" />
              <button className="button primary" onClick={runDomainCheck} disabled={processing}>
                {processing ? <LoaderCircle className="spin" size={18} /> : <MailSearch size={18} />}
                Domain scannen
              </button>
            </div>
          </div>
        )}

        {mode !== "validate" && (
          <div className="info-box">
            <strong>Hinweis zur Suche</strong>
            <p>Fehlt eine Domain, wird zuerst nach einer passenden Unternehmensdomain gesucht. Danach werden Startseite, Kontakt, Impressum, Footer- und interne Kontaktlinks nach oeffentlich sichtbaren E-Mails durchsucht.</p>
          </div>
        )}

        {mode !== "validate" && error && <div className="error-message">{error}</div>}
        {mode !== "validate" && processing && (
          <div className="progress">
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <span>{progress}% - Webseiten werden durchsucht. Je nach Anzahl der fehlenden E-Mails kann das einige Minuten dauern.</span>
          </div>
        )}

        {mode !== "validate" && (
          <div className="action-row">
            <button className="button secondary" onClick={reset} disabled={processing}><RotateCcw size={18} /> Zuruecksetzen</button>
            {mode === "excel" && <button className="button primary process-button inline" onClick={submit} disabled={processing}>
              {processing ? <LoaderCircle className="spin" size={18} /> : <MailSearch size={18} />}
              {processing ? "Suche laeuft" : "E-Mails suchen"}
            </button>}
          </div>
        )}
      </section>

      {domainResult && mode === "domain" && (
        <section className="result-section">
          <div className="result-summary">
            <div>
              <span className="eyebrow">Domain Check Ergebnis</span>
              <h2>{domainResult.foundEmails} E-Mail-Adressen gefunden</h2>
            </div>
            <button className="button secondary" onClick={() => copyText(domainResult.contacts.map((contact) => contact.email).join("; "), "alle")}>
              <Clipboard size={17} /> Alle kopieren
            </button>
          </div>

          {copied && <div className="success-message">Kopiert: {copied === "alle" ? "alle E-Mail-Adressen" : copied}</div>}

          <div className="preview-card scraper-table-card">
            <div className="preview-header"><h3>{domainResult.domain}</h3><span>{domainResult.contacts.length} Treffer</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>E-Mail</th><th>Ansprechpartner</th><th>Jobbezeichnung</th><th>Sicherheit</th><th>Quelle</th><th>Aktion</th></tr></thead>
                <tbody>
                  {domainResult.contacts.length === 0 && <tr><td colSpan={6}>Keine oeffentliche E-Mail-Adresse gefunden.</td></tr>}
                  {domainResult.contacts.map((contact) => (
                    <tr key={`${contact.email}-${contact.quelle}`}>
                      <td>{contact.email}</td>
                      <td>{contact.ansprechpartner || "-"}</td>
                      <td>{contact.jobbezeichnung || "-"}</td>
                      <td>
                        {typeof contact.confidenceScore === "number" ? `${contact.confidenceScore}%` : "-"}
                        {contact.isVerified && <span className="tag-badge verified" title="Domain hat gueltige MX-Records"> · MX</span>}
                        {contact.isGenerated && <span className="tag-badge guessed" title="Aus Muster generiert, nicht bestaetigt"> · geraten</span>}
                      </td>
                      <td><a className="table-link" href={contact.quelle} target="_blank" rel="noreferrer">{contact.quelle}</a></td>
                      <td><button className="button secondary small-button" onClick={() => copyText(contact.email, contact.email)}><Clipboard size={14} /> Kopieren</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {result && mode === "excel" && (
        <section className="result-section">
          <div className="result-summary">
            <div>
              <span className="eyebrow">E-Mail Suche Ergebnis</span>
              <h2>{result.foundCompanies} Unternehmen mit E-Mail-Treffern</h2>
            </div>
            <div className="button-row">
              <button className="button secondary" onClick={() => download(result.foundDownloadBase64, result.foundFileName)}><Download size={17} /> Ergebnisliste</button>
              <button className="button secondary" onClick={() => download(result.updatedDownloadBase64, result.updatedFileName)}><Download size={17} /> Aktualisierte Ursprungsliste</button>
            </div>
          </div>

          <div className="summary-grid scraper-summary">
            <div><span>Datensaetze</span><strong>{result.totalRows}</strong></div>
            <div><span>Ohne E-Mail geprueft</span><strong>{result.rowsChecked}</strong></div>
            <div><span>Unternehmen mit Treffer</span><strong>{result.foundCompanies}</strong></div>
            <div><span>Gefundene E-Mails</span><strong>{result.foundEmails}</strong></div>
          </div>

          <div className="operation-list">
            <span>Domain-Spalte: {result.domainColumn}</span>
            <span>E-Mail-Spalte: {result.emailColumn}</span>
            <span>Firma-Spalte: {result.companyColumn}</span>
          </div>

          <DataPreview title="Gefundene E-Mails" rows={result.preview} columns={previewColumns} />
        </section>
      )}
    </>
  );
}
