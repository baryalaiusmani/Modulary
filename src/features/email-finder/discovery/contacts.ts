// Erkennt Ansprechpartner (Name + Rolle) aus HTML-Seiten wie Team, About,
// Impressum, Presse, Karriere. Bewusst regex-basiert und ohne DOM-Bibliothek,
// damit es serverseitig leichtgewichtig bleibt.

import type { Contact, ContactExtractor } from "./types";

// Rollen -> normalisierte Kategorie. Reihenfolge egal.
const ROLE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "CEO / Geschäftsführung", pattern: /\b(ceo|chief executive|gesch(ä|ae)ftsf(ü|ue)hr(er|erin|ung)|managing director|inhaber(in)?)\b/i },
  { label: "Founder", pattern: /\b(co-?founder|founder|gr(ü|ue)nder(in)?)\b/i },
  { label: "HR / Recruiting", pattern: /\b(hr|human resources|personal(abteilung|referent|leitung)?|recruit(ing|er)|talent acquisition)\b/i },
  { label: "Sales / Vertrieb", pattern: /\b(sales|vertrieb(sleitung|smanager)?|account manager|business development)\b/i },
  { label: "Marketing", pattern: /\b(marketing|brand|kommunikation|communications?)\b/i },
  { label: "Presse", pattern: /\b(presse|press|public relations|pr[- ]?manager|media relations)\b/i },
  { label: "Support / Service", pattern: /\b(support|kundenservice|customer (service|success)|service[- ]?team)\b/i },
  { label: "Einkauf", pattern: /\b(einkauf|procurement|purchasing|beschaffung)\b/i },
  { label: "IT", pattern: /\b(it[- ]?(leitung|manager|administrator)|cto|chief technology|head of (it|engineering)|entwickl(er|ung))\b/i },
];

// Einzelnes, gross geschriebenes Wort (moeglicher Namensbestandteil).
const CAPITALIZED = /^[A-ZÄÖÜ][a-zäöüß'-]{1,}$/;

// Tokens, die Titel/Rollen/Rechtsformen sind und daher NICHT Teil eines
// Personennamens sein duerfen. Verhindert, dass z. B. "Geschäftsführerin"
// als Nachname verschluckt wird.
const TITLE_TOKEN = /^(Gesch(ä|ae)ftsf(ü|ue)hr(er|erin|ung)|CEO|CTO|CFO|COO|Chief|Officer|Head|Manager(in)?|Director|Direktor(in)?|Leiter(in)?|Referent(in)?|Founder|Co-?Founder|Gr(ü|ue)nder(in)?|Sales|Vertrieb|Marketing|Presse|Press|HR|Recruiting|Recruiter(in)?|Support|Service|Einkauf|Procurement|Purchasing|IT|Entwickl(er|erin|ung)|Team|Kontakt|Impressum|Datenschutz|GmbH|AG|KG|UG|of|and|und|f(ü|ue)r|the)$/i;

function isNameToken(word: string): boolean {
  return CAPITALIZED.test(word) && !TITLE_TOKEN.test(word);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function detectRole(context: string): string {
  return ROLE_PATTERNS.find(({ pattern }) => pattern.test(context))?.label ?? "";
}

export class RegexContactExtractor implements ContactExtractor {
  extract(html: string, sourceUrl: string): Contact[] {
    const tokens = stripHtml(html).split(/\s+/).filter(Boolean);
    const contacts = new Map<string, Contact>();

    for (let i = 0; i < tokens.length; i += 1) {
      if (!isNameToken(tokens[i])) continue;

      // Bis zu drei aufeinanderfolgende Namens-Tokens zu einem Namen bündeln.
      const parts: string[] = [];
      let j = i;
      while (j < tokens.length && parts.length < 3 && isNameToken(tokens[j])) {
        parts.push(tokens[j]);
        j += 1;
      }
      if (parts.length < 2) continue; // Vor- + Nachname noetig

      const name = parts.join(" ");
      // Rolle bevorzugt NACH dem Namen suchen (typische Team-Layouts),
      // sonst im Fenster davor.
      const after = tokens.slice(j, j + 5).join(" ");
      const before = tokens.slice(Math.max(0, i - 5), i).join(" ");
      const role = detectRole(after) || detectRole(before);
      if (!role) {
        i = j - 1;
        continue; // nur Personen mit erkennbarer Rolle behalten
      }

      const key = name.toLowerCase();
      if (!contacts.has(key)) {
        contacts.set(key, { name, role, sourceUrl, evidenceText: `${name} ${after}`.trim() });
      }
      i = j - 1;
    }

    return [...contacts.values()];
  }
}
