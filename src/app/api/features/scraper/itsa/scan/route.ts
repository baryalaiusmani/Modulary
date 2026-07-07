import { NextResponse } from "next/server";
import { getItsaScanJob, startItsaScanJob } from "@/features/scraper/server/itsa-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body.url !== "string") {
      return NextResponse.json({ error: "Bitte geben Sie eine it-sa-URL ein." }, { status: 400 });
    }

    return NextResponse.json(startItsaScanJob(body.url, Boolean(body.visibleBrowser)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Der it-sa-Scan ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Job-ID fehlt." }, { status: 400 });
  }

  const job = getItsaScanJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Scan-Job wurde nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json(job);
}
