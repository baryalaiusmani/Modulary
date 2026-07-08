// Orchestrator der modularen E-Mail-Discovery.
//
// Er kombiniert die bestehende Website-Suche (deren Ergebnisse als "base"
// hereingereicht werden) mit den neuen Modulen, dedupliziert, verifiziert und
// bewertet die Treffer. Alle netzbasierten Zusatzquellen sind ueber
// Umgebungsvariablen standardmaessig DEAKTIVIERT -- ohne Konfiguration
// verhaelt sich das Tool exakt wie zuvor, nur zusaetzlich mit MX-Pruefung und
// Confidence Score. Es wird niemals ein zuvor gefundener Treffer entfernt.

import type { Contact, EmailFinding } from "./types";
import { DnsEmailVerifier } from "./verifier";
import { DefaultEmailPatternGenerator } from "./patterns";
import { RegexContactExtractor } from "./contacts";
import { BasicDocumentScanner } from "./sources/documents";
import { GithubSource } from "./sources/github";
import { WaybackSource } from "./sources/wayback";
import { PgpKeyserverSource } from "./sources/adapters";
import { findSubdomains } from "./sources/crt";
import { resolveSearchProvider } from "./search-providers";
import { buildDorks } from "./dorks";
import { mergeFindings, scoreFinding } from "./scoring";
import { fetchText } from "./http";
import { extractEmailsFromText, contextAround, normalizeDomain } from "./text";

export type DiscoveryConfig = {
  verifyMx: boolean;
  patterns: boolean;
  search: boolean;
  documents: boolean;
  crt: boolean;
  github: boolean;
  wayback: boolean;
  pgp: boolean;
};

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return /^(1|true|on|yes)$/i.test(raw.trim());
}

/** Liest die aktive Konfiguration aus ENV. Nur MX-Pruefung ist Default-an. */
export function getDiscoveryConfig(): DiscoveryConfig {
  return {
    verifyMx: flag("EMAIL_FINDER_VERIFY_MX", true),
    patterns: flag("EMAIL_FINDER_PATTERNS", false),
    search: flag("EMAIL_FINDER_SEARCH", false),
    documents: flag("EMAIL_FINDER_DOCUMENTS", false),
    crt: flag("EMAIL_FINDER_CRT", false),
    github: flag("EMAIL_FINDER_GITHUB", false),
    wayback: flag("EMAIL_FINDER_WAYBACK", false),
    pgp: flag("EMAIL_FINDER_PGP", false),
  };
}

export type BaseContact = {
  email: string;
  name: string;
  jobTitle: string;
  source: string;
};

export type DiscoveryLogEntry = { method: string; count: number };

export type DiscoveryOutcome = {
  findings: EmailFinding[];
  log: DiscoveryLogEntry[];
};

function baseToFindings(base: BaseContact[], domain: string): EmailFinding[] {
  const now = new Date().toISOString();
  return base.map((contact) => ({
    email: contact.email.toLowerCase(),
    domain,
    sourceUrl: contact.source,
    sourceType: "website" as const,
    foundOn: now,
    confidenceScore: 75,
    isVerified: false,
    isGenerated: false,
    relatedPersonName: contact.name,
    relatedPersonRole: contact.jobTitle,
    evidenceText: contact.name ? `${contact.name} - ${contact.jobTitle}`.trim() : "",
    discoveryMethod: "website-crawl" as const,
  }));
}

async function collectFromSearch(domain: string): Promise<EmailFinding[]> {
  const provider = resolveSearchProvider();
  if (!provider) return [];
  const findings: EmailFinding[] = [];
  const now = new Date().toISOString();
  const seenUrls = new Set<string>();

  for (const dork of buildDorks(domain).slice(0, 6)) {
    const results = await provider.search(dork.query, 8);
    for (const result of results.slice(0, 5)) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      // Zuerst aus dem Snippet, dann aus der Seite selbst.
      const snippetEmails = extractEmailsFromText(`${result.title} ${result.snippet}`);
      const html = await fetchText(result.url);
      const pageEmails = html ? extractEmailsFromText(html.replace(/<[^>]+>/g, " ")) : [];
      for (const email of new Set([...snippetEmails, ...pageEmails])) {
        if (!email.endsWith(`@${domain}`)) continue;
        findings.push({
          email,
          domain,
          sourceUrl: result.url,
          sourceType: "search",
          foundOn: now,
          confidenceScore: 55,
          isVerified: false,
          isGenerated: false,
          relatedPersonName: "",
          relatedPersonRole: "",
          evidenceText: `Ueber Suche (${provider.name}): ${dork.purpose}`,
          discoveryMethod: "search-dork",
        });
      }
    }
  }
  return findings;
}

