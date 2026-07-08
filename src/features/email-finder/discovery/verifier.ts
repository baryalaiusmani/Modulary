// Prueft E-Mail-Syntax und die MX-Records einer Domain. Nutzt ausschliesslich
// die Node-Standardbibliothek (dns), kein SMTP-Probing (das waere unzuverlaessig
// und wird von vielen Providern blockiert). Catch-All-Erkennung bleibt daher
// bewusst offen (null), kann aber spaeter ergaenzt werden.

import { promises as dns } from "node:dns";
import type { DomainVerification, EmailVerifier } from "./types";

const STRICT_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export class DnsEmailVerifier implements EmailVerifier {
  private cache = new Map<string, Promise<DomainVerification>>();

  isValidSyntax(email: string): boolean {
    return STRICT_EMAIL.test(email.trim());
  }

  verifyDomain(domain: string): Promise<DomainVerification> {
    const key = domain.toLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = this.resolve(key);
    this.cache.set(key, promise);
    return promise;
  }

  private async resolve(domain: string): Promise<DomainVerification> {
    const syntaxOk = STRICT_EMAIL.test(`info@${domain}`);
    try {
      const records = await dns.resolveMx(domain);
      const mxHosts = records
        .sort((left, right) => left.priority - right.priority)
        .map((record) => record.exchange)
        .filter(Boolean);
      return { domain, syntaxOk, hasMx: mxHosts.length > 0, mxHosts, isCatchAll: null };
    } catch {
      return { domain, syntaxOk, hasMx: false, mxHosts: [], isCatchAll: null };
    }
  }
}
