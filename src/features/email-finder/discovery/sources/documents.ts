// Dokumenten-Scanner: findet PDF/DOCX/PPTX-Dateien einer Domain und
// extrahiert daraus E-Mail-Adressen.
//
// Hinweis zur Text-Extraktion: Um die App ohne zusaetzliche Abhaengigkeiten
// lauffaehig zu halten, wird hier eine best-effort-Extraktion aus dem
// Roh-Bytestrom durchgefuehrt. Fuer PDFs mit unkomprimiertem Text und viele
// Office-Dateien funktioniert das gut genug, um E-Mails zu finden. Fuer
// vollstaendige, zuverlaessige Extraktion kann spaeter ein Parser-Adapter
// (z. B. "pdf-parse" fuer PDF, "mammoth" fuer DOCX) an EXACT dieser Stelle
// eingehaengt werden -- siehe extractText().

import type { DocumentScanner, EmailFinding } from "../types";
import { fetchText, fetchBuffer } from "../http";
import { extractEmailsFromText, contextAround } from "../text";

const DOC_SUFFIX = /\.(pdf|docx?|pptx?)(\?|#|$)/i;

function absolute(href: string, base: string): string {
  try {
    return new URL(href, base).toString().replace(/#.*$/, "");
  } catch {
    return "";
  }
}

function documentTypeLabel(url: string): string {
  const match = url.toLowerCase().match(/\.(pdf|docx?|pptx?)/);
  return match ? match[1].toUpperCase() : "Dokument";
}

/**
 * Best-effort-Textextraktion aus einem Dokument-Buffer.
 * Ersetzbar durch eine echte Parser-Bibliothek (Adapter-Punkt).
 */
export function extractText(buffer: Buffer): string {
  // latin1 bewahrt einzelne Bytes -> ASCII-E-Mails bleiben lesbar.
  return buffer.toString("latin1").replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ");
}

export class BasicDocumentScanner implements DocumentScanner {
  async discover(domain: string): Promise<string[]> {
    const roots = [`https://${domain}`, `https://www.${domain}`];
    const found = new Set<string>();
    for (const root of roots) {
      const html = await fetchText(root);
      if (!html) continue;
      for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
        const url = absolute(match[1], root);
        if (url && DOC_SUFFIX.test(url)) found.add(url);
      }
      if (found.size) break;
    }
    return [...found].slice(0, 20);
  }

  async scan(url: string, domain: string): Promise<EmailFinding[]> {
    const buffer = await fetchBuffer(url);
    if (!buffer) return [];
    const text = extractText(buffer);
    const emails = extractEmailsFromText(text);
    const now = new Date().toISOString();
    const label = documentTypeLabel(url);

    return emails.map((email) => {
      const onDomain = email.endsWith(`@${domain}`);
      return {
        email,
        domain,
        sourceUrl: url,
        sourceType: "document",
        foundOn: now,
        confidenceScore: onDomain ? 70 : 50,
        isVerified: false,
        isGenerated: false,
        relatedPersonName: "",
        relatedPersonRole: "",
        evidenceText: `Gefunden in ${label}: ${contextAround(text, email, 80)}`,
        discoveryMethod: "document-scan",
      } satisfies EmailFinding;
    });
  }
}
