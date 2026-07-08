// Fuehrt Treffer aus mehreren Quellen zusammen (Deduplizierung) und berechnet
// einen Confidence Score anhand nachvollziehbarer Faktoren.

import type { DomainVerification, EmailFinding } from "./types";

// Basiswert je Quelle (0..100), bevor weitere Faktoren einfliessen.
const SOURCE_BASE: Record<EmailFinding["sourceType"], number> = {
  website: 75,
  document: 65,
  search: 55,
  certificate: 40,
  github: 45,
  wayback: 40,
  pattern_generated: 20,
  other: 45,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Fuehrt mehrere Findings zur gleichen E-Mail zusammen. Der zusammengefuehrte
 * Treffer behaelt die "staerkste" Quelle und sammelt Belege.
 */
export function mergeFindings(findings: EmailFinding[]): Array<EmailFinding & { occurrences: number }> {
  const merged = new Map<string, EmailFinding & { occurrences: number }>();

  for (const finding of findings) {
    const key = finding.email.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...finding, occurrences: 1 });
      continue;
    }
    existing.occurrences += 1;
    // Bestaetigte (nicht generierte) Quelle gewinnt immer gegen generierte.
    if (existing.isGenerated && !finding.isGenerated) {
      merged.set(key, { ...finding, occurrences: existing.occurrences });
      continue;
    }
    // Ansonsten die Quelle mit hoeherem Basiswert bevorzugen.
    if (!finding.isGenerated && SOURCE_BASE[finding.sourceType] > SOURCE_BASE[existing.sourceType]) {
      merged.set(key, { ...finding, occurrences: existing.occurrences });
    }
    // Namen/Rollen ergaenzen, falls bisher leer.
    const winner = merged.get(key)!;
    winner.relatedPersonName ||= finding.relatedPersonName;
    winner.relatedPersonRole ||= finding.relatedPersonRole;
  }

  return [...merged.values()];
}

/** Berechnet den finalen Confidence Score fuer einen zusammengefuehrten Treffer. */
export function scoreFinding(
  finding: EmailFinding & { occurrences: number },
  verification: DomainVerification | null,
): EmailFinding {
  let score = SOURCE_BASE[finding.sourceType];

  if (finding.occurrences > 1) score += Math.min(15, (finding.occurrences - 1) * 6); // mehrfach gefunden
  if (finding.relatedPersonRole) score += 8; // Rolle erkannt
  if (finding.relatedPersonName) score += 4; // Person zugeordnet
  if (verification?.hasMx) score += 12; // MX gueltig
  if (verification && !verification.hasMx) score -= 20; // keine MX -> unzustellbar

  if (finding.isGenerated) {
    // Generierte Adressen bleiben klar im unteren Bereich, egal was sonst gilt.
    score = Math.min(score, verification?.hasMx ? 45 : 30);
  }

  const isVerified = Boolean(verification?.hasMx) && !finding.isGenerated && finding.sourceType === "website";

  return { ...finding, confidenceScore: clamp(score), isVerified };
}
