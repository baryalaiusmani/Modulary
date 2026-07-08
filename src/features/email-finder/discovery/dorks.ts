// Baut Suchmaschinen-Abfragen ("Dorks") fuer eine Domain. Die Abfragen sind
// provider-neutral; ausgefuehrt werden sie ausschliesslich ueber offizielle
// Such-APIs (siehe search-providers.ts). Es findet KEIN Scraping von
// Google-/Bing-HTML-Ergebnisseiten statt.

import type { SearchQuery } from "./types";

export function buildDorks(domain: string): SearchQuery[] {
  const d = domain.toLowerCase();
  return [
    { query: `site:${d} "@${d}"`, purpose: "E-Mails auf der Domain" },
    { query: `site:${d} filetype:pdf "@${d}"`, purpose: "E-Mails in PDFs" },
    { query: `site:${d} filetype:docx "@${d}"`, purpose: "E-Mails in Word-Dokumenten" },
    { query: `site:${d} filetype:pptx "@${d}"`, purpose: "E-Mails in Praesentationen" },
    { query: `site:${d} "Kontakt"`, purpose: "Kontaktseiten" },
    { query: `site:${d} "Impressum"`, purpose: "Impressum" },
    { query: `site:${d} "Presse"`, purpose: "Presse" },
    { query: `site:${d} "Marketing"`, purpose: "Marketing-Kontakte" },
    { query: `site:${d} "Sales" OR "Vertrieb"`, purpose: "Vertriebskontakte" },
    { query: `site:${d} "HR" OR "Karriere" OR "Recruiting"`, purpose: "HR-/Recruiting-Kontakte" },
    { query: `"@${d}" -site:${d}`, purpose: "E-Mails der Domain auf externen Seiten" },
  ];
}
