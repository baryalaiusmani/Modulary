// GitHub-Quelle: durchsucht oeffentlichen Code nach E-Mails der Domain.
// Nutzt die offizielle GitHub Code-Search-API und benoetigt dafuer einen
// Token (ENV: GITHUB_TOKEN). Ohne Token bleibt die Quelle inaktiv.

import type { EmailFinding, OsintSource } from "../types";
import { fetchJson } from "../http";
import { extractEmailsFromText } from "../text";

type CodeSearchResponse = {
  items?: Array<{ html_url?: string; repository?: { full_name?: string } }>;
};

export class GithubSource implements OsintSource {
  readonly name = "github";
  readonly method = "github-search" as const;
  private token = process.env.GITHUB_TOKEN ?? "";

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async find(domain: string): Promise<EmailFinding[]> {
    if (!this.isConfigured()) return [];
    const url = `https://api.github.com/search/code?per_page=10&q=${encodeURIComponent(`"@${domain}"`)}`;
    const data = await fetchJson<CodeSearchResponse>(url, {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.text-match+json",
    });
    const now = new Date().toISOString();
    const findings: EmailFinding[] = [];

    for (const item of data?.items ?? []) {
      const sourceUrl = item.html_url ?? "";
      // Code-Snippets kommen ueber text-matches; hier konservativ nur Domain-Kontext.
      const context = item.repository?.full_name ?? sourceUrl;
      for (const email of extractEmailsFromText(context)) {
        if (!email.endsWith(`@${domain}`)) continue;
        findings.push({
          email,
          domain,
          sourceUrl,
          sourceType: "github",
          foundOn: now,
          confidenceScore: 45,
          isVerified: false,
          isGenerated: false,
          relatedPersonName: "",
          relatedPersonRole: "",
          evidenceText: `Oeffentliche GitHub-Quelle: ${context}`,
          discoveryMethod: "github-search",
        });
      }
    }
    return findings;
  }
}