async function collectFromSubdomains(domain: string): Promise<EmailFinding[]> {
  const subdomains = (await findSubdomains(domain)).slice(0, 8);
  const findings: EmailFinding[] = [];
  const now = new Date().toISOString();

  for (const host of subdomains) {
    const html = await fetchText(`https://${host}`);
    if (!html) continue;
    const text = html.replace(/<[^>]+>/g, " ");
    for (const email of extractEmailsFromText(text)) {
      if (!email.endsWith(`@${domain}`)) continue;
      findings.push({
        email,
        domain,
        sourceUrl: `https://${host}`,
        sourceType: "certificate",
        foundOn: now,
        confidenceScore: 60,
        isVerified: false,
        isGenerated: false,
        relatedPersonName: "",
        relatedPersonRole: "",
        evidenceText: `Auf Subdomain ${host} (via crt.sh) gefunden: ${contextAround(text, email, 70)}`,
        discoveryMethod: "certificate-transparency",
      });
    }
  }
  return findings;
}

async function collectContacts(domain: string): Promise<Contact[]> {
  const extractor = new RegexContactExtractor();
  const pages = [`https://${domain}`, `https://www.${domain}/team`, `https://www.${domain}/impressum`, `https://${domain}/ueber-uns`];
  const contacts: Contact[] = [];
  const seen = new Set<string>();
  for (const url of pages) {
    const html = await fetchText(url);
    if (!html) continue;
    for (const contact of extractor.extract(html, url)) {
      const key = contact.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push(contact);
    }
  }
  return contacts;
}

/**
 * Hauptfunktion: reichert die Basis-Treffer (aus der bestehenden Website-Suche)
 * mit den aktivierten Zusatzquellen an, verifiziert und bewertet alles.
 */
export async function runDiscovery(rawDomain: string, base: BaseContact[]): Promise<DiscoveryOutcome> {
  const domain = normalizeDomain(rawDomain);
  const config = getDiscoveryConfig();
  const log: DiscoveryLogEntry[] = [];

  const all: EmailFinding[] = baseToFindings(base, domain);
  log.push({ method: "website-crawl", count: all.length });

  const track = async (method: string, task: Promise<EmailFinding[]>) => {
    try {
      const found = await task;
      log.push({ method, count: found.length });
      all.push(...found);
    } catch {
      log.push({ method, count: 0 });
    }
  };

  if (config.search) await track("search-dork", collectFromSearch(domain));
  if (config.crt) await track("certificate-transparency", collectFromSubdomains(domain));
  if (config.documents) {
    await track("document-scan", (async () => {
      const scanner = new BasicDocumentScanner();
      const urls = await scanner.discover(domain);
      const results = await Promise.all(urls.map((url) => scanner.scan(url, domain)));
      return results.flat();
    })());
  }
  if (config.github) await track("github-search", new GithubSource().find(domain));
  if (config.wayback) await track("wayback", new WaybackSource().find(domain));
  if (config.pgp) await track("pgp-keyserver", new PgpKeyserverSource().find(domain));

  // Muster-Generierung: nutzt bestaetigte E-Mails + erkannte Ansprechpartner.
  if (config.patterns) {
    await track("pattern-generation", (async () => {
      const confirmed = all.filter((finding) => !finding.isGenerated).map((finding) => finding.email);
      const contactsFromBase: Contact[] = base
        .filter((contact) => contact.name)
        .map((contact) => ({ name: contact.name, role: contact.jobTitle, sourceUrl: contact.source, evidenceText: "" }));
      const extraContacts = await collectContacts(domain);
      const contacts = [...contactsFromBase, ...extraContacts];
      return new DefaultEmailPatternGenerator().generate(domain, confirmed, contacts);
    })());
  }

  // Zusammenfuehren + verifizieren + bewerten.
  const verifier = new DnsEmailVerifier();
  const verification = config.verifyMx ? await verifier.verifyDomain(domain) : null;

  const merged = mergeFindings(all);
  const scored = merged
    .filter((finding) => verifier.isValidSyntax(finding.email))
    .map((finding) => scoreFinding(finding, verification));

  // Sortierung: sichere vor generierten, dann nach Score.
  scored.sort((left, right) => {
    if (left.isGenerated !== right.isGenerated) return left.isGenerated ? 1 : -1;
    return right.confidenceScore - left.confidenceScore;
  });

  return { findings: scored, log };
}
