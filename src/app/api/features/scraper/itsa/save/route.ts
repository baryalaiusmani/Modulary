import { NextResponse } from "next/server";
import type { ItsaExhibitor } from "@/features/scraper/types";
import { mergeKnownExhibitors } from "@/features/scraper/server/itsa-store";

export const runtime = "nodejs";

function isExhibitor(value: unknown): value is ItsaExhibitor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ItsaExhibitor>;
  return typeof candidate.unternehmensname === "string"
    && typeof candidate.profilUrl === "string"
    && typeof candidate.domain === "string"
    && typeof candidate.ansprechpartner === "string"
    && typeof candidate.email === "string"
    && typeof candidate.firstSeenAt === "string"
    && typeof candidate.lastSeenAt === "string";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const exhibitors = Array.isArray(body?.exhibitors) ? body.exhibitors : [];
    if (!exhibitors.every(isExhibitor)) {
      return NextResponse.json({ error: "Die Ausstellerdaten konnten nicht gespeichert werden." }, { status: 400 });
    }

    const saved = await mergeKnownExhibitors(exhibitors);
    return NextResponse.json({ savedCount: exhibitors.length, totalKnown: saved.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Aussteller konnten nicht gespeichert werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
