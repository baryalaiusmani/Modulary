import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { CellValue, DataRow } from "@/features/excel/types";
import type { DomainCheckResult, EmailFinderResult, EmailFinderResultRow } from "@/features/email-finder/types";
import { runDiscovery } from "@/features/email-finder/discovery";
import { inferPersonAndRole } from "@/features/email-finder/discovery/name-role";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedExtensions = new Set(["xlsx", "csv"]);
const MAX_PAGES_PER_DOMAIN = Math.max(8, Number(process.env.EMAIL_FINDER_MAX_PAGES || 18));
const MAX_DOMAIN_CHECK_PAGES = Math.max(30, Number(process.env.EMAIL_FINDER_DOMAIN_CHECK_PAGES || 160));
const CONCURRENCY = Math.max(1, Number(process.env.EMAIL_FINDER_CONCURRENCY || 4));
const CONTACT_LINK_PATTERN = /(kontakt|contact|impressum|imprint|legal|about|ueber|über|team|people|personen|mitarbeiter|redaktion|unternehmen|company|support|sales|vertrieb|presse|press|footer|service|ansprechpartner)/i;

type LoadedWorkbook = {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  columns: string[];
  rows: DataRow[];
};

type FoundContact = {
  email: string;
  name: string;
  jobTitle: string;
  source: string;
};

type DomainResolution = {
  domain: string;
  source: string;
};

type CrawlOptions = {
  maxPages?: number;
  maxContacts?: number;
};

function normalizeCell(value: ExcelJS.CellValue): CellValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "text" in value) return String(value.text);
  if (typeof value === "object" && "hyperlink" in value) return String(value.hyperlink);
  return String(value);
}

function worksheetRows(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  const columns = Array.from({ length: headerRow.cellCount }, (_, index) => String(normalizeCell(headerRow.getCell(index + 1).value) ?? "").trim());
  if (!columns.length || columns.some((column) => !column)) throw new Error("Jede Spalte benoetigt eine Ueberschrift in der ersten Zeile.");

  const rows: DataRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = Object.fromEntries(columns.map((column, index) => [column, normalizeCell(row.getCell(index + 1).value)])) as DataRow;
    if (Object.values(record).some((value) => value !== null && value !== "")) rows.push(record);
  });
  return { columns, rows };
}

async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExtensions.has(extension)) throw new Error("Nur .xlsx- und .csv-Dateien werden unterstuetzt.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Die Datei darf maximal 15 MB gross sein.");

  const input = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  if (extension === "csv") await workbook.csv.read(Readable.from(input));
  else await workbook.xlsx.load(input as never);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Die Datei enthaelt kein Tabellenblatt.");
  const { columns, rows } = worksheetRows(worksheet);
  return { workbook, worksheet, columns, rows };
}

function findColumn(columns: string[], patterns: RegExp[], fallback = "") {
  return columns.find((column) => patterns.some((pattern) => pattern.test(column))) || fallback;
}

function cleanDomain(rawValue: CellValue) {
  return String(rawValue ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/$/, "");
}

function cleanHost(rawValue: string) {
  return cleanDomain(rawValue).split("/")[0].replace(/^www\./i, "").toLowerCase();
}

function cellText(value: CellValue) {
  return String(value ?? "").trim();
}

function hasEmail(value: CellValue) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(cellText(value));
}

function decodeHtml(value: string) {
  return value
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/\s*\[\s*at\s*\]|\s*\(at\)|\s+at\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]|\s*\(dot\)|\s+dot\s+/gi, ".")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ");
}

function decodeEmailHref(href: string) {
  const value = href.replace(/^mailto:/i, "").trim();
  if (!value) return "";
  if (value.includes("@")) return decodeURIComponent(value.split("?")[0]).toLowerCase();
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8").trim();
    return decoded.includes("@") ? decoded.toLowerCase() : "";
  } catch {
    return "";
  }
}

function decodeCloudflareEmail(hexValue: string) {
  const clean = hexValue.trim();
  if (!/^[a-f0-9]+$/i.test(clean) || clean.length < 4 || clean.length % 2 !== 0) return "";

  try {
    const key = Number.parseInt(clean.slice(0, 2), 16);
    let email = "";
    for (let index = 2; index < clean.length; index += 2) {
      email += String.fromCharCode(Number.parseInt(clean.slice(index, index + 2), 16) ^ key);
    }
    return email.includes("@") ? email.toLowerCase() : "";
  } catch {
    return "";
  }
}

