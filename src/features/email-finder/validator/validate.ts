// Orchestrator fuer die Einzelvalidierung. Fuehrt alle Pruefungen zusammen und
// leitet daraus reason_codes, confidence_score, detail_status, final_status und
// verdict_simple ab.
//
// Leitprinzipien:
//  - Catch-all wird NIE als eindeutig gueltig gewertet.
//  - Unentscheidbare Faelle (Timeout, Greylisting, Blockade) sind "unbekannt",
//    niemals "gueltig".
//  - Signale ohne Datenquelle bleiben null (unbekannt), nicht false.

import type { EmailValidationResult, FinalStatus, PublicSource, ValidationOptions, VerdictSimple } from "./types";
import { normalizeEmail, checkSyntax, suggestCorrection, isGibberish, classify } from "./normalize";
import { checkDns } from "./dns";
import { probeSmtp } from "./smtp";
import { checkDomainSignals } from "./rdap";
import { resolveSearchProvider } from "../discovery/search-providers";

async function findPublicSources(email: string): Promise<PublicSource[]> {
  const provider = resolveSearchProvider();
  if (!provider) return [];
  try {
    const results = await provider.search(`"${email}"`, 5);
    return results.map((result) => ({ url: result.url, first_seen: null, last_seen: null }));
  } catch {
    return [];
  }
}

function computeStatus(r: EmailValidationResult): { final: FinalStatus; verdict: VerdictSimple; detail: string } {
  // 1) Harte Ungueltigkeit.
  if (!r.syntax_ok) return { final: "ungültig", verdict: "ungültig", detail: `Syntaxfehler: ${r.syntax_reason}` };
  if (r.invalid_tld) return { final: "ungültig", verdict: "ungültig", detail: "Ungueltige TLD" };
  if (r.domain_exists === false) return { final: "ungültig", verdict: "ungültig", detail: "Domain existiert nicht" };
  if (r.mx_found === false && r.a_record_fallback === false) {
    return { final: "ungültig", verdict: "ungültig", detail: "Kein MX-/A-Record - nicht zustellbar" };
  }
  if (r.smtp_check === "rejected" || r.mailbox_exists === false) {
    return { final: "ungültig", verdict: "ungültig", detail: "Mailserver lehnt Empfaenger ab" };
  }

  // 2) Qualitaets-/Risikoflags.
  const risky =
    r.catch_all === true || r.mailbox_full === true || r.disposable || r.long_term_disposable === true ||
    r.role_based || r.high_risk_domain || r.tld_risk || r.subdomain_mailer_risk || r.immature_domain === true ||
    r.spamtrap_risk === true || r.abuse_risk === true || r.toxic_risk === true || r.suppression_risk === true;

  // 3) Eindeutig zustellbar (SMTP akzeptiert, kein Catch-all).
  // mailbox_exists === false ist oben bereits ausgeschlossen.
  if (r.smtp_check === "accepted" && r.catch_all !== true) {
    if (risky) return { final: "riskant", verdict: "manuell_prüfen", detail: "Zustellbar, aber mit Qualitaetsrisiko" };
    return { final: "gültig", verdict: "gültig", detail: "SMTP akzeptiert den Empfaenger" };
  }

  // 4) Risiko ohne eindeutige Zustellbarkeit.
  if (risky) {
    const why = r.catch_all === true ? "Catch-all-Domain" : r.disposable ? "Wegwerf-Adresse" : r.role_based ? "Rollen-Adresse" : "Qualitaetsrisiko";
    return { final: "riskant", verdict: "manuell_prüfen", detail: why };
  }

  // 5) Nicht entscheidbar.
  const smtpReason = r.smtp_check === "skipped" ? "SMTP-Pruefung nicht durchgefuehrt"
    : r.smtp_check === "blocked" ? "SMTP-Port blockiert"
    : r.smtp_check === "timeout" ? "SMTP-Timeout"
    : r.smtp_check === "greylisted" ? "Greylisting - spaeter erneut pruefen"
    : "Keine eindeutige SMTP-Antwort";
  return { final: "unbekannt", verdict: "manuell_prüfen", detail: smtpReason };
}

