import { NextResponse } from "next/server";
import { getItsaPersonScanJob, startItsaPersonScanJob } from "@/features/scraper/server/itsa-person-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? body.limit : undefined;
    return NextResponse.json(startItsaPersonScanJob(Boolean(body.visibleBrowser), limit));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Der Personen-Scan konnte nicht gestartet werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Job-ID fehlt." }, { status: 400 });
  const job = getItsaPersonScanJob(jobId);
  if (!job) return NextResponse.json({ error: "Scan-Job wurde nicht gefunden." }, { status: 404 });
  return NextResponse.json(job);
}