function stripHtml(html: string) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function extractEmails(rawHtml: string) {
  const decoded = decodeHtml(rawHtml);
  const mailtoMatches = [...decoded.matchAll(/mailto:([^"'\s<>]+)/gi)]
    .map((match) => decodeEmailHref(match[0]))
    .filter(Boolean);
  const cloudflareMatches = [...decoded.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi)]
    .map((match) => decodeCloudflareEmail(match[1]))
    .filter(Boolean);
  const matches = decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set([...mailtoMatches, ...cloudflareMatches, ...matches.map((email) => email.toLowerCase())])]
    .filter((email) => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email))
    .filter((email) => !/^(example|test|noreply|no-reply)@/i.test(email));
}

function baseDomain(domain: string) {
  return domain.split("/")[0].replace(/^www\./i, "").toLowerCase();
}

function absoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString().replace(/#.*$/, "");
  } catch {
    return "";
  }
}

function sameHost(url: string, host: string) {
  try {
    const current = new URL(url);
    return cleanHost(current.hostname) === cleanHost(host);
  } catch {
    return false;
  }
}

function extractLinks(html: string, baseUrl: string, host: string) {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const href = decodeHtml(match[1]);
      const label = stripHtml(match[2] || "");
      const url = absoluteUrl(href, baseUrl);
      return { url, label, href };
    })
    .filter(({ url, href }) => url && !href.startsWith("mailto:") && sameHost(url, host))
    .filter(({ url }) => !/\.(pdf|png|jpe?g|gif|svg|webp|zip|rar|css|js)$/i.test(url));

  return links.map((link) => ({
    ...link,
    score: CONTACT_LINK_PATTERN.test(`${link.url} ${link.label}`) ? 0 : 1,
  }));
}

function sourceCandidates(domain: string) {
  const clean = cleanDomain(domain);
  const host = clean.split("/")[0];
  if (!host) return [];
  const originalPath = clean.includes("/") ? `https://${clean}` : "";
  const roots = [`https://${host}`, `https://www.${host}`, `http://${host}`];
  const paths = [
    "", "/kontakt", "/kontakt/", "/contact", "/contact/", "/impressum", "/impressum/",
    "/imprint", "/legal-notice", "/about", "/about-us", "/team", "/people",
    "/ueber-uns", "/ueber-uns/", "/uber-uns", "/uber-uns/", "/ueber", "/uber", "/wir-ueber-uns",
    "/unternehmen", "/company", "/support", "/sales", "/vertrieb", "/service", "/redaktion",
    "/redaktion/", "/ansprechpartner", "/ansprechpartner/", "/mitarbeiter", "/mitarbeiter/",
  ];
  return [...new Set([originalPath, ...roots.flatMap((root) => paths.map((path) => `${root}${path}`))].filter(Boolean))];
}

function sitemapCandidates(domain: string) {
  const host = cleanDomain(domain).split("/")[0];
  if (!host) return [];
  return [`https://${host}/sitemap.xml`, `https://www.${host}/sitemap.xml`, `http://${host}/sitemap.xml`];
}

function extractSitemapUrls(xml: string, host: string) {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter((url) => sameHost(url, host))
    .filter((url) => CONTACT_LINK_PATTERN.test(url))
    .slice(0, 50);
}

