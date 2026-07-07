import fs from "node:fs/promises";
import path from "node:path";
import type { ItsaExhibitor } from "@/features/scraper/types";

const STORE_DIR = path.resolve(process.cwd(), "data", "itsa-scraper");
const KNOWN_EXHIBITORS_PATH = path.join(STORE_DIR, "known-exhibitors.json");

export function normalizeCompanyKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "und")
    .replace(/\b(gmbh|ag|se|kg|ug|inc|ltd|llc|bv|sarl|corp|corporation|company|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function exhibitorKey(exhibitor: Pick<ItsaExhibitor, "unternehmensname" | "profilUrl">) {
  const profileSlug = exhibitor.profilUrl.match(/\/aussteller\/([^/?#]+)/i)?.[1];
  return profileSlug || normalizeCompanyKey(exhibitor.unternehmensname);
}

export async function readKnownExhibitors() {
  try {
    const content = await fs.readFile(KNOWN_EXHIBITORS_PATH, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed as ItsaExhibitor[] : [];
  } catch {
    return [];
  }
}

export async function saveKnownExhibitors(exhibitors: ItsaExhibitor[]) {
  await fs.mkdir(STORE_DIR, { recursive: true });
  const ordered = [...exhibitors].sort((left, right) =>
    left.unternehmensname.localeCompare(right.unternehmensname, "de"),
  );
  await fs.writeFile(KNOWN_EXHIBITORS_PATH, JSON.stringify(ordered, null, 2), "utf8");
  return ordered;
}

export async function mergeKnownExhibitors(nextExhibitors: ItsaExhibitor[]) {
  const existing = await readKnownExhibitors();
  const byKey = new Map(existing.map((exhibitor) => [exhibitorKey(exhibitor), exhibitor]));

  for (const next of nextExhibitors) {
    const key = exhibitorKey(next);
    const previous = byKey.get(key);
    byKey.set(key, {
      ...previous,
      ...next,
      firstSeenAt: previous?.firstSeenAt || next.firstSeenAt,
      lastSeenAt: next.lastSeenAt,
    });
  }

  return saveKnownExhibitors([...byKey.values()]);
}
