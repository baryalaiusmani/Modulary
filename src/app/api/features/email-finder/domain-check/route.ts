import { NextResponse } from "next/server";
import { checkDomainForEmails } from "@/features/email-finder/server/processor";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body.domain !== "string") {
      return NextResponse.json({ error: "Bitte geben Sie eine Domain ein." }, { status: 400 });
    }

    return NextResponse.json(await checkDomainForEmails(body.domain));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Der Domain Check ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
