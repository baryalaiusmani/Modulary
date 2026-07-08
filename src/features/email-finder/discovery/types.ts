// Gemeinsame Typen und Interfaces fuer die modulare E-Mail-Discovery.
//
// Diese Datei erweitert das bestehende E-Mail-Suche-Feature und veraendert
// keine vorhandene Logik. Alle neuen Suchmethoden liefern ein einheitliches
// EmailFinding zurueck, damit Ergebnisse aus verschiedenen Quellen sauber
// zusammengefuehrt, dedupliziert und bewertet werden koennen.

/** Woher stammt ein Treffer. */
export type EmailSourceType =
  | "website" // direkt auf der Firmenwebseite gefunden
  | "document" // aus PDF/DOCX/PPTX extrahiert
  | "search" // ueber eine Suchmaschine (Dork) gefunden
  | "certificate" // Hinweis aus Certificate Transparency (Subdomain)
  | "github" // oeffentliche GitHub-Quelle
  | "wayback" // historischer Archiv-Stand
  | "pattern_generated" // aus einem Muster generiert (unsicher)
  | "other";

/** Mit welcher Methode wurde der Treffer erzeugt. */
export type DiscoveryMethod =
  | "website-crawl"
  | "search-dork"
  | "document-scan"
  | "contact-extraction"
  | "pattern-generation"
  | "certificate-transparency"
  | "github-search"
  | "wayback"
  | "pgp-keyserver"
  | "directory";

/**
 * Einheitlicher Treffer. Feldnamen entsprechen der im Auftrag gewuenschten
 * Ergebnisstruktur (email, domain, source_url, source_type, found_on,
 * confidence_score, is_verified, is_generated, related_person_name,
 * related_person_role, evidence_text, discovery_method) in camelCase.
 */
export type EmailFinding = {
  email: string;
  domain: string;
  sourceUrl: string;
  sourceType: EmailSourceType;
  foundOn: string; // ISO-Zeitstempel
  confidenceScore: number; // 0..100
  isVerified: boolean; // Syntax + MX gueltig
  isGenerated: boolean; // aus Muster geraten
  relatedPersonName: string;
  relatedPersonRole: string;
  evidenceText: string; // kurzer Kontext / Beleg
  discoveryMethod: DiscoveryMethod;
};

/** Ein erkannter Ansprechpartner (kann, muss aber keine E-Mail haben). */
export type Contact = {
  name: string;
  role: string;
  sourceUrl: string;
  evidenceText: string;
};

/** Eine generierte Suchmaschinen-Abfrage (Dork). */
export type SearchQuery = {
  query: string;
  purpose: string;
};

/** Normalisiertes Suchergebnis eines Providers. */
export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

/** Ergebnis einer MX-/Syntaxpruefung fuer eine Domain. */
export type DomainVerification = {
  domain: string;
  syntaxOk: boolean;
  hasMx: boolean;
  mxHosts: string[];
  isCatchAll: boolean | null; // null = nicht ermittelbar (kein SMTP-Probing)
};

// --- Austauschbare Schnittstellen (Provider-Vertraege) --------------------

export interface SearchProvider {
  readonly name: string;
  /** true, wenn API-Keys/Config vorhanden sind. */
  isConfigured(): boolean;
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

export interface DocumentScanner {
  /** Findet Dokument-URLs (PDF/DOCX/PPTX) fuer eine Domain. */
  discover(domain: string): Promise<string[]>;
  /** Laedt ein Dokument und extrahiert E-Mails + Kontext. */
  scan(url: string, domain: string): Promise<EmailFinding[]>;
}

export interface ContactExtractor {
  /** Extrahiert Namen + Rollen aus HTML einer Seite. */
  extract(html: string, sourceUrl: string): Contact[];
}

export interface EmailPatternGenerator {
  /**
   * Leitet aus bestaetigten E-Mails ein Muster ab und generiert daraus
   * moegliche Adressen fuer bekannte Ansprechpartner.
   */
  generate(domain: string, confirmed: string[], contacts: Contact[]): EmailFinding[];
}

export interface EmailVerifier {
  verifyDomain(domain: string): Promise<DomainVerification>;
  isValidSyntax(email: string): boolean;
}

/** Zusaetzliche vorbereitete OSINT-Quelle (GitHub, Wayback, PGP, ...). */
export interface OsintSource {
  readonly name: string;
  readonly method: DiscoveryMethod;
  isConfigured(): boolean;
  find(domain: string): Promise<EmailFinding[]>;
}
