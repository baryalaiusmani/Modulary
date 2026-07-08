// Verbesserte Erkennung von Personennamen und Rollen aus Seitentext.
//
// Problemstellung: Auf typischen Team-/Mitarbeiterseiten steht in der
// Navigation/Seitenleiste viel "rollenaehnlicher" Text (z. B. "Institutsleitung",
// "Wissenschaftlicher Koordinator"). Eine naive Extraktion verwechselt diese
// Menue-Woerter mit echten Namen/Rollen.
//
// Strategie:
//  - Titel-/Rollen-/Navigations-Woerter werden nie als Namensbestandteil erlaubt.
//  - Der echte Name wird ueber den E-Mail-Localpart gefunden (z. B. Nachname
//    "teloeken" -> "Sofie Teloeken" im Text).
//  - Die Rolle wird bevorzugt direkt HINTER dem gefundenen Namen gelesen, weil
//    sie dort im Hauptinhalt steht (und nicht in der Navigation).

import { asciiFold } from "./text";

// Woerter, die Teil eines Titels/einer Rolle/Rechtsform/Navigation sind und
// daher nie ein Personenname sein duerfen (ASCII-gefaltet verglichen).
const TITLE_WORDS = new Set([
  "prof", "professor", "professorin", "dr", "dipl", "ing", "med", "bsc", "msc",
  "geschaeftsfuehrer", "geschaeftsfuehrerin", "ceo", "cto", "cfo", "coo", "chief", "officer",
  "head", "manager", "managerin", "director", "direktor", "direktorin", "leiter", "leiterin", "leitung",
  "referent", "referentin", "koordinator", "koordinatorin", "founder", "cofounder", "gruender", "gruenderin",
  "sales", "vertrieb", "marketing", "presse", "press", "kommunikation", "recruiting", "recruiter",
  "support", "service", "einkauf", "procurement", "purchasing", "entwickler", "entwicklerin",
  "institut", "institutsleitung", "stellvertretende", "stellvertretender", "wissenschaftliche",
  "wissenschaftlicher", "mitarbeiter", "mitarbeiterin", "mitarbeitende",
  "bereich", "system", "security", "abteilung", "team", "kontakt", "impressum", "datenschutz",
  "gmbh", "ag", "kg", "ug", "und", "of", "the", "fuer", "der", "die", "das", "den",
  "aktuelles", "forschung", "buecher", "downloads", "ueber", "uns", "suche", "studienangebot",
  "home", "startseite", "news", "blog", "karriere", "jobs", "projekt", "aufgaben", "raum",
  "email", "mail", "telefon", "fax", "adresse", "allgemeine", "informationen", "ehemalige",
  "aktuellen", "aktive", "westfaelische", "hochschule", "gelsenkirchen", "universitaet",
]);

