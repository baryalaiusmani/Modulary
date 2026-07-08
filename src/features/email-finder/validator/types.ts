// Typen fuer den EmailValidator.
//
// Grundsatz: Es wird nie falsche Sicherheit vorgetaeuscht. Signale, die nicht
// eindeutig ermittelbar sind, sind `null` (= unbekannt) statt `false`. SMTP-
// und Reputationsergebnisse werden ehrlich als accepted/rejected/blocked/
// timeout/unknown dokumentiert.

export type SmtpCheck =
  | "accepted"
  | "rejected"
  | "blocked"
  | "timeout"
  | "greylisted"
  | "smtp_error"
  | "skipped"
  | "unknown";

export type FinalStatus = "gültig" | "ungültig" | "riskant" | "unbekannt";
export type VerdictSimple = "gültig" | "ungültig" | "manuell_prüfen";

export type PublicSource = {
  url: string;
  first_seen: string | null;
  last_seen: string | null;
};

/**
 * Vollstaendiges Einzelergebnis. Feldnamen bewusst in snake_case, weil sie
 * exakt der vereinbarten API-/Export-Struktur entsprechen.
 */
export type EmailValidationResult = {
  original_email: string;
  normalized_email: string;

  // Syntax
  syntax_ok: boolean;
  syntax_reason: string;
  did_you_mean: string | null;
  gibberish_localpart: boolean;

  // DNS / Domain
  domain_exists: boolean | null;
  dns_ok: boolean | null;
  mx_found: boolean | null;
  mx_record: string | null;
  a_record_fallback: boolean | null;

  // SMTP
  smtp_server_reachable: boolean | null;
  smtp_provider: string | null;
  smtp_check: SmtpCheck;

  // Mailbox
  mailbox_exists: boolean | null;
  mailbox_full: boolean | null;
  account_disabled: boolean | null;
  alias_detected: boolean | null;

  // Catch-all
  catch_all: boolean | null;

  // Adresstyp
  disposable: boolean;
  long_term_disposable: boolean | null;
  free_or_webmail: boolean;
  role_based: boolean;

  // Risiko / Reputation
  spamtrap_risk: boolean | null;
  abuse_risk: boolean | null;
  toxic_risk: boolean | null;
  suppression_risk: boolean | null;
  high_risk_domain: boolean;
  subdomain_mailer_risk: boolean;
  immature_domain: boolean | null;
  tld_risk: boolean;
  invalid_tld: boolean;

  // Domain-Zusatzsignale
  website_exists: boolean | null;
  registrant_company: string | null;
  spf_present: boolean | null;
  dkim_present: boolean | null;
  dmarc_present: boolean | null;
  tls_or_mta_sts_signal: boolean | null;

  // Oeffentliche Sichtbarkeit
  public_sources_found: boolean;
  public_sources_count: number;
  public_sources_details: PublicSource[];

  // Aktivitaet / Engagement (nur verfuegbar mit externen Feeds -> i. d. R. null)
  activity_signal: boolean | null;
  engagement_signal: boolean | null;
  bot_risk: boolean | null;

  // Bewertung
  reason_codes: string[];
  confidence_score: number; // 0..100
  detail_status: string;
  final_status: FinalStatus;
  verdict_simple: VerdictSimple;
};

export type ValidationOptions = {
  /** SMTP-Pruefung (Port 25) durchfuehren. Langsam und oft blockiert. */
  smtp?: boolean;
  /** WHOIS/RDAP + Website-Check durchfuehren. */
  domainSignals?: boolean;
};

// --- Bulk ---------------------------------------------------------------

export type BulkRowResult = EmailValidationResult & {
  duplicate_email: boolean;
  row_without_email: boolean;
};

export type BulkSummary = {
  total: number;
  gültig: number;
  ungültig: number;
  riskant: number;
  unbekannt: number;
  catch_all: number;
  disposable: number;
  role_based: number;
  spamtrap_risk: number;
  abuse_risk: number;
  toxic_risk: number;
  duplicate: number;
  rows_without_email: number;
  percent: { gültig: number; ungültig: number; riskant: number; unbekannt: number };
};

export type BulkResult = {
  fileName: string;
  emailColumn: string;
  candidateColumns: string[];
  totalRows: number;
  summary: BulkSummary;
  preview: Record<string, unknown>[];
  downloadBase64: string; // vollstaendige Ergebnisdatei (xlsx)
};
