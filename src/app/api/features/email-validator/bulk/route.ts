import { NextResponse } from "next/server";
import { processBulkValidation } from "@/features/email-finder/validator";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Bitte laden Sie eine Datei hoch (.xlsx, .csv oder .txt)." }, { status: 400 });
    }
    // SMTP fuer Bulk optional (langsam/oft blockiert), Standard aus.
    const smtp = formData.get("smtp") === "true";
    const result = await processBulkValidation(file, { smtp, domainSignals: true });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Bulk-Validierung ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
