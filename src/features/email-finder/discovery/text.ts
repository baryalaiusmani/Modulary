// Kleine, seiteneffektfreie Textwerkzeuge fuer die Discovery-Module.
// Bewusst ohne externe Abhaengigkeiten, damit die Funktionen leicht
// testbar bleiben.

export const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const IGNORED_LOCALPARTS = /^(example|test|noreply|no-reply|mailer-daemon|postmaster)$/i;
const ASSET_SUFFIX = /\.(png|jpg|jpeg|gif|svg|webp|css|js|ico)$/i;

/** Extrahiert E-Mail-Adressen aus reinem Text (kleingeschrieben, dedupliziert). */
export function extractEmailsFromText(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))]
    .filter((email) => !ASSET_SUFFIX.test(email))
    .filter((email) => !IGNORED_LOCALPARTS.test(email.split("@")[0] ?? ""));
}

/** Wandelt Umlaute/Sonderzeichen in ASCII-Varianten um (z. B. fuer E-Mail-Muster). */
export function asciiFold(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Wie asciiFold, aber der Punkt bleibt erhalten. Fuer den Vergleich von
 * E-Mail-Localparts wichtig (z. B. "vorname.nachname" behaelt den Punkt).
 */
export function foldLocalPart(local: string): string {
  return local
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, "");
}

/** Zerlegt einen vollen Namen in Vor- und Nachname (best effort). */
export function splitName(fullName: string): { first: string; last: string } | null {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 1 && /[A-Za-zÄÖÜäöüß]/.test(part));
  if (parts.length < 2) return null;
  const first = asciiFold(parts[0]);
  const last = asciiFold(parts[parts.length - 1]);
  if (!first || !last) return null;
  return { first, last };
}

/** Liefert einen kurzen Kontextausschnitt rund um einen Fund. */
export function contextAround(text: string, needle: string, radius = 160): string {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return text.slice(0, radius * 2).trim();
  return text.slice(Math.max(0, index - radius), index + radius).replace(/\s+/g, " ").trim();
}

/** Reine Domain (ohne Schema/www/Pfad), kleingeschrieben. */
export function normalizeDomain(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}
