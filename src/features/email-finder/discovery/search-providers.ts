// Adapter fuer offizielle Such-APIs. Jeder Adapter ist nur "configured", wenn
// die zugehoerigen Umgebungsvariablen (API-Keys) gesetzt sind. Ohne Key bleibt
// der Adapter inaktiv -- es wird niemals HTML von Google/Bing gescraped.
//
// Benoetigte ENV-Variablen (jeweils optional):
//   GOOGLE_CSE_KEY + GOOGLE_CSE_ID   -> Google Programmable Search
//   BING_SEARCH_KEY                  -> Bing Web Search v7
//   BRAVE_SEARCH_KEY                 -> Brave Search API
//   SERPAPI_KEY                      -> SerpAPI

import type { SearchProvider, SearchResult } from "./types";

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class GoogleCseProvider implements SearchProvider {
  readonly name = "google-cse";
  private key = process.env.GOOGLE_CSE_KEY ?? "";
  private cx = process.env.GOOGLE_CSE_ID ?? "";

  isConfigured(): boolean {
    return Boolean(this.key && this.cx);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = `https://www.googleapis.com/customsearch/v1?key=${this.key}&cx=${this.cx}&num=${Math.min(limit, 10)}&q=${encodeURIComponent(query)}`;
    const data = (await fetchJson(url)) as { items?: Array<{ link?: string; title?: string; snippet?: string }> } | null;
    return (data?.items ?? []).map((item) => ({
      url: item.link ?? "",
      title: item.title ?? "",
      snippet: item.snippet ?? "",
    })).filter((result) => result.url);
  }
}

export class BingSearchProvider implements SearchProvider {
  readonly name = "bing";
  private key = process.env.BING_SEARCH_KEY ?? "";

  isConfigured(): boolean {
    return Boolean(this.key);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = `https://api.bing.microsoft.com/v7.0/search?count=${limit}&q=${encodeURIComponent(query)}`;
    const data = (await fetchJson(url, { "Ocp-Apim-Subscription-Key": this.key })) as
      | { webPages?: { value?: Array<{ url?: string; name?: string; snippet?: string }> } }
      | null;
    return (data?.webPages?.value ?? []).map((item) => ({
      url: item.url ?? "",
      title: item.name ?? "",
      snippet: item.snippet ?? "",
    })).filter((result) => result.url);
  }
}

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  private key = process.env.BRAVE_SEARCH_KEY ?? "";

  isConfigured(): boolean {
    return Boolean(this.key);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = `https://api.search.brave.com/res/v1/web/search?count=${limit}&q=${encodeURIComponent(query)}`;
    const data = (await fetchJson(url, { "X-Subscription-Token": this.key, Accept: "application/json" })) as
      | { web?: { results?: Array<{ url?: string; title?: string; description?: string }> } }
      | null;
    return (data?.web?.results ?? []).map((item) => ({
      url: item.url ?? "",
      title: item.title ?? "",
      snippet: item.description ?? "",
    })).filter((result) => result.url);
  }
}

export class SerpApiProvider implements SearchProvider {
  readonly name = "serpapi";
  private key = process.env.SERPAPI_KEY ?? "";

  isConfigured(): boolean {
    return Boolean(this.key);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!this.isConfigured()) return [];
    const url = `https://serpapi.com/search.json?engine=google&num=${limit}&api_key=${this.key}&q=${encodeURIComponent(query)}`;
    const data = (await fetchJson(url)) as { organic_results?: Array<{ link?: string; title?: string; snippet?: string }> } | null;
    return (data?.organic_results ?? []).map((item) => ({
      url: item.link ?? "",
      title: item.title ?? "",
      snippet: item.snippet ?? "",
    })).filter((result) => result.url);
  }
}

/** Liefert den ersten konfigurierten Provider oder null. */
export function resolveSearchProvider(): SearchProvider | null {
  const providers: SearchProvider[] = [
    new GoogleCseProvider(),
    new BingSearchProvider(),
    new BraveSearchProvider(),
    new SerpApiProvider(),
  ];
  return providers.find((provider) => provider.isConfigured()) ?? null;
}
