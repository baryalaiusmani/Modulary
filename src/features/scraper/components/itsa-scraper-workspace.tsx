"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Building2, Check, Download, Filter, LoaderCircle, LogIn, RotateCcw, Save, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import type {
  ItsaAuthJobStatus,
  ItsaPerson,
  ItsaPersonScanJobStatus,
  ItsaPersonScanResult,
  ItsaSaveResult,
  ItsaScanJobStatus,
  ItsaScanResult,
} from "@/features/scraper/types";

const defaultUrl = "https://www.itsa365.de/de-de/companies/companies-finden?state%5BrefinementList%5D%5BisExhibitor%5D%5B0%5D=Ja";

type PersonFilterKey = "branche" | "land" | "unternehmensbereich" | "ziele" | "interessen" | "sprache" | "beruflicheStellung" | "teilnahme";

const personFilterDefinitions: Array<{ key: PersonFilterKey; label: string }> = [
  { key: "branche", label: "Branche" },
  { key: "land", label: "Land / Region" },
  { key: "unternehmensbereich", label: "Unternehmensbereich" },
  { key: "ziele", label: "Ziele" },
  { key: "interessen", label: "Interessen" },
  { key: "sprache", label: "Sprache" },
  { key: "beruflicheStellung", label: "Berufliche Stellung" },
  { key: "teilnahme", label: "Teilnahme" },
];

const emptyPersonFilters = (): Record<PersonFilterKey, string[]> => ({
  branche: [],
  land: [],
  unternehmensbereich: [],
  ziele: [],
  interessen: [],
  sprache: [],
  beruflicheStellung: [],
  teilnahme: [],
});