const NAME_WORD = /^[A-ZÄÖÜ][a-zäöüß'’-]+$/;

function cleanToken(token: string): string {
  return token.replace(/^[^A-Za-zÄÖÜäöü]+|[^A-Za-zÄÖÜäöüß]+$/g, "");
}

function isNameWord(word: string): boolean {
  return NAME_WORD.test(word) && !TITLE_WORDS.has(asciiFold(word));
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

// Localparts, die keine Person bezeichnen.
const GENERIC_LOCAL = /^(info|kontakt|contact|office|sales|support|service|hello|hallo|mail|team|presse|news|admin|webmaster|noreply|no-reply|marketing|vertrieb|jobs|karriere|bewerbung|empfang|zentrale|buchhaltung|rechnung)$/i;

/** Findet 2-Wort-Namenskandidaten (Vorname Nachname) im Text. */
export function findNameCandidates(text: string): string[] {
  const tokens = text.split(/\s+/).map(cleanToken);
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (isNameWord(tokens[i]) && isNameWord(tokens[i + 1])) {
      out.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }
  return [...new Set(out)];
}

/** Ermittelt den Personennamen zu einer E-Mail (best effort). */
export function inferPersonName(pageText: string, email: string): string {
  const local = (email.split("@")[0] ?? "").trim();

  // 1) Localpart mit Trenner (z. B. "kevin.wollowski") -> direkt ableitbar.
  const parts = local.split(/[._+-]+/).filter((part) => part.length > 1);
  if (parts.length >= 2 && !parts.some((part) => GENERIC_LOCAL.test(part))) {
    return parts.map(capitalize).join(" ");
  }
  if (GENERIC_LOCAL.test(local)) return "";

  // 2) Einzelner Localpart (meist Nachname): passenden Namen im Text suchen.
  const lp = asciiFold(local);
  const candidates = findNameCandidates(pageText);
  const byLast = candidates.find((name) => asciiFold(name.split(/\s+/).pop() ?? "") === lp);
  if (byLast) return byLast;
  const byFirst = candidates.find((name) => asciiFold(name.split(/\s+/)[0] ?? "") === lp);
  if (byFirst) return byFirst;
  return "";
}

// Rollen-/Positionsphrasen. Reihenfolge = Prioritaet (spezifisch vor allgemein).
const ROLE_PHRASES: RegExp[] = [
  /Stellvertretende[rn]? Institutsleitung/i,
  /Wissenschaftliche[rn]? Koordinator(in)?/i,
  /Wissenschaftliche[rn]? Mitarbeiter(in)?/i,
  /Institutsleitung/i,
  /Gesch(ä|ae)ftsf(ü|ue)hr(er|erin|ung)/i,
  /Head of [A-Za-zÄÖÜäöüß ]{2,30}/i,
  /Chief [A-Za-z]+ Officer/i,
  /\b(C[EFT]O|COO)\b/,
  /(Sales|Vertriebs?)[- ]?(Manager(in)?|Leiter(in)?|Leitung)/i,
  /Marketing[- ]?(Manager(in)?|Leitung|Leiter(in)?)/i,
  /Presse[- ]?(sprecher(in)?|referent(in)?)/i,
  /(Personal|HR)[- ]?(referent(in)?|leitung|manager(in)?)/i,
  /Recruit(ing|er(in)?)/i,
  /Bereich [A-ZÄÖÜ][A-Za-zÄÖÜäöüß ]{2,30}/,
  /(Support|Kundenservice|Kundenbetreuung)/i,
  /Professor(in)?\b/i,
];

/** Findet die erste passende Rollen-Phrase in einem Textausschnitt. */
export function inferRole(context: string): string {
  for (const pattern of ROLE_PHRASES) {
    const match = context.match(pattern);
    if (match && match[0].trim().length >= 3) return match[0].replace(/\s+/g, " ").trim();
  }
  return "";
}

export type PersonRole = { name: string; role: string };

/**
 * Ermittelt Name + Rolle. Die Rolle wird bevorzugt direkt HINTER dem Namen
 * gelesen (dort steht sie im Hauptinhalt), sonst im Umfeld der E-Mail.
 */
// Marker, die den Beginn des Personen-Detailblocks anzeigen (Hauptinhalt).
// In der Navigation/Seitenleiste kommen diese Woerter nicht direkt nach einem
// Namen vor -- so lassen sie sich vom Menue unterscheiden.
const CONTENT_MARKER = /\b(Aufgaben|Projekt|Raum|Telefon|E-?Mail|Fax|Position|Funktion|Abteilung)\b/i;

export function inferPersonAndRole(pageText: string, emailContext: string, email: string): PersonRole {
  const name = inferPersonName(pageText, email);
  let role = "";
  if (name) {
    const lowerPage = pageText.toLowerCase();
    const lowerName = name.toLowerCase();

    // Alle Vorkommen des Namens sammeln.
    const occurrences: number[] = [];
    for (let from = lowerPage.indexOf(lowerName); from >= 0; from = lowerPage.indexOf(lowerName, from + lowerName.length)) {
      occurrences.push(from);
    }

    // Das Vorkommen waehlen, dem bald ein Inhalts-Marker folgt = der echte
    // Personenblock (nicht Breadcrumb/Navigation).
    const blockStart = occurrences.find((index) => CONTENT_MARKER.test(pageText.slice(index + name.length, index + name.length + 200)));
    const chosen = blockStart ?? occurrences[0];

    if (chosen !== undefined) {
      const window = pageText.slice(chosen + name.length, chosen + name.length + 200);
      const marker = window.match(CONTENT_MARKER);
      // Die Rolle steht zwischen Name und erstem Inhalts-Marker.
      const roleZone = marker && marker.index !== undefined ? window.slice(0, marker.index) : window.slice(0, 120);
      role = inferRole(roleZone);
    }
  }
  if (!role) role = inferRole(emailContext);
  return { name, role };
}
