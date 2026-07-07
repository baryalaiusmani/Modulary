import { NextResponse } from "next/server";
import { inspectExcelColumns } from "@/features/excel/server/list-compare";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Datei ist erforderlich." }, { status: 400 });
    }

    return NextResponse.json(await inspectExcelColumns(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Spalten konnten nicht gelesen werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