function splitFilterValues(value: string) {
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

export function ItsaScraperWorkspace() {
  const [scanType, setScanType] = useState<"exhibitors" | "persons">("exhibitors");
  const [url, setUrl] = useState(defaultUrl);
  const [result, setResult] = useState<ItsaScanResult | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"new" | "all" | "filtered" | null>(null);
  const [visibleBrowser, setVisibleBrowser] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [totalFound, setTotalFound] = useState(0);
  const [processedProfiles, setProcessedProfiles] = useState(0);
  const [saveResult, setSaveResult] = useState<ItsaSaveResult | null>(null);
  const [personResult, setPersonResult] = useState<ItsaPersonScanResult | null>(null);
  const [personLimit, setPersonLimit] = useState("");
  const [authBusy, setAuthBusy] = useState<"check" | "login" | null>(null);
  const [authStatus, setAuthStatus] = useState<boolean | null>(null);
  const [authMessage, setAuthMessage] = useState("Anmeldestatus wurde noch nicht geprueft.");
  const [personSearch, setPersonSearch] = useState("");
  const [personFilters, setPersonFilters] = useState<Record<PersonFilterKey, string[]>>(emptyPersonFilters);
  const [personSort, setPersonSort] = useState<"name-asc" | "name-desc" | "company-asc">("name-asc");

  const personFilterOptions = useMemo(() => {
    const options = {} as Record<PersonFilterKey, Array<{ value: string; count: number }>>;
    for (const definition of personFilterDefinitions) {
      const counts = new Map<string, number>();
      for (const person of personResult?.people || []) {
        for (const value of new Set(splitFilterValues(person[definition.key]))) {
          counts.set(value, (counts.get(value) || 0) + 1);
        }
      }
      options[definition.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "de"));
    }
    return options;
  }, [personResult]);

  const filteredPeople = useMemo(() => {
    const query = personSearch.trim().toLocaleLowerCase("de");
    const matches = (personResult?.people || []).filter((person) => {
      if (query && !Object.values(person).some((value) => value.toLocaleLowerCase("de").includes(query))) {
        return false;
      }
      return personFilterDefinitions.every(({ key }) => {
        const selected = personFilters[key];
        if (!selected.length) return true;
        const values = splitFilterValues(person[key]);
        return selected.some((selection) => values.includes(selection));
      });
    });
    return matches.sort((left, right) => {
      if (personSort === "name-desc") return right.name.localeCompare(left.name, "de");
      if (personSort === "company-asc") return left.firma.localeCompare(right.firma, "de");
      return left.name.localeCompare(right.name, "de");
    });
  }, [personFilters, personResult, personSearch, personSort]);

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

  async function scanPersons() {
    setScanning(true);
    setProgress(3);
    setScanMessage("Personen-Scan wird vorbereitet.");
    setTotalFound(0);
    setPersonResult(null);
    setError("");

    try {
      const parsedLimit = personLimit.trim() ? Number(personLimit) : undefined;
      if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 20000)) {
        throw new Error("Das Testlimit muss zwischen 1 und 20.000 liegen.");
      }
      const response = await fetch("/api/features/scraper/itsa/persons/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleBrowser, limit: parsedLimit }),
      });
      const started: ItsaPersonScanJobStatus = await response.json();
      if (!response.ok) throw new Error(started.error);
      setProgress(started.progress);
      setScanMessage(started.message);

      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        const statusResponse = await fetch(`/api/features/scraper/itsa/persons/scan?jobId=${started.jobId}`);
        const status: ItsaPersonScanJobStatus = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error);
        setProgress(status.progress);
        setScanMessage(status.message);
        setTotalFound(status.totalFound);
        if (status.status === "completed" && status.result) {
          setPersonResult(status.result);
          setPersonSearch("");
          setPersonFilters(emptyPersonFilters());
          break;
        }
        if (status.status === "failed") throw new Error(status.error || "Der Personen-Scan ist fehlgeschlagen.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Der Personen-Scan ist fehlgeschlagen.");
    } finally {
      setScanning(false);
    }
  }

  async function downloadPersons(people: ItsaPerson[], scope: "all" | "filtered") {
    if (!people.length) return;
    setExporting(scope);
    setError("");
    try {
      const response = await fetch("/api/features/scraper/itsa/persons/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people, scope }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Die Excel-Datei konnte nicht erstellt werden.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || "itsa365_personen.xlsx";
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

  function togglePersonFilter(key: PersonFilterKey, value: string) {
    setPersonFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  function resetPersonFilters() {
    setPersonSearch("");
    setPersonFilters(emptyPersonFilters());
    setPersonSort("name-asc");
  }

  async function runAuthAction(action: "check" | "login") {
    setAuthBusy(action);
    setError("");
    setAuthMessage(action === "login" ? "Login-Browser wird vorbereitet." : "Anmeldung wird geprueft.");
    try {
      const response = await fetch("/api/features/scraper/itsa/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const started: ItsaAuthJobStatus = await response.json();
      if (!response.ok) throw new Error(started.error);

      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        const statusResponse = await fetch(`/api/features/scraper/itsa/auth?jobId=${started.jobId}`);
        const status: ItsaAuthJobStatus = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error);
        setAuthMessage(status.message);
        if (status.status === "completed") {
          setAuthStatus(status.authenticated);
          break;
        }
        if (status.status === "failed") throw new Error(status.error || status.message);
      }
    } catch (reason) {
      setAuthStatus(false);
      setError(reason instanceof Error ? reason.message : "Die Anmeldung konnte nicht geprueft werden.");
    } finally {
      setAuthBusy(null);
    }
  }

  return (
    <>
      <section className="workspace-card scraper-card">
        <div className="button-row">
          <button className={`button ${scanType === "exhibitors" ? "primary" : "secondary"}`} onClick={() => setScanType("exhibitors")} disabled={scanning}>
            <Building2 size={18} /> Aussteller
          </button>
          <button className={`button ${scanType === "persons" ? "primary" : "secondary"}`} onClick={() => setScanType("persons")} disabled={scanning}>
            <Users size={18} /> Personen und Kontakte
          </button>
        </div>
      </section>

      {scanType === "exhibitors" && (
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
      )}

      {scanType === "persons" && (
        <>
          <section className="workspace-card scraper-card">
            <div className="prompt-area first">
              <label><ShieldCheck size={16} /> Gespeicherte it-sa-Anmeldung</label>
              <p className="helper-text">
                Die Anmeldung wird in einem lokalen Browserprofil gespeichert. Wenn it-sa die Sitzung ablaufen laesst,
                koennen Sie sie hier erneut anmelden.
              </p>
              <div className="button-row">
                <button className="button secondary" onClick={() => runAuthAction("check")} disabled={authBusy !== null || scanning}>
                  {authBusy === "check" ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
                  Anmeldung pruefen
                </button>
                <button className="button primary" onClick={() => runAuthAction("login")} disabled={authBusy !== null || scanning}>
                  {authBusy === "login" ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}
                  Login oeffnen und speichern
                </button>
              </div>
              <div className={authStatus === true ? "success-message" : authStatus === false ? "error-message" : "helper-text"}>
                {authStatus === true && <Check size={16} />} {authMessage}
              </div>
            </div>
          </section>

          <section className="workspace-card scraper-card">
            <div className="prompt-area first">
              <label><Users size={16} /> it-sa Personen scannen</label>
              <div className="scraper-url-row">
                <input value="https://www.itsa365.de/de-de/community/personen-finden" readOnly aria-label="Personen-URL" />
                <input
                  value={personLimit}
                  onChange={(event) => setPersonLimit(event.target.value.replace(/\D/g, ""))}
                  placeholder="Testlimit, z. B. 100"
                  aria-label="Testlimit"
                  style={{ maxWidth: 210 }}
                />
                <button className="button primary" onClick={scanPersons} disabled={scanning || authBusy !== null}>
                  {scanning ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
                  {scanning ? "Scan laeuft" : "Personen scannen"}
                </button>
              </div>
              <p className="helper-text">
                Beim ersten Scan den sichtbaren Browser verwenden und dort manuell anmelden. Die Sitzung wird lokal gespeichert
                und kann danach auch im Hintergrundmodus genutzt werden. Ohne Testlimit wird der komplette it-sa-Personenbestand geladen.
              </p>
              <label className="checkbox-row">
                <input type="checkbox" checked={visibleBrowser} onChange={(event) => setVisibleBrowser(event.target.checked)} disabled={scanning || authBusy !== null} />
                Browser sichtbar oeffnen (fuer die erste Anmeldung erforderlich)
              </label>
            </div>
            {error && <div className="error-message">{error}</div>}
            {scanning && (
              <div className="progress">
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <span>{progress}% - {scanMessage} {totalFound > 0 && `Gefunden: ${totalFound}.`}</span>
              </div>
            )}
          </section>

          {personResult && (
            <section className="result-section">
              <div className="result-summary">
                <div>
                  <span className="eyebrow">Personen-Scan Ergebnis</span>
                  <h2>{personResult.totalFound} von {personResult.availableTotal} Personen geladen</h2>
                </div>
                <div className="button-row">
                  <button className="button secondary" onClick={() => downloadPersons(filteredPeople, "filtered")} disabled={exporting !== null || !filteredPeople.length}>
                    {exporting === "filtered" ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                    Gefilterte Liste als Excel
                  </button>
                  <button className="button primary" onClick={() => downloadPersons(personResult.people, "all")} disabled={exporting !== null}>
                    {exporting === "all" ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                    Gesamtliste als Excel
                  </button>
                </div>
              </div>

              <div className="preview-card person-filter-card">
                <div className="preview-header">
                  <h3><Filter size={18} /> Personen suchen und filtern</h3>
                  <strong>{filteredPeople.length} Treffer</strong>
                </div>
                <div className="person-search-controls">
                  <div className="search-input-wrap">
                    <Search size={17} />
                    <input
                      value={personSearch}
                      onChange={(event) => setPersonSearch(event.target.value)}
                      placeholder="Name, Firma, Position, Land, Ziel oder Interesse suchen..."
                    />
                  </div>
                  <select value={personSort} onChange={(event) => setPersonSort(event.target.value as typeof personSort)} aria-label="Personen sortieren">
                    <option value="name-asc">Name A - Z</option>
                    <option value="name-desc">Name Z - A</option>
                    <option value="company-asc">Firma A - Z</option>
                  </select>
                  <button className="button secondary" onClick={resetPersonFilters}>
                    <RotateCcw size={16} /> Filter zuruecksetzen
                  </button>
                </div>
                <div className="person-filter-grid">
                  {personFilterDefinitions.map(({ key, label }) => (
                    <details key={key} className="person-filter-group">
                      <summary>
                        <span>{label}</span>
                        <strong>{personFilters[key].length || "Alle"}</strong>
                      </summary>
                      <div className="person-filter-options">
                        {(personFilterOptions[key] || []).map((option) => (
                          <label key={option.value} className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={personFilters[key].includes(option.value)}
                              onChange={() => togglePersonFilter(key, option.value)}
                            />
                            <span>{option.value}</span>
                            <small>{option.count}</small>
                          </label>
                        ))}
                        {(personFilterOptions[key] || []).length === 0 && <span className="helper-text">Keine Werte vorhanden.</span>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>

              <div className="preview-card scraper-table-card">
                <div className="preview-header"><h3>Gefilterte Personen</h3><span>{filteredPeople.length} Eintraege</span></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Berufsbezeichnung</th><th>Firma</th><th>Land</th><th>Branche</th><th>Unternehmensbereich</th><th>Berufliche Stellung</th><th>Sprache</th><th>Ziele</th><th>Interessen</th><th>Quelle</th></tr></thead>
                    <tbody>
                      {filteredPeople.length === 0 && <tr><td colSpan={11}>Keine Personen entsprechen den gewaehlten Filtern.</td></tr>}
                      {filteredPeople.slice(0, 100).map((person) => (
                        <tr key={person.profilUrl}>
                          <td>{person.name || "-"}</td>
                          <td>{person.berufsbezeichnung || "-"}</td>
                          <td>{person.firma || "-"}</td>
                          <td>{person.land || "-"}</td>
                          <td>{person.branche || "-"}</td>
                          <td>{person.unternehmensbereich || "-"}</td>
                          <td>{person.beruflicheStellung || "-"}</td>
                          <td>{person.sprache || "-"}</td>
                          <td>{person.ziele || "-"}</td>
                          <td>{person.interessen || "-"}</td>
                          <td><a className="table-link" href={person.profilUrl} target="_blank" rel="noreferrer">Profil</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredPeople.length > 100 && <p className="helper-text">Vorschau zeigt 100 Eintraege. Der gefilterte Excel-Download enthaelt alle {filteredPeople.length} Treffer.</p>}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
