import { NextResponse } from "next/server";
import { validateEmail } from "@/features/email-finder/validator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json({ error: "Bitte geben Sie eine E-Mail-Adresse ein." }, { status: 400 });
    }
    const result = await validateEmail(body.email, {
      smtp: body.smtp !== false, // Einzelpruefung: SMTP standardmaessig an
      domainSignals: body.domainSignals !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Validierung ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