async function discoverSitemapUrls(domain: string) {
  const host = cleanDomain(domain).split("/")[0];
  const urls: string[] = [];
  for (const sitemapUrl of sitemapCandidates(domain)) {
    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;
    urls.push(...extractSitemapUrls(xml, host));
  }
  return [...new Set(urls)];
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ModularyEmailFinder/0.1; +local)",
        "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!/text|html|xml/i.test(contentType)) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function findEmailsForDomain(domain: string, options: CrawlOptions = {}): Promise<FoundContact[]> {
  const contacts = new Map<string, FoundContact>();
  const preferredDomain = baseDomain(cleanDomain(domain));
  const maxPages = options.maxPages ?? MAX_PAGES_PER_DOMAIN;
  const maxContacts = options.maxContacts ?? 30;
  const queue = [...sourceCandidates(domain), ...(await discoverSitemapUrls(domain))];
  const visited = new Set<string>();

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    if (contacts.size >= maxContacts) break;
    const html = await fetchText(url);
    if (!html) continue;
    const text = stripHtml(html);
    const discoveredLinks = extractLinks(html, url, preferredDomain);
    for (const link of discoveredLinks.sort((left, right) => left.score - right.score)) {
      if (visited.has(link.url) || queue.includes(link.url)) continue;
      if (link.score === 0) queue.unshift(link.url);
      else if (queue.length < maxPages * 3) queue.push(link.url);
    }
    const emails = extractEmails(html).sort((left, right) => {
      const leftPreferred = left.endsWith(`@${preferredDomain}`) ? -1 : 0;
      const rightPreferred = right.endsWith(`@${preferredDomain}`) ? -1 : 0;
      return leftPreferred - rightPreferred;
    });

    for (const email of emails) {
      if (contacts.has(email)) continue;
      const index = text.toLowerCase().indexOf(email.toLowerCase());
      const context = index >= 0 ? text.slice(Math.max(0, index - 180), index + 180) : text.slice(0, 360);
      const { name, jobTitle } = ((): { name: string; jobTitle: string } => {
        const person = inferPersonAndRole(text, context, email);
        return { name: person.name, jobTitle: person.role };
      })();
      contacts.set(email, { email, name, jobTitle, source: url });
    }
  }

  return [...contacts.values()];
}

export async function checkDomainForEmails(rawDomain: string): Promise<DomainCheckResult> {
  const domain = cleanDomain(rawDomain);
  if (!domain) throw new Error("Bitte geben Sie eine Domain ein.");

  // 1) Bestehende Website-Suche (unveraendert) liefert die Basis-Treffer.
  const contacts = await findEmailsForDomain(domain, { maxPages: MAX_DOMAIN_CHECK_PAGES, maxContacts: 250 });

  // 2) Modulare Discovery reichert an: verifiziert (MX), bewertet und ergaenzt
  //    optional aktivierte Zusatzquellen. Bestehende Treffer bleiben erhalten.
  const { findings } = await runDiscovery(domain, contacts.map((contact) => ({
    email: contact.email,
    name: contact.name,
    jobTitle: contact.jobTitle,
    source: contact.source,
  })));

  return {
    domain,
    checkedAt: new Date().toISOString(),
    foundEmails: findings.length,
    contacts: findings.map((finding) => ({
      email: finding.email,
      ansprechpartner: finding.relatedPersonName,
      jobbezeichnung: finding.relatedPersonRole,
      quelle: finding.sourceUrl,
      confidenceScore: finding.confidenceScore,
      sourceType: finding.sourceType,
      isVerified: finding.isVerified,
      isGenerated: finding.isGenerated,
      discoveryMethod: finding.discoveryMethod,
    })),
  };
}

function normalizeCompanyForDomain(company: string) {
  return company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " und ")
    .replace(/\b(gmbh|ag|se|kg|ug|ohg|inc|ltd|llc|co|company|corp|corporation|group|holding|technologies|technology)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function likelyDomains(company: string) {
  const normalized = normalizeCompanyForDomain(company);
  if (!normalized) return [];
  const words = normalized.split(" ").filter((word) => word.length > 1);
  const joined = words.join("");
  const dashed = words.join("-");
  const first = words[0] || "";
  const bases = [...new Set([joined, dashed, first].filter((value) => value.length >= 3))];
  return bases.flatMap((base) => [".com", ".de", ".eu", ".io", ".net"].map((tld) => `${base}${tld}`));
}

async function domainResponds(domain: string) {
  for (const url of [`https://${domain}`, `https://www.${domain}`, `http://${domain}`]) {
    const html = await fetchText(url);
    if (html) return true;
  }
  return false;
}

function extractWebsiteLinks(html: string, baseUrl: string) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const label = stripHtml(match[2] || "");
      const url = absoluteUrl(decodeHtml(match[1]), baseUrl);
      return { url, label };
    })
    .filter(({ url }) => /^https?:\/\//i.test(url))
    .filter(({ url }) => !/itsa365\.de|nuernbergmesse\.de|linkedin\.com|facebook\.com|twitter\.com|instagram\.com|youtube\.com/i.test(url));
}