function computeConfidence(r: EmailValidationResult): number {
  let score = 50;
  if (!r.syntax_ok || r.invalid_tld) return 2;
  if (r.domain_exists === false) return 3;
  if (r.mx_found === false && r.a_record_fallback === false) return 5;
  if (r.mx_found) score += 12;
  if (r.spf_present) score += 4;
  if (r.dmarc_present) score += 4;
  if (r.smtp_check === "accepted") score += 25;
  if (r.smtp_check === "rejected") return 5;
  if (r.smtp_check === "blocked" || r.smtp_check === "timeout" || r.smtp_check === "skipped") score -= 10;
  if (r.catch_all === true) score -= 25;
  if (r.disposable) score -= 30;
  if (r.role_based) score -= 8;
  if (r.high_risk_domain || r.tld_risk) score -= 15;
  if (r.gibberish_localpart) score -= 15;
  if (r.immature_domain === true) score -= 10;
  if (r.website_exists) score += 4;
  if (r.public_sources_found) score += 6;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function collectReasonCodes(r: EmailValidationResult): string[] {
  const codes: string[] = [];
  if (!r.syntax_ok) codes.push("SYNTAX_INVALID");
  if (r.invalid_tld) codes.push("INVALID_TLD");
  if (r.did_you_mean) codes.push("POSSIBLE_TYPO");
  if (r.gibberish_localpart) codes.push("GIBBERISH_LOCALPART");
  if (r.domain_exists === false) codes.push("DOMAIN_NOT_FOUND");
  if (r.mx_found === false && r.a_record_fallback === false) codes.push("NO_MX");
  if (r.mx_found === false && r.a_record_fallback) codes.push("A_RECORD_FALLBACK");
  if (r.smtp_check === "accepted") codes.push("SMTP_ACCEPTED");
  if (r.smtp_check === "rejected") codes.push("SMTP_REJECTED");
  if (r.smtp_check === "blocked") codes.push("SMTP_BLOCKED");
  if (r.smtp_check === "timeout") codes.push("SMTP_TIMEOUT");
  if (r.smtp_check === "greylisted") codes.push("GREYLISTED");
  if (r.smtp_check === "skipped") codes.push("SMTP_SKIPPED");
  if (r.catch_all === true) codes.push("CATCH_ALL");
  if (r.mailbox_full === true) codes.push("MAILBOX_FULL");
  if (r.account_disabled === true) codes.push("ACCOUNT_DISABLED");
  if (r.disposable) codes.push("DISPOSABLE");
  if (r.long_term_disposable === true) codes.push("LONG_TERM_DISPOSABLE");
  if (r.free_or_webmail) codes.push("FREE_WEBMAIL");
  if (r.role_based) codes.push("ROLE_BASED");
  if (r.high_risk_domain) codes.push("HIGH_RISK_DOMAIN");
  if (r.tld_risk) codes.push("TLD_RISK");
  if (r.subdomain_mailer_risk) codes.push("SUBDOMAIN_MAILER");
  if (r.immature_domain === true) codes.push("IMMATURE_DOMAIN");
  if (r.spf_present === false) codes.push("NO_SPF");
  if (r.dmarc_present === false) codes.push("NO_DMARC");
  return codes;
}

export async function validateEmail(rawEmail: string, options: ValidationOptions = {}): Promise<EmailValidationResult> {
  const runSmtp = options.smtp ?? true;
  const runDomainSignals = options.domainSignals ?? true;

  const normalized = normalizeEmail(rawEmail);
  const syntax = checkSyntax(normalized);
  const cls = classify(normalized);

  // Basis-Ergebnis mit ehrlichen Defaults (unbekannt = null).
  const result: EmailValidationResult = {
    original_email: normalized.original,
    normalized_email: normalized.normalized,
    syntax_ok: syntax.ok,
    syntax_reason: syntax.reason,
    did_you_mean: null,
    gibberish_localpart: false,
    domain_exists: null,
    dns_ok: null,
    mx_found: null,
    mx_record: null,
    a_record_fallback: null,
    smtp_server_reachable: null,
    smtp_provider: null,
    smtp_check: "skipped",
    mailbox_exists: null,
    mailbox_full: null,
    account_disabled: null,
    alias_detected: null,
    catch_all: null,
    disposable: cls.disposable,
    long_term_disposable: cls.long_term_disposable,
    free_or_webmail: cls.free_or_webmail,
    role_based: cls.role_based,
    spamtrap_risk: null,
    abuse_risk: null,
    toxic_risk: null,
    suppression_risk: null,
    high_risk_domain: cls.high_risk_domain,
    subdomain_mailer_risk: cls.subdomain_mailer_risk,
    immature_domain: null,
    tld_risk: cls.tld_risk,
    invalid_tld: syntax.invalidTld,
    website_exists: null,
    registrant_company: null,
    spf_present: null,
    dkim_present: null,
    dmarc_present: null,
    tls_or_mta_sts_signal: null,
    public_sources_found: false,
    public_sources_count: 0,
    public_sources_details: [],
    activity_signal: null, // keine externe Datenquelle -> ehrlich unbekannt
    engagement_signal: null,
    bot_risk: null,
    reason_codes: [],
    confidence_score: 0,
    detail_status: "",
    final_status: "unbekannt",
    verdict_simple: "manuell_prüfen",
  };

  if (syntax.ok) {
    result.did_you_mean = suggestCorrection(normalized);
    result.gibberish_localpart = isGibberish(normalized.local);

    const dns = await checkDns(normalized.domain);
    result.domain_exists = dns.domain_exists;
    result.dns_ok = dns.dns_ok;
    result.mx_found = dns.mx_found;
    result.mx_record = dns.mx_record;
    result.a_record_fallback = dns.a_record_fallback;
    result.smtp_provider = dns.smtp_provider;
    result.spf_present = dns.spf_present;
    result.dkim_present = dns.dkim_present;
    result.dmarc_present = dns.dmarc_present;
    result.tls_or_mta_sts_signal = dns.mta_sts;

    const deliverableDns = dns.domain_exists !== false && (dns.mx_found || dns.a_record_fallback);

    if (runDomainSignals) {
      const signals = await checkDomainSignals(normalized.domain);
      result.website_exists = signals.website_exists;
      result.registrant_company = signals.registrant_company;
      result.immature_domain = signals.immature_domain;
    }

    if (runSmtp && deliverableDns && dns.mx_record) {
      const probe = await probeSmtp(dns.mx_record, normalized.normalized, normalized.domain);
      result.smtp_server_reachable = probe.reachable;
      result.smtp_check = probe.check;
      result.catch_all = probe.catch_all;
      result.mailbox_full = probe.mailbox_full;
      result.account_disabled = probe.account_disabled;
      result.mailbox_exists = probe.check === "accepted" ? (probe.catch_all === true ? null : true) : probe.check === "rejected" ? false : null;
    } else if (!runSmtp) {
      result.smtp_check = "skipped";
    }

    const sources = await findPublicSources(normalized.normalized);
    result.public_sources_details = sources;
    result.public_sources_count = sources.length;
    result.public_sources_found = sources.length > 0;
  }

  const status = computeStatus(result);
  result.final_status = status.final;
  result.verdict_simple = status.verdict;
  result.detail_status = status.detail;
  result.reason_codes = collectReasonCodes(result);
  result.confidence_score = computeConfidence(result);
  return result;
}
