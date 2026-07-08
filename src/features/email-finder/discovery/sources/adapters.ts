// Vorbereitete Adapter-Struktur fuer weitere kostenlose Quellen.
// Diese Quellen sind bewusst als saubere, aktivierbare Adapter angelegt.
// Die Netzwerklogik ist skizziert bzw. defensiv, damit sie ohne Konfiguration
// niemals stoert. Hier ist der EXAKTE Ort, um die jeweilige Integration und
// ggf. API-Keys zu ergaenzen.

import type { EmailFinding, OsintSource } from "../types";
import { fetchText } from "../http";
import { extractEmailsFromText } from "../text";

/**
 * PGP-Keyserver: oeffentliche Schluessel enthalten oft geschaeftliche E-Mails.
 * Klassische HKP-Keyserver erlauben eine Index-Suche. Kein API-Key noetig.
 * Aktivierung ueber Discovery-Config (standardmaessig aus).
 */
export class PgpKeyserverSource implements OsintSource {
  readonly name = "pgp";
  readonly method = "pgp-keyserver" as const;

  isConfigured(): boolean {
    return true;
  }

  async find(domain: string): Promise<EmailFinding[]> {
    // HKP-Index-Suche nach der Domain. Ergebnis ist maschinenlesbarer Text.
    const url = `https://keyserver.ubuntu.com/pks/lookup?op=index&options=mr&search=${encodeURIComponent(`@${domain}`)}`;
    const body = await fetchText(url);
    if (!body) return [];
    const now = new Date().toISOString();
    return extractEmailsFromText(body)
      .filter((email) => email.endsWith(`@${domain}`))
      .map((email) => ({
        email,
        domain,
        sourceUrl: url,
        sourceType: "other",
        foundOn: now,
        confidenceScore: 45,
        isVerified: false,
        isGenerated: false,
        relatedPersonName: "",
        relatedPersonRole: "",
        evidenceText: "Oeffentlicher PGP-Keyserver-Eintrag.",
        discoveryMethod: "pgp-keyserver",
      }));
  }
}

/**
 * Branchenverzeichnis / OpenStreetMap-Adapter (Platzhalter).
 * OSM liefert vor allem Adressen/Telefon; E-Mails nur selten. Der Adapter ist
 * vorbereitet, standardmaessig aber ohne Netzwerkaufruf (liefert leer).
 * TODO: Overpass-API-Query ergaenzen, falls gewuenscht.
 */
export class DirectorySource implements OsintSource {
  readonly name = "directory";
  readonly method = "directory" as const;

  // Bewusst nicht konfiguriert -> Quelle bleibt inaktiv, bis implementiert.
  isConfigured(): boolean {
    return false;
  }

  async find(): Promise<EmailFinding[]> {
    return [];
  }
}
