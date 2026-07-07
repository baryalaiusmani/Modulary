import { NextResponse } from "next/server";
import { processEmailFinderFile } from "@/features/email-finder/server/processor";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Bitte laden Sie eine Excel- oder CSV-Datei hoch." }, { status: 400 });
    }

    return NextResponse.json(await processEmailFinderFile(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die E-Mail-Suche ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
