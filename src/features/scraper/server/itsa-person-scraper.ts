import { chromium, type Page } from "playwright-core";
import type { ItsaPerson, ItsaPersonScanResult, ItsaScanPhase } from "@/features/scraper/types";
import {
  acceptItsaCookies,
  isItsaAuthenticatedUrl,
  ITSA_BROWSER_PROFILE_DIR,
  ITSA_LOGIN_URL,
  ITSA_PEOPLE_URL,
} from "@/features/scraper/server/itsa-browser";

const DEFAULT_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const LOGIN_TIMEOUT = 5 * 60_000;
const ALGOLIA_ENDPOINT = "https://4eb6g0v1nt-dsn.algolia.net/1/indexes/prod_website_users_de-de/query";
const ALGOLIA_APP_ID = "4EB6G0V1NT";
const ALGOLIA_API_KEY = "f0416e3d1b38ae3aa789c8750e12bfe5";
const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const PAGE_SIZE = 100;
const MAX_PAGES_PER_QUERY = 10;

type Progress = {
  phase: ItsaScanPhase;
  message: string;
  progress: number;
  totalFound?: number;
};

type Options = {
  visibleBrowser?: boolean;
  limit?: number;
  onProgress?: (progress: Progress) => void;
};

type AlgoliaHit = {
  objectID: string;
  userName?: string;
  function?: string;
  position?: string;
  company?: string;
  country?: string;
  languages?: string[];
  branch?: string;
  division?: string;
  attendence?: string | string[];
  goals?: string[];
  matchinggoals?: string[];
  interests?: string[];
  url?: string;
};

type AlgoliaResult = {
  hits: AlgoliaHit[];
  nbHits: number;
  nbPages: number;
  facets?: Record<string, Record<string, number>>;
};

type SearchBucket = {
  query: string;
  facetFilter?: string;
};