async function resolveDomainFromProfile(profileUrl: string): Promise<DomainResolution | null> {
  if (!profileUrl || !/^https?:\/\//i.test(profileUrl)) return null;
  const html = await fetchText(profileUrl);
  if (!html) return null;
  const links = extractWebsiteLinks(html, profileUrl);
  const websiteLink = links.find((link) => /website|webseite|homepage|internet/i.test(link.label)) || links[0];
  if (!websiteLink) return null;
  return { domain: cleanDomain(websiteLink.url), source: profileUrl };
}

async function resolveDomainFromCompany(company: string): Promise<DomainResolution | null> {
  for (const domain of likelyDomains(company)) {
    if (await domainResponds(domain)) return { domain, source: "Domain aus Unternehmensname geraten und erreichbar" };
  }
  return null;
}

function cleanSearchResultUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const encoded = url.searchParams.get("uddg");
    if (encoded) return decodeURIComponent(encoded);
    return url.toString();
  } catch {
    return "";
  }
}

function acceptableCompanyWebsite(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return /^https?:$/i.test(parsed.protocol)
      && !/(google|bing|duckduckgo|linkedin|facebook|instagram|youtube|x\.com|twitter|wikipedia|crunchbase|northdata|firmenwissen|kununu|glassdoor|eventbrite|itsa365|nuernbergmesse)/i.test(host);
  } catch {
    return false;
  }
}

