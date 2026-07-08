"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet,
  LoaderCircle, Mail, ShieldCheck, UploadCloud, XCircle,
} from "lucide-react";
import type { BulkResult, EmailValidationResult } from "@/features/email-finder/validator";

type Verdict = EmailValidationResult["verdict_simple"];

function VerdictBadge({ verdict, status }: { verdict: Verdict; status: string }) {
  const map: Record<Verdict, { icon: typeof CheckCircle2; label: string; cls: string }> = {
    "gültig": { icon: CheckCircle2, label: "Gültig", cls: "valid" },
    "ungültig": { icon: XCircle, label: "Ungültig", cls: "invalid" },
    "manuell_prüfen": { icon: AlertTriangle, label: "Manuell prüfen", cls: "risky" },
  };
  const { icon: Icon, label, cls } = map[verdict];
  return (
    <div className={`verdict-badge ${cls}`}>
      <Icon size={22} />
      <div>
        <strong>{label}</strong>
        <span>{status}</span>
      </div>
    </div>
  );
}

function boolLabel(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "unbekannt";
  return value ? "ja" : "nein";
}

export function EmailValidatorWorkspace() {
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [single, setSingle] = useState<EmailValidationResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [smtpBulk, setSmtpBulk] = useState(false);
  const [bulk, setBulk] = useState<BulkResult | null>(null);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function runSingle() {
    if (!email.trim()) { setError("Bitte eine E-Mail-Adresse eingeben."); return; }
    setProcessing(true); setError(""); setSingle(null);
    try {
      const response = await fetch("/api/features/email-validator/validate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSingle(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Validierung fehlgeschlagen.");
    } finally { setProcessing(false); }
  }

  function acceptFile(next: File | undefined) {
    if (!next) return;
    if (!/\.(xlsx|xls|csv|txt)$/i.test(next.name)) { setError("Bitte .xlsx, .csv oder .txt auswählen."); return; }
    setFile(next); setBulk(null); setError("");
  }

  async function runBulk() {
    if (!file) { setError("Bitte zuerst eine Datei hochladen."); return; }
    setProcessing(true); setError(""); setBulk(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("smtp", String(smtpBulk));
    try {
      const response = await fetch("/api/features/email-validator/bulk", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBulk(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bulk-Validierung fehlgeschlagen.");
    } finally { setProcessing(false); }
  }

  function download(base64: string, fileName: string) {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = fileName; anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mode-switch inner">
        <button className={tab === "single" ? "active" : ""} onClick={() => { setTab("single"); setError(""); }}>
          <Mail size={16} /> Einzelne E-Mail
        </button>
        <button className={tab === "bulk" ? "active" : ""} onClick={() => { setTab("bulk"); setError(""); }}>
          <FileSpreadsheet size={16} /> Liste (Excel/CSV/TXT)
        </button>
      </div>

      {tab === "single" && (
        <div className="domain-check-box">
          <label htmlFor="validate-email"><ShieldCheck size={16} /> E-Mail-Adresse prüfen</label>
          <div className="scraper-url-row">
            <input id="validate-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="z. B. name@firma.de" />
            <button className="button primary" onClick={runSingle} disabled={processing}>
              {processing ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} Prüfen
            </button>
          </div>
        </div>
      )}

      {tab === "bulk" && (
        <>
          <div className={`upload-zone single ${file ? "has-file" : ""}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={(e: DragEvent) => { e.preventDefault(); acceptFile(e.dataTransfer.files[0]); }}>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => acceptFile(e.target.files?.[0])} />
            <div className="upload-icon">{file ? <FileSpreadsheet size={25} /> : <UploadCloud size={25} />}</div>
            {file ? <><strong>{file.name}</strong><span>E-Mail-Spalte wird automatisch erkannt</span></>
              : <><strong>Excel-, CSV- oder TXT-Datei hochladen</strong><span>Alle Original-Spalten bleiben erhalten</span></>}
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={smtpBulk} onChange={(e) => setSmtpBulk(e.target.checked)} />
            SMTP-Prüfung aktivieren (langsam, oft durch Port-25-Sperre blockiert)
          </label>
        </>
      )}

      <div className="info-box">
        <strong>Wie sicher ist das Ergebnis?</strong>
        <p>Es wird keine echte E-Mail versendet. Catch-all, Greylisting, Timeouts oder blockierte SMTP-Ports werden ehrlich als „riskant“ bzw. „unbekannt“ (manuell prüfen) ausgegeben – niemals als sicher gültig.</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {processing && <div className="progress"><span>Prüfung läuft … (DNS, MX{tab === "single" || smtpBulk ? ", SMTP" : ""}, Domain-Signale)</span></div>}

      {tab === "single" && (
        <div className="action-row">
          <button className="button primary process-button inline" onClick={runSingle} disabled={processing}>
            {processing ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />} {processing ? "Prüfe" : "Adresse prüfen"}
          </button>
        </div>
      )}
      {tab === "bulk" && (
        <div className="action-row">
          <button className="button primary process-button inline" onClick={runBulk} disabled={processing}>
            {processing ? <LoaderCircle className="spin" size={18} /> : <FileSpreadsheet size={18} />} {processing ? "Prüfe Liste" : "Liste validieren"}
          </button>
        </div>
      )}

      {single && tab === "single" && (
        <section className="result-section">
          <VerdictBadge verdict={single.verdict_simple} status={single.detail_status} />
          {single.did_you_mean && (
            <div className="info-box"><strong>Meinten Sie</strong><p>{single.did_you_mean}?</p></div>
          )}
          <div className="summary-grid scraper-summary">
            <div><span>Confidence</span><strong>{single.confidence_score}%</strong></div>
            <div><span>Endstatus</span><strong>{single.final_status}</strong></div>
            <div><span>SMTP</span><strong>{single.smtp_check}</strong></div>
            <div><span>Provider</span><strong>{single.smtp_provider || "-"}</strong></div>
          </div>
          <div className="preview-card">
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Normalisiert</td><td>{single.normalized_email}</td></tr>
                  <tr><td>Syntax OK</td><td>{boolLabel(single.syntax_ok)} {single.syntax_ok ? "" : `(${single.syntax_reason})`}</td></tr>
                  <tr><td>Gibberish local-part</td><td>{boolLabel(single.gibberish_localpart)}</td></tr>
                  <tr><td>Domain existiert</td><td>{boolLabel(single.domain_exists)}</td></tr>
                  <tr><td>MX gefunden</td><td>{boolLabel(single.mx_found)} {single.mx_record ? `(${single.mx_record})` : ""}</td></tr>
                  <tr><td>A-Record-Fallback</td><td>{boolLabel(single.a_record_fallback)}</td></tr>
                  <tr><td>SMTP erreichbar</td><td>{boolLabel(single.smtp_server_reachable)}</td></tr>
                  <tr><td>Mailbox existiert</td><td>{boolLabel(single.mailbox_exists)}</td></tr>
                  <tr><td>Catch-all</td><td>{boolLabel(single.catch_all)}</td></tr>
                  <tr><td>Postfach voll</td><td>{boolLabel(single.mailbox_full)}</td></tr>
                  <tr><td>Disposable</td><td>{boolLabel(single.disposable)}</td></tr>
                  <tr><td>Free / Webmail</td><td>{boolLabel(single.free_or_webmail)}</td></tr>
                  <tr><td>Role-based</td><td>{boolLabel(single.role_based)}</td></tr>
                  <tr><td>High-Risk-Domain</td><td>{boolLabel(single.high_risk_domain)}</td></tr>
                  <tr><td>TLD-Risiko</td><td>{boolLabel(single.tld_risk)}</td></tr>
                  <tr><td>Neue Domain (immature)</td><td>{boolLabel(single.immature_domain)}</td></tr>
                  <tr><td>SPF / DKIM / DMARC</td><td>{boolLabel(single.spf_present)} / {boolLabel(single.dkim_present)} / {boolLabel(single.dmarc_present)}</td></tr>
                  <tr><td>Website erreichbar</td><td>{boolLabel(single.website_exists)}</td></tr>
                  <tr><td>Registrant</td><td>{single.registrant_company || "unbekannt"}</td></tr>
                  <tr><td>Öffentliche Quellen</td><td>{single.public_sources_count}</td></tr>
                  <tr><td>Reason-Codes</td><td>{single.reason_codes.join(", ") || "-"}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {bulk && tab === "bulk" && (
        <section className="result-section">
          <div className="result-summary">
            <div>
              <span className="eyebrow">Bulk-Validierung</span>
              <h2>{bulk.totalRows} Zeilen geprüft</h2>
              <p className="operation-list"><span>Erkannte E-Mail-Spalte: {bulk.emailColumn}</span></p>
            </div>
            <button className="button primary" onClick={() => download(bulk.downloadBase64, bulk.fileName)}>
              <Download size={17} /> Ergebnisdatei
            </button>
          </div>
          <div className="summary-grid scraper-summary">
            <div><span>Gültig</span><strong>{bulk.summary.gültig} ({bulk.summary.percent.gültig}%)</strong></div>
            <div><span>Ungültig</span><strong>{bulk.summary.ungültig} ({bulk.summary.percent.ungültig}%)</strong></div>
            <div><span>Riskant</span><strong>{bulk.summary.riskant} ({bulk.summary.percent.riskant}%)</strong></div>
            <div><span>Unbekannt</span><strong>{bulk.summary.unbekannt} ({bulk.summary.percent.unbekannt}%)</strong></div>
            <div><span>Catch-all</span><strong>{bulk.summary.catch_all}</strong></div>
            <div><span>Disposable</span><strong>{bulk.summary.disposable}</strong></div>
            <div><span>Role-based</span><strong>{bulk.summary.role_based}</strong></div>
            <div><span>Duplikate</span><strong>{bulk.summary.duplicate}</strong></div>
            <div><span>Ohne E-Mail</span><strong>{bulk.summary.rows_without_email}</strong></div>
          </div>
          <div className="preview-card">
            <div className="preview-header"><h3>Vorschau (erste {bulk.preview.length})</h3><span>{bulk.emailColumn}</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>E-Mail</th><th>Verdict</th><th>Status</th><th>Confidence</th><th>Reason-Codes</th></tr></thead>
                <tbody>
                  {bulk.preview.map((row, index) => (
                    <tr key={index}>
                      <td>{String(row[bulk.emailColumn] ?? "")}</td>
                      <td>{String(row.verdict_simple ?? "")}</td>
                      <td>{String(row.final_status ?? "")}</td>
                      <td>{String(row.confidence_score ?? "")}%</td>
                      <td>{String(row.reason_codes ?? "")}</td>
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