async function ensureLogin(page: Page, visibleBrowser: boolean, onProgress?: Options["onProgress"]) {
  await page.goto(ITSA_PEOPLE_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await acceptItsaCookies(page);
  if (isItsaAuthenticatedUrl(page.url())) return;

  if (!visibleBrowser) {
    throw new Error("Keine gueltige it-sa-Anmeldung gefunden. Bitte zuerst 'Login oeffnen und speichern' verwenden.");
  }

  onProgress?.({
    phase: "waiting-login",
    message: "Bitte melden Sie sich im geoeffneten Browser an. Es werden bis zu 5 Minuten gewartet.",
    progress: 5,
  });
  await page.goto(ITSA_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await acceptItsaCookies(page);
  await page.waitForURL((url) => isItsaAuthenticatedUrl(url.toString()), { timeout: LOGIN_TIMEOUT });
}

async function queryPeopleIndex(
  query: string,
  page: number,
  facetFilter?: string,
  includeFacets = false,
): Promise<AlgoliaResult> {
  const response = await fetch(ALGOLIA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
    },
    body: JSON.stringify({
      query,
      filters: facetFilter ? `site:itsa AND ${facetFilter}` : "site:itsa",
      restrictSearchableAttributes: ["userName"],
      typoTolerance: false,
      hitsPerPage: PAGE_SIZE,
      page,
      facets: includeFacets ? ["country", "branch", "division"] : undefined,
      maxValuesPerFacet: includeFacets ? 1000 : undefined,
      attributesToRetrieve: [
        "objectID",
        "userName",
        "function",
        "position",
        "company",
        "country",
        "languages",
        "branch",
        "division",
        "position",
        "attendence",
        "goals",
        "matchinggoals",
        "interests",
        "url",
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Die it-sa-Personensuche antwortet mit HTTP ${response.status}.`);
  }
  return response.json() as Promise<AlgoliaResult>;
}

function addHits(records: Map<string, AlgoliaHit>, hits: AlgoliaHit[], target: number) {
  for (const hit of hits) {
    if (hit.objectID) records.set(hit.objectID, hit);
    if (records.size >= target) break;
  }
}

async function loadBucket(
  bucket: SearchBucket,
  records: Map<string, AlgoliaHit>,
  target: number,
  includeFacets = false,
) {
  const first = await queryPeopleIndex(bucket.query, 0, bucket.facetFilter, includeFacets);
  addHits(records, first.hits, target);
  const pageCount = Math.min(first.nbPages, MAX_PAGES_PER_QUERY);
  const pageNumbers = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 1);
  const pages = await Promise.all(pageNumbers.map((page) =>
    queryPeopleIndex(bucket.query, page, bucket.facetFilter),
  ));
  for (const result of pages) addHits(records, result.hits, target);
  return first;
}

function escapeFacetValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapPerson(hit: AlgoliaHit): ItsaPerson {
  const profilePath = hit.url?.startsWith("/benutzer/")
    ? `/de-de${hit.url}`
    : hit.url || "/";
  return {
    name: hit.userName?.trim() || "",
    berufsbezeichnung: hit.function?.trim() || hit.position?.trim() || "",
    firma: hit.company?.trim() || "",
    land: hit.country?.trim() || "",
    sprache: (hit.languages || []).join("; "),
    branche: hit.branch?.trim() || "",
    unternehmensbereich: hit.division?.trim() || "",
    beruflicheStellung: hit.position?.trim() || "",
    teilnahme: Array.isArray(hit.attendence) ? hit.attendence.join("; ") : hit.attendence?.trim() || "",
    ziele: (hit.goals || []).join("; "),
    passendeZiele: (hit.matchinggoals || []).join("; "),
    interessen: (hit.interests || []).join("; "),
    profilUrl: new URL(profilePath, "https://www.itsa365.de").toString(),
  };
}

async function collectAllPeople(options: Options) {
  const records = new Map<string, AlgoliaHit>();
  const initial = await loadBucket({ query: "" }, records, Number.MAX_SAFE_INTEGER, true);
  const expectedTotal = initial.nbHits;
  const target = Math.min(options.limit || expectedTotal, expectedTotal);
  if (target <= PAGE_SIZE * MAX_PAGES_PER_QUERY) {
    return { people: [...records.values()].slice(0, target).map(mapPerson), expectedTotal };
  }

  const queue: SearchBucket[] = PREFIX_ALPHABET.map((query) => ({ query }));
  const visited = new Set<string>([""]);

  while (queue.length && records.size < target) {
    const bucket = queue.shift();
    if (!bucket) break;
    const key = `${bucket.facetFilter || ""}|${bucket.query}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const result = await loadBucket(bucket, records, target);
    if (result.nbHits > PAGE_SIZE * MAX_PAGES_PER_QUERY && bucket.query.length < 8) {
      queue.push(...PREFIX_ALPHABET.map((character) => ({
        ...bucket,
        query: `${bucket.query}${character}`,
      })));
    }
    options.onProgress?.({
      phase: "loading-list",
      message: `${records.size} von ${target} Personen aus dem Suchindex geladen.`,
      progress: 15 + Math.min(75, Math.round((records.size / target) * 75)),
      totalFound: records.size,
    });
  }

  const facetBuckets: SearchBucket[] = [];
  for (const [facetName, values] of Object.entries(initial.facets || {})) {
    for (const value of Object.keys(values)) {
      facetBuckets.push({ query: "", facetFilter: `${facetName}:"${escapeFacetValue(value)}"` });
    }
  }

  for (const bucket of facetBuckets) {
    if (records.size >= target) break;
    const result = await loadBucket(bucket, records, target);
    if (result.nbHits > PAGE_SIZE * MAX_PAGES_PER_QUERY) {
      const subBuckets = PREFIX_ALPHABET.map((query) => ({ ...bucket, query }));
      for (const subBucket of subBuckets) {
        if (records.size >= target) break;
        await loadBucket(subBucket, records, target);
      }
    }
    options.onProgress?.({
      phase: "loading-list",
      message: `Vollstaendigkeit wird geprueft: ${records.size} von ${target}.`,
      progress: 92,
      totalFound: records.size,
    });
  }

  if (records.size < target) {
    throw new Error(
      `Der Suchindex meldet ${target} Personen, aber nur ${records.size} konnten eindeutig geladen werden. Der Export wurde zum Schutz vor einer unvollstaendigen Liste abgebrochen.`,
    );
  }

  const people = [...records.values()]
    .slice(0, target)
    .map(mapPerson)
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
  return { people, expectedTotal };
}

export async function scanItsaPeople(options: Options = {}): Promise<ItsaPersonScanResult> {
  const visibleBrowser = Boolean(options.visibleBrowser);
  const context = await chromium.launchPersistentContext(ITSA_BROWSER_PROFILE_DIR, {
    executablePath: process.env.CHROME_PATH || DEFAULT_CHROME_PATH,
    headless: !visibleBrowser,
    locale: "de-DE",
    viewport: { width: 1440, height: 1000 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    options.onProgress?.({ phase: "opening-list", message: "Gespeicherte it-sa-Anmeldung wird geprueft.", progress: 3 });
    await ensureLogin(page, visibleBrowser, options.onProgress);
  } finally {
    await context.close().catch(() => undefined);
  }

  options.onProgress?.({ phase: "loading-list", message: "Vollstaendiger Personenindex wird geladen.", progress: 12 });
  const { people, expectedTotal } = await collectAllPeople(options);
  const result = {
    scannedAt: new Date().toISOString(),
    sourceUrl: ITSA_PEOPLE_URL,
    totalFound: people.length,
    availableTotal: expectedTotal,
    people,
  };
  options.onProgress?.({ phase: "completed", message: "Personen-Scan abgeschlossen.", progress: 100, totalFound: people.length });
  return result;
}
