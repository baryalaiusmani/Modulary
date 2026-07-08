// Domain-Zusatzsignale ohne API-Key: RDAP (moderner WHOIS-Nachfolger, JSON via
// HTTP) fuer Registrierungsdatum + Registrant, plus einfacher Website-Check.
// Alles best-effort; nicht ermittelbare Werte bleiben null (= unbekannt).

import { fetchJson, fetchText } from "../discovery/http";

const IMMATURE_DAYS = 180;

type RdapEvent = { eventAction?: string; eventDate?: string };
type RdapEntity = { roles?: string[]; vcardArray?: unknown };
type RdapResponse = { events?: RdapEvent[]; entities?: RdapEntity[] };

export type DomainSignals = {
  website_exists: boolean | null;
  registrant_company: string | null;
  immature_domain: boolean | null;
  created_at: string | null;
};

function extractOrg(entity: RdapEntity): string | null {
  // vcardArray = ["vcard", [ ["version",...], ["fn",{},"text","Name"], ["org",{},"text","Firma"] ]]
  const vcard = Array.isArray(entity.vcardArray) ? (entity.vcardArray[1] as unknown[]) : null;
  if (!Array.isArray(vcard)) return null;
  const find = (key: string) => {
    const entry = vcard.find((item) => Array.isArray(item) && item[0] === key) as unknown[] | undefined;
    return entry && typeof entry[3] === "string" ? (entry[3] as string) : null;
  };
  return find("org") ?? find("fn");
}

export async function checkDomainSignals(domain: string): Promise<DomainSignals> {
  const result: DomainSignals = {
    website_exists: null, registrant_company: null, immature_domain: null, created_at: null,
  };

  // Website-Check (parallel unkritisch, hier sequenziell fuer Einfachheit).
  const site = await fetchText(`https://${domain}`, 8000);
  const siteWww = site ? "" : await fetchText(`https://www.${domain}`, 8000);
  result.website_exists = Boolean(site || siteWww);

  const rdap = await fetchJson<RdapResponse>(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  if (rdap) {
    const registration = rdap.events?.find((event) => /registration/i.test(event.eventAction ?? ""));
    if (registration?.eventDate) {
      result.created_at = registration.eventDate;
      const ageDays = (Date.now() - new Date(registration.eventDate).getTime()) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(ageDays)) result.immature_domain = ageDays < IMMATURE_DAYS;
    }
    const registrant = rdap.entities?.find((entity) => entity.roles?.some((role) => /registrant/i.test(role)));
    if (registrant) result.registrant_company = extractOrg(registrant);
  }

  return result;
}
