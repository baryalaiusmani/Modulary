// Certificate Transparency (crt.sh): findet kostenlos und ohne API-Key
// Subdomains einer Domain. Subdomains liefern oft weitere Kontaktseiten
// (z. B. karriere.firma.de, presse.firma.de), die dann gecrawlt werden koennen.
//
// Diese Quelle liefert selbst keine E-Mails, sondern zusaetzliche Subdomains.

import { fetchJson } from "../http";

type CrtEntry = { name_value?: string };

export async function findSubdomains(domain: string): Promise<string[]> {
  const clean = domain.toLowerCase();
  const data = await fetchJson<CrtEntry[]>(`https://crt.sh/?q=%25.${encodeURIComponent(clean)}&output=json`);
  if (!Array.isArray(data)) return [];

  const hosts = new Set<string>();
  for (const entry of data) {
    for (const raw of String(entry.name_value ?? "").split(/\n+/)) {
      const host = raw.trim().toLowerCase().replace(/^\*\./, "");
      if (host.endsWith(`.${clean}`) && !host.includes(" ")) hosts.add(host);
    }
  }
  return [...hosts].slice(0, 25);
}
