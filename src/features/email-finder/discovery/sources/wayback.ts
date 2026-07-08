// Wayback-/Archive.org-Quelle: findet historische Kontakt-/Impressum-Seiten
// und extrahiert E-Mails, die heute evtl. entfernt wurden. Kostenlos, kein Key.
// Treffer werden als "historisch" markiert (niedrigerer Score).

import type { EmailFinding, OsintSource } from "../types";
import { fetchText, fetchJson } from "../http";
import { extractEmailsFromText, contextAround } from "../text";

const CONTACT_PATH = /(kontakt|contact|impressum|imprint|team|ueber|about)/i;

export class WaybackSource implements OsintSource {
  readonly name = "wayback";
  readonly method = "wayback" as const;

  // Kein API-Key noetig; wird ueber die Discovery-Config aktiviert.
  isConfigured(): boolean {
    return true;
  }

  async find(domain: string): Promise<EmailFinding[]> {
    const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}*&output=json&fl=timestamp,original&collapse=urlkey&limit=200`;
    const rows = await fetchJson<string[][]>(cdx);
    if (!Array.isArray(rows) || rows.length < 2) return [];

    // Erste Zeile ist der Header.
    const snapshots = rows
      .slice(1)
      .filter((row) => CONTACT_PATH.test(row[1] ?? ""))
      .slice(0, 6);

    const findings: EmailFinding[] = [];
    const now = new Date().toISOString();

    for (const [timestamp, original] of snapshots) {
      const snapshotUrl = `https://web.archive.org/web/${timestamp}/${original}`;
      const html = await fetchText(snapshotUrl);
      if (!html) continue;
      const text = html.replace(/<[^>]+>/g, " ");
      for (const email of extractEmailsFromText(text)) {
        if (!email.endsWith(`@${domain}`)) continue;
        findings.push({
          email,
          domain,
          sourceUrl: snapshotUrl,
          sourceType: "wayback",
          foundOn: now,
          confidenceScore: 40,
          isVerified: false,
          isGenerated: false,
          relatedPersonName: "",
          relatedPersonRole: "",
          evidenceText: `Historischer Archivstand (${timestamp}): ${contextAround(text, email, 80)}`,
          discoveryMethod: "wayback",
        });
      }
    }
    return findings;
  }
}
