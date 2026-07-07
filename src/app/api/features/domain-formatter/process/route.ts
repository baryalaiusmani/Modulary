import { NextResponse } from "next/server";
import type { DomainFormatMode } from "@/features/domain-formatter/types";
import { formatDomainFile } from "@/features/domain-formatter/server/processor";

export const runtime = "nodejs";

const modes = new Set<DomainFormatMode>(["https-www", "www", "plain"]);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = formData.get("mode");

    if (!(file instanceof File) || typeof mode !== "string" || !modes.has(mode as DomainFormatMode)) {
      return NextResponse.json({ error: "Datei und Domain-Format sind erforderlich." }, { status: 400 });
    }

    return NextResponse.json(await formatDomainFile(file, mode as DomainFormatMode));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Domains konnten nicht formatiert werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
