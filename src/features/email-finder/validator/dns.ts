// DNS-basierte Domain-Pruefungen. Nutzt ausschliesslich node:dns.
// Alle Fehler werden abgefangen und als "unbekannt" (null) bzw. false geliefert.

import { promises as dns } from "node:dns";
import { MX_PROVIDERS } from "./data";

export type DnsResult = {
  domain_exists: boolean | null;
  dns_ok: boolean | null;
  mx_found: boolean;
  mx_record: string | null;
  a_record_fallback: boolean;
  smtp_provider: string | null;
  spf_present: boolean | null;
  dkim_present: boolean | null;
  dmarc_present: boolean | null;
  mta_sts: boolean | null;
};

const DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "dkim", "mail", "s1", "s2"];

async function safe<T>(task: Promise<T>): Promise<T | null> {
  try {
    return await task;
  } catch {
    return null;
  }
}

function detectProvider(mxHosts: string[]): string | null {
  const joined = mxHosts.join(" ").toLowerCase();
  return MX_PROVIDERS.find((provider) => provider.pattern.test(joined))?.name ?? null;
}

async function hasTxt(name: string, matcher: RegExp): Promise<boolean | null> {
  const records = await safe(dns.resolveTxt(name));
  if (records === null) return null;
  return records.some((chunks) => matcher.test(chunks.join("")));
}

export async function checkDns(domain: string): Promise<DnsResult> {
  const mx = await safe(dns.resolveMx(domain));
  const mxHosts = (mx ?? [])
    .sort((left, right) => left.priority - right.priority)
    .map((record) => record.exchange)
    .filter(Boolean);

  const a = await safe(dns.resolve4(domain));
  const aaaa = mxHosts.length ? null : await safe(dns.resolve6(domain));
  const ns = await safe(dns.resolveNs(domain));

  const hasAny = Boolean(mxHosts.length) || Boolean(a?.length) || Boolean(aaaa?.length) || Boolean(ns?.length);
  // Wenn gar keine Aufloesung moeglich war (alle null) -> unbekannt statt false.
  const allNull = mx === null && a === null && aaaa === null && ns === null;
  const domain_exists = allNull ? null : hasAny;

  const mx_found = mxHosts.length > 0;
  const a_record_fallback = !mx_found && Boolean((a?.length ?? 0) || (aaaa?.length ?? 0));

  const spf_present = await hasTxt(domain, /v=spf1/i);
  const dmarc_present = await hasTxt(`_dmarc.${domain}`, /v=DMARC1/i);
  const mta_sts = await hasTxt(`_mta-sts.${domain}`, /v=STSv1/i);

  // DKIM: gaengige Selektoren pruefen (TXT oder CNAME).
  let dkim_present: boolean | null = false;
  let dkimResolvable = false;
  for (const selector of DKIM_SELECTORS) {
    const name = `${selector}._domainkey.${domain}`;
    const txt = await safe(dns.resolveTxt(name));
    if (txt !== null) { dkimResolvable = true; if (txt.some((chunks) => /v=DKIM1|p=/i.test(chunks.join("")))) { dkim_present = true; break; } }
    const cname = await safe(dns.resolveCname(name));
    if (cname !== null && cname.length) { dkimResolvable = true; dkim_present = true; break; }
  }
  if (!dkim_present && !dkimResolvable) dkim_present = null; // nichts pruefbar -> unbekannt

  return {
    domain_exists,
    dns_ok: domain_exists,
    mx_found,
    mx_record: mxHosts[0] ?? null,
    a_record_fallback,
    smtp_provider: detectProvider(mxHosts),
    spf_present,
    dkim_present,
    dmarc_present,
    mta_sts,
  };
}
