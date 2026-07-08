// Erkennt E-Mail-Muster aus bestaetigten Adressen und generiert daraus
// moegliche Adressen fuer bekannte Ansprechpartner. Generierte Adressen
// werden IMMER klar als unsicher (isGenerated) markiert und mit niedrigem
// Confidence Score versehen, damit sie nie mit sicher gefundenen Adressen
// verwechselt werden.

import type { Contact, EmailFinding, EmailPatternGenerator } from "./types";
import { foldLocalPart, splitName } from "./text";

export type EmailPattern =
  | "firstname.lastname"
  | "firstnamelastname"
  | "firstinitial.lastname"
  | "firstinitiallastname"
  | "firstname"
  | "lastname";

const ALL_PATTERNS: EmailPattern[] = [
  "firstname.lastname",
  "firstnamelastname",
  "firstinitial.lastname",
  "firstinitiallastname",
  "firstname",
  "lastname",
];

function buildLocalPart(pattern: EmailPattern, first: string, last: string): string {
  switch (pattern) {
    case "firstname.lastname":
      return `${first}.${last}`;
    case "firstnamelastname":
      return `${first}${last}`;
    case "firstinitial.lastname":
      return `${first.charAt(0)}.${last}`;
    case "firstinitiallastname":
      return `${first.charAt(0)}${last}`;
    case "firstname":
      return first;
    case "lastname":
      return last;
  }
}

/**
 * Versucht, aus einer bestaetigten E-Mail + zugehoerigem Namen das Muster
 * abzuleiten. Gibt das erste passende Muster zurueck oder null.
 */
export function detectPattern(email: string, fullName: string): EmailPattern | null {
  const localPart = foldLocalPart(email.split("@")[0] ?? "");
  const name = splitName(fullName);
  if (!localPart || !name) return null;
  return ALL_PATTERNS.find((pattern) => buildLocalPart(pattern, name.first, name.last) === localPart) ?? null;
}

/**
 * Leitet die wahrscheinlichsten Muster aus mehreren bestaetigten
 * (E-Mail, Name)-Paaren ab, sortiert nach Haeufigkeit.
 */
export function inferPatterns(pairs: Array<{ email: string; name: string }>): EmailPattern[] {
  const counts = new Map<EmailPattern, number>();
  for (const { email, name } of pairs) {
    const pattern = detectPattern(email, name);
    if (pattern) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([pattern]) => pattern);
}

/** Generiert moegliche Adressen fuer einen Namen anhand gegebener Muster. */
export function generateForName(fullName: string, domain: string, patterns: EmailPattern[]): string[] {
  const name = splitName(fullName);
  if (!name) return [];
  const local = patterns.map((pattern) => buildLocalPart(pattern, name.first, name.last)).filter(Boolean);
  return [...new Set(local)].map((part) => `${part}@${domain}`);
}

export class DefaultEmailPatternGenerator implements EmailPatternGenerator {
  generate(domain: string, confirmed: string[], contacts: Contact[]): EmailFinding[] {
    // Nur generieren, wenn wir mindestens eine echte E-Mail der Domain kennen.
    const domainEmails = confirmed.filter((email) => email.toLowerCase().endsWith(`@${domain}`));
    if (!domainEmails.length) return [];

    // Muster aus Kontakten ableiten, deren Name zu einer echten Adresse passt.
    const namedContacts = contacts.filter((contact) => splitName(contact.name));
    const pairs = domainEmails.flatMap((email) => {
      const match = namedContacts.find((contact) => detectPattern(email, contact.name));
      return match ? [{ email, name: match.name }] : [];
    });

    const patterns = inferPatterns(pairs);
    // Falls kein Muster ableitbar, das gaengigste Standardmuster als Annahme nutzen.
    const effective = patterns.length ? patterns.slice(0, 2) : (["firstname.lastname"] as EmailPattern[]);

    const confirmedSet = new Set(confirmed.map((email) => email.toLowerCase()));
    const findings: EmailFinding[] = [];
    const now = new Date().toISOString();

    for (const contact of namedContacts) {
      for (const candidate of generateForName(contact.name, domain, effective)) {
        if (confirmedSet.has(candidate)) continue; // niemals echte Adressen ueberschreiben
        findings.push({
          email: candidate,
          domain,
          sourceUrl: contact.sourceUrl,
          sourceType: "pattern_generated",
          foundOn: now,
          confidenceScore: patterns.length ? 35 : 20,
          isVerified: false,
          isGenerated: true,
          relatedPersonName: contact.name,
          relatedPersonRole: contact.role,
          evidenceText: `Aus Muster generiert (${effective.join(", ")}). Nicht bestaetigt.`,
          discoveryMethod: "pattern-generation",
        });
      }
    }

    // Duplikate ueber die generierten Adressen entfernen.
    const seen = new Set<string>();
    return findings.filter((finding) => {
      if (seen.has(finding.email)) return false;
      seen.add(finding.email);
      return true;
    });
  }
}