async function resolveDomainFromSearch(company: string): Promise<DomainResolution | null> {
  const query = encodeURIComponent(`${company} official website`);
  const html = await fetchText(`https://duckduckgo.com/html/?q=${query}`);
  if (!html) return null;

  const urls = [...html.matchAll(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["']/gi)]
    .map((match) => cleanSearchResultUrl(decodeHtml(match[1])))
    .filter(acceptableCompanyWebsite);

  for (const url of urls.slice(0, 5)) {
    const domain = cleanDomain(url);
    if (domain && await domainResponds(cleanHost(domain))) {
      return { domain, source: "Domain ueber Websuche gefunden" };
    }
  }

  return null;
}

async function resolveDomain(row: DataRow, domainColumn: string, companyColumn: string, columns: string[]): Promise<DomainResolution | null> {
  const existingDomain = cleanDomain(row[domainColumn]);
  if (existingDomain) return { domain: existingDomain, source: "Excel-Domain-Spalte" };

  const profileColumn = findColumn(columns, [/profil.*url/i, /profile.*url/i, /itsa.*url/i, /quelle/i]);
  const profileDomain = await resolveDomainFromProfile(cellText(row[profileColumn]));
  if (profileDomain) return profileDomain;

  const companyDomain = await resolveDomainFromCompany(cellText(row[companyColumn]));
  if (companyDomain) return companyDomain;

  const searchDomain = await resolveDomainFromSearch(cellText(row[companyColumn]));
  if (searchDomain) return searchDomain;

  return null;
}

function ensureColumn(worksheet: ExcelJS.Worksheet, columns: string[], header: string) {
  const existingIndex = columns.indexOf(header);
  if (existingIndex >= 0) return existingIndex + 1;
  const nextIndex = columns.length + 1;
  worksheet.getRow(1).getCell(nextIndex).value = header;
  columns.push(header);
  return nextIndex;
}

function addResultSheet(workbook: ExcelJS.Workbook, rows: EmailFinderResultRow[]) {
  const worksheet = workbook.addWorksheet("Gefundene E-Mails");
  const columns = ["Unternehmensname", "Domain", "Gefundene E-Mails", "Ansprechpartner", "Jobbezeichnung", "Quelle", "Status"];
  worksheet.addRow(columns);
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF635BFF" } };
  rows.forEach((row) => worksheet.addRow([
    row.unternehmensname,
    row.domain,
    row.emails,
    row.ansprechpartner,
    row.jobbezeichnung,
    row.quelle,
    row.status,
  ]));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  worksheet.columns.forEach((column) => { column.width = 26; });
}

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>) {
  let index = 0;
  async function run() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex], currentIndex);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, run));
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function processEmailFinderFile(file: File): Promise<EmailFinderResult> {
  const loaded = await loadWorkbook(file);
  const { workbook, worksheet, rows } = loaded;
  const columns = [...loaded.columns];

  const domainColumn = findColumn(columns, [/^domain$/i, /domain/i, /website/i, /webseite/i, /\burl\b/i, /homepage/i]);
  if (!domainColumn) throw new Error("Keine Domain-/Website-Spalte gefunden. Bitte nennen Sie die Spalte z. B. Domain, Website oder URL.");
  const emailColumn = findColumn(columns, [/^e-?mail$/i, /e-?mail/i, /emailadresse/i, /kontakt.*mail/i], "E-Mail-Adresse");
  const companyColumn = findColumn(columns, [/unternehmen/i, /firma/i, /company/i, /^name$/i, /organisation/i], columns[0]);

  const emailColumnIndex = ensureColumn(worksheet, columns, emailColumn);
  const foundEmailsIndex = ensureColumn(worksheet, columns, "Gefundene E-Mails");
  const foundNameIndex = ensureColumn(worksheet, columns, "Gefundener Ansprechpartner");
  const foundJobIndex = ensureColumn(worksheet, columns, "Gefundene Jobbezeichnung");
  const sourceIndex = ensureColumn(worksheet, columns, "E-Mail Suchquelle");
  const statusIndex = ensureColumn(worksheet, columns, "E-Mail Suchstatus");
  const resolvedDomainIndex = ensureColumn(worksheet, columns, "Gefundene Domain");

  const missingRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !hasEmail(row[emailColumn]));

  const resultRows: EmailFinderResultRow[] = [];

  await runPool(missingRows, async ({ row, index }) => {
    const resolved = await resolveDomain(row, domainColumn, companyColumn, columns);
    const domain = resolved?.domain || "";
    const contacts = domain ? await findEmailsForDomain(domain) : [];
    const emails = contacts.map((contact) => contact.email);
    const first = contacts[0];
    const outputRow = worksheet.getRow(index + 2);

    if (domain) outputRow.getCell(resolvedDomainIndex).value = domain;
    if (emails.length) {
      outputRow.getCell(emailColumnIndex).value = emails[0];
      outputRow.getCell(foundEmailsIndex).value = emails.join("; ");
      outputRow.getCell(foundNameIndex).value = first?.name || "";
      outputRow.getCell(foundJobIndex).value = first?.jobTitle || "";
      outputRow.getCell(sourceIndex).value = first?.source || resolved?.source || "";
      outputRow.getCell(statusIndex).value = "Gefunden";
    } else {
      outputRow.getCell(sourceIndex).value = resolved?.source || "";
      outputRow.getCell(statusIndex).value = domain ? "Keine oeffentliche E-Mail gefunden" : "Keine Domain gefunden";
    }

    resultRows.push({
      unternehmensname: cellText(row[companyColumn]),
      domain,
      emails: emails.join("; "),
      ansprechpartner: first?.name || "",
      jobbezeichnung: first?.jobTitle || "",
      quelle: first?.source || "",
      status: emails.length ? "Gefunden" : "Nicht gefunden",
    });
  });

  const foundRows = resultRows.filter((row) => row.emails);
  const foundWorkbook = new ExcelJS.Workbook();
  foundWorkbook.creator = "Modulary AI Workspace";
  foundWorkbook.created = new Date();
  addResultSheet(foundWorkbook, resultRows);

  worksheet.columns.forEach((column) => { column.width = Math.max(Number(column.width || 14), 18); });
  worksheet.getRow(1).font = { bold: true };

  const baseName = file.name.replace(/\.(xlsx|csv)$/i, "");
  const foundOutput = Buffer.from(await foundWorkbook.xlsx.writeBuffer());
  const updatedOutput = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    foundFileName: `${baseName}-email-suche-${stamp()}.xlsx`,
    updatedFileName: `${baseName}-mit-gefundenen-emails-${stamp()}.xlsx`,
    sheetName: worksheet.name,
    totalRows: rows.length,
    rowsChecked: missingRows.length,
    missingEmailRows: missingRows.length,
    foundCompanies: foundRows.length,
    foundEmails: new Set(foundRows.flatMap((row) => row.emails.split(";").map((email) => email.trim()).filter(Boolean))).size,
    domainColumn,
    emailColumn,
    companyColumn,
    preview: resultRows.slice(0, 12).map((row) => ({
      Unternehmensname: row.unternehmensname,
      Domain: row.domain,
      "Gefundene E-Mails": row.emails,
      Ansprechpartner: row.ansprechpartner,
      Jobbezeichnung: row.jobbezeichnung,
      Quelle: row.quelle,
      Status: row.status,
    })),
    foundDownloadBase64: foundOutput.toString("base64"),
    updatedDownloadBase64: updatedOutput.toString("base64"),
  };
}
