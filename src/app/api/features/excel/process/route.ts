import { NextResponse } from "next/server";
import { compareExcelLists } from "@/features/excel/server/list-compare";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const oldFile = formData.get("oldFile");
    const newFile = formData.get("newFile");
    const comparePairs = formData.get("comparePairs");

    if (!(oldFile instanceof File) || !(newFile instanceof File)) {
      return NextResponse.json({ error: "Alte und neue Liste sind erforderlich." }, { status: 400 });
    }

    return NextResponse.json(await compareExcelLists(oldFile, newFile, typeof comparePairs === "string" ? comparePairs : ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Dateien konnten nicht verglichen werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
