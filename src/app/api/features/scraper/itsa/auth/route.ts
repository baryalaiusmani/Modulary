import { NextResponse } from "next/server";
import { getItsaAuthJob, startItsaAuthJob } from "@/features/scraper/server/itsa-auth-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.action !== "check" && body?.action !== "login") {
      return NextResponse.json({ error: "Unbekannte Login-Aktion." }, { status: 400 });
    }
    return NextResponse.json(startItsaAuthJob(body.action));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Login-Aktion konnte nicht gestartet werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Job-ID fehlt." }, { status: 400 });
  const job = getItsaAuthJob(jobId);
  if (!job) return NextResponse.json({ error: "Login-Job wurde nicht gefunden." }, { status: 404 });
  return NextResponse.json(job);
}
