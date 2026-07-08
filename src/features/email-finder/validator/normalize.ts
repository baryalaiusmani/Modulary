// Reine, testbare Funktionen: Normalisierung, Syntaxpruefung, Tippfehler-
// Vorschlaege, Gibberish-Erkennung und Adress-Klassifizierung. Kein Netzwerk.

import {
  COMMON_DOMAINS, DISPOSABLE_DOMAINS, FREE_WEBMAIL_DOMAINS,
  LONG_TERM_DISPOSABLE_DOMAINS, RISKY_TLDS, ROLE_LOCALPARTS,
} from "./data";

export type Normalized = { original: string; normalized: string; local: string; domain: string };

/** Trimmt und normalisiert Gross-/Kleinschreibung (Domain immer klein). */
export function normalizeEmail(raw: string): Normalized {
  const original = String(raw ?? "");
  const trimmed = original.trim().replace(/^mailto:/i, "");
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) {
    return { original, normalized: trimmed.toLowerCase(), local: "", domain: "" };
  }
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  // Localpart-Case bleibt technisch relevant; wir behalten ihn, kleinschreiben
  // nur die Domain. Fuer den Vergleich wird zusaetzlich klein verwendet.
  return { original, normalized: `${local}@${domain}`, local, domain };
}

export type SyntaxResult = { ok: boolean; reason: string; invalidTld: boolean };

const LOCAL_ALLOWED = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

/** Formale Syntaxpruefung (praktische Teilmenge von RFC 5322). */
export function checkSyntax(normalized: Normalized): SyntaxResult {
  const value = normalized.normalized;
  if (!value) return { ok: false, reason: "leer", invalidTld: false };
  const atCount = (value.match(/@/g) ?? []).length;
  if (atCount !== 1) return { ok: false, reason: "nicht genau ein @", invalidTld: false };

  const { local, domain } = normalized;
  if (!local) return { ok: false, reason: "local-part fehlt", invalidTld: false };
  if (local.length > 64) return { ok: false, reason: "local-part zu lang (>64)", invalidTld: false };
  if (!LOCAL_ALLOWED.test(local)) return { ok: false, reason: "ungueltige Zeichen im local-part", invalidTld: false };
  if (local.startsWith(".") || local.endsWith(".")) return { ok: false, reason: "local-part beginnt/endet mit Punkt", invalidTld: false };
  if (local.includes("..")) return { ok: false, reason: "doppelter Punkt im local-part", invalidTld: false };

  if (!domain) return { ok: false, reason: "Domain fehlt", invalidTld: false };
  if (domain.length > 253) return { ok: false, reason: "Domain zu lang", invalidTld: false };
  const labels = domain.split(".");
  if (labels.length < 2) return { ok: false, reason: "Domain ohne TLD", invalidTld: true };
  for (const label of labels) {
    if (!label) return { ok: false, reason: "leeres Domain-Label", invalidTld: false };
    if (label.length > 63) return { ok: false, reason: "Domain-Label zu lang", invalidTld: false };
    if (!/^[a-z0-9-]+$/i.test(label)) return { ok: false, reason: "ungueltige Zeichen in Domain", invalidTld: false };
    if (label.startsWith("-") || label.endsWith("-")) return { ok: false, reason: "Domain-Label beginnt/endet mit Bindestrich", invalidTld: false };
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/i.test(tld)) return { ok: false, reason: "ungueltige TLD", invalidTld: true };

  return { ok: true, reason: "ok", invalidTld: false };
}

/** Levenshtein-Distanz (fuer Tippfehler-Erkennung). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Schlaegt eine korrigierte Adresse vor, wenn die Domain wie ein Tippfehler aussieht. */
export function suggestCorrection(normalized: Normalized): string | null {
  const { local, domain } = normalized;
  if (!local || !domain) return null;
  if (COMMON_DOMAINS.includes(domain)) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
    const distance = levenshtein(domain, candidate);
    if (distance > 0 && distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best ? `${local}@${best.domain}` : null;
}

/** Heuristische Gibberish-Erkennung fuer den local-part. */
export function isGibberish(local: string): boolean {
  const core = local.toLowerCase().replace(/[._+-]/g, "");
  if (core.length < 5) return false; // zu kurz fuer eine sichere Aussage
  const letters = core.replace(/[^a-z]/g, "");
  const digits = core.replace(/[^0-9]/g, "");

  // Sehr hoher Zahlenanteil in langen Localparts.
  if (core.length >= 8 && digits.length / core.length > 0.6) return true;

  if (letters.length >= 5) {
    const vowels = (letters.match(/[aeiou]/g) ?? []).length;
    const vowelRatio = vowels / letters.length;
    const longestConsonantRun = (letters.match(/[bcdfghjklmnpqrstvwxyz]{5,}/g) ?? [])[0]?.length ?? 0;
    // Kaum Vokale oder sehr lange Konsonantenkette -> wirkt zufaellig.
    if (vowelRatio < 0.2) return true;
    if (longestConsonantRun >= 6) return true;
    // Hohe Zeichenvielfalt bei gleichzeitig langer, vokalarmer Zeichenkette.
    const uniqueRatio = new Set(letters).size / letters.length;
    if (letters.length >= 12 && uniqueRatio > 0.8 && vowelRatio < 0.3) return true;
  }
  return false;
}

export type Classification = {
  disposable: boolean;
  long_term_disposable: boolean;
  free_or_webmail: boolean;
  role_based: boolean;
  tld_risk: boolean;
  high_risk_domain: boolean;
  subdomain_mailer_risk: boolean;
};

/** Klassifiziert Adresse anhand statischer Listen/Heuristiken. */
export function classify(normalized: Normalized): Classification {
  const { local, domain } = normalized;
  const labels = domain.split(".");
  const tld = labels[labels.length - 1] ?? "";
  const registrable = labels.slice(-2).join(".");
  const localLower = local.toLowerCase();

  const disposable = DISPOSABLE_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(registrable);
  const long_term_disposable = LONG_TERM_DISPOSABLE_DOMAINS.has(domain) || LONG_TERM_DISPOSABLE_DOMAINS.has(registrable);
  const free_or_webmail = FREE_WEBMAIL_DOMAINS.has(domain) || FREE_WEBMAIL_DOMAINS.has(registrable);
  const role_based = ROLE_LOCALPARTS.has(localLower);
  const tld_risk = RISKY_TLDS.has(tld);
  // Subdomain-Mailer: Mail an eine tiefere Subdomain (mehr als 2 Labels und
  // kein Free/Corporate-Standard) kann auf Bulk-Mailer hindeuten.
  const subdomain_mailer_risk = labels.length > 2 && !free_or_webmail && !disposable;
  const high_risk_domain = disposable || tld_risk;

  return {
    disposable, long_term_disposable, free_or_webmail, role_based,
    tld_risk, high_risk_domain, subdomain_mailer_risk,
  };
}
