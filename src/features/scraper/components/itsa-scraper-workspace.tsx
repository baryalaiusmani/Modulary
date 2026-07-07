"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Check, Download, LoaderCircle, Save, Search, Sparkles } from "lucide-react";
import type { ItsaSaveResult, ItsaScanJobStatus, ItsaScanResult } from "@/features/scraper/types";

const defaultUrl = "https://www.itsa365.de/de-de/companies/companies-finden?state%5BrefinementList%5D%5BisExhibitor%5D%5B0%5D=Ja";

export function ItsaScraperWorkspace() {
  const [url, setUrl] = useState(defaultUrl);
  const [result, setResult] = useState<ItsaScanResult | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"new" | "all" | null>(null);
  const [visibleBrowser, setVisibleBrowser] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [totalFound, setTotalFound] = useState(0);
  const [processedProfiles, setProcessedProfiles] = useState(0);
  const [saveResult, setSaveResult] = useState<ItsaSaveResult | null>(null);

  useEffect(() => {
    if (!scanning) return;
    const timer = window.setInterval(() => {
      setProgress((value) => value < 95 ? value + 1 : value);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [scanning]);

  function applyJobStatus(job: ItsaScanJobStatus) {
    setProgress(job.progress);
    setScanMessage(job.message);
    setTotalFound(job.totalFound);
    setProcessedProfiles(job.processedProfiles);
  }

  async function scan() {
    if (!url.trim()) {
      setError("Bitte geben Sie eine it-sa-URL ein.");
      return;
    }

    setScanning(true);
    setProgress(7);
    setScanMessage("Scan wird vorbereitet.");
    setTotalFound(0);
    setProcessedProfiles(0);
    setResult(null);
    setSaveResult(null);
    setError("");

    try {
      const startResponse = await fetch("/api/features/scraper/itsa/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, visibleBrowser }),
      });
      const started: ItsaScanJobStatus = await startResponse.json();
      if (!startResponse.ok) throw new Error(started.error);
      applyJobStatus(started);

      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const statusResponse = await fetch(`/api/features/scraper/itsa/scan?jobId=${started.jobId}`);
        const status: ItsaScanJobStatus = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error);
        applyJobStatus(status);

        if (status.status === "completed" && status.result) {
          setResult(status.result);
          setProgress(100);
          break;
        }

        if (status.status === "failed") {
          throw new Error(status.error || "Der Scan ist fehlgeschlagen.");
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Scan ist fehlgeschlagen.");
    } finally {
      setScanning(false);
    }
  }

  async function saveNewExhibitors() {
    if (!result?.newExhibitors.length) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/features/scraper/itsa/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exhibitors: result.newExhibitors }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSaveResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die neuen Aussteller konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  function handleUrlChange(event: ChangeEvent<HTMLInputElement>) {
    setUrl(event.target.value);
    setSaveResult(null);
  }

  async function downloadExcel(scope: "new" | "all") {
    if (!result) return;
    const exhibitors = scope === "new" ? result.newExhibitors : result.allExhibitors;
    if (!exhibitors.length) return;

    setExporting(scope);
    setError("");

    try {
      const response = await fetch("/api/features/scraper/itsa/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exhibitors, scope }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Die Excel-Datei konnte nicht erstellt werden.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `itsa2026_${scope}_aussteller.xlsx`;
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Excel-Download ist fehlgeschlagen.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <section className="workspace-card scraper-card">
        <div className="prompt-area first">
          <label htmlFor="itsa-url"><Sparkles size={16} /> it-sa URL scannen</label>
          <div className="scraper-url-row">
            <input
              id="itsa-url"
              value={url}
              onChange={handleUrlChange}
              placeholder="https://www.itsa365.de/de-de/companies/companies-finden..."
            />
            <button className="button primary" onClick={scan} disabled={scanning}>
              {scanning ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
              {scanning ? "Scan laeuft" : "Scannen"}
            </button>
          </div>
          <p className="helper-text">
            Der erste Scan kann einige Minuten dauern. Spaetere Scans pruefen zuerst die bekannten Profile
            und lesen Details nur fuer neue Aussteller aus.
          </p>
          <label className="checkbox-row">
            <input type="checkbox" checked={visibleBrowser} onChange={(event) => setVisibleBrowser(event.target.checked)} disabled={scanning} />
            Browser sichtbar oeffnen
          </label>
        </div>

        {error && <div className="error-message">{error}</div>}
        {scanning && (
          <div className="progress">
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <span>
              {progress}% - {scanMessage || "it-sa wird gescannt."}
              {totalFound > 0 && ` Gefunden: ${totalFound}.`}
              {processedProfiles > 0 && ` Profile gelesen: ${processedProfiles}.`}
            </span>
          </div>
        )}
      </section>

      {result && (
        <section className="result-section">
          <div className="result-summary">
            <div>
              <span className="eyebrow">Scan Ergebnis</span>
              <h2>{result.newCount} neue Aussteller gefunden</h2>
            </div>
            <div className="button-row">
              <button className="button secondary" onClick={() => downloadExcel("new")} disabled={exporting !== null || !result.newExhibitors.length}>
                {exporting === "new" ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                Neue als Excel
              </button>
              <button className="button secondary" onClick={() => downloadExcel("all")} disabled={exporting !== null || !result.allExhibitors.length}>
                {exporting === "all" ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                Alle als Excel
              </button>
              <button className="button primary" onClick={saveNewExhibitors} disabled={saving || !result.newExhibitors.length}>
                {saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
                Neue speichern
              </button>
            </div>
          </div>

          <div className="summary-grid scraper-summary">
            <div><span>Gefunden</span><strong>{result.totalFound}</strong></div>
            <div><span>Bisher bekannt</span><strong>{result.knownBefore}</strong></div>
            <div><span>Neu</span><strong>{result.newCount}</strong></div>
            <div><span>Nach Speicherung</span><strong>{saveResult?.totalKnown ?? result.updatedKnownCount}</strong></div>
          </div>

          {saveResult && (
            <div className="success-message">
              <Check size={16} /> {saveResult.savedCount} neue Aussteller gespeichert. Gesamt bekannt: {saveResult.totalKnown}.
            </div>
          )}

          <div className="preview-card scraper-table-card">
            <div className="preview-header">
              <h3>Neue Aussteller</h3>
              <span>{result.newExhibitors.length} Eintraege</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Unternehmensname</th>
                    <th>Domain</th>
                    <th>Ansprechpartner</th>
                    <th>E-Mail-Adresse</th>
                    <th>Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.newExhibitors.length === 0 && (
                    <tr><td colSpan={5}>Keine neuen Aussteller gefunden.</td></tr>
                  )}
                  {result.newExhibitors.map((exhibitor) => (
                    <tr key={exhibitor.profilUrl}>
                      <td>{exhibitor.unternehmensname}</td>
                      <td>{exhibitor.domain || "-"}</td>
                      <td>{exhibitor.ansprechpartner || "-"}</td>
                      <td>{exhibitor.email || "-"}</td>
                      <td><a className="table-link" href={exhibitor.profilUrl} target="_blank" rel="noreferrer">Profil</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
