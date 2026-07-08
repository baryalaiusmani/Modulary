import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import type { ItsaPerson } from "@/features/scraper/types";

export const runtime = "nodejs";

function isPerson(value: unknown): value is ItsaPerson {
  if (!value || typeof value !== "object") return false;
  const person = value as Partial<ItsaPerson>;
  return [
    "name",
    "berufsbezeichnung",
    "firma",
    "land",
    "sprache",
    "branche",
    "unternehmensbereich",
    "beruflicheStellung",
    "teilnahme",
    "ziele",
    "passendeZiele",
    "interessen",
    "profilUrl",
  ]
    .every((key) => typeof person[key as keyof ItsaPerson] === "string");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const people = Array.isArray(body?.people) ? body.people : [];
    const scope = body?.scope === "filtered" ? "gefiltert" : "gesamt";
    if (!people.length || !people.every(isPerson)) {
      return NextResponse.json({ error: "Es sind keine gueltigen Personendaten vorhanden." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Modulary AI Workspace";
    const sheet = workbook.addWorksheet("it-sa Personen");
    sheet.columns = [
      { header: "Name", key: "name", width: 30 },
      { header: "Berufsbezeichnung", key: "berufsbezeichnung", width: 38 },
      { header: "Firma", key: "firma", width: 36 },
      { header: "Land", key: "land", width: 22 },
      { header: "Sprache", key: "sprache", width: 20 },
      { header: "Branche", key: "branche", width: 38 },
      { header: "Unternehmensbereich", key: "unternehmensbereich", width: 34 },
      { header: "Berufliche Stellung", key: "beruflicheStellung", width: 36 },
      { header: "Teilnahme", key: "teilnahme", width: 24 },
      { header: "Ziele", key: "ziele", width: 52 },
      { header: "Passende Ziele", key: "passendeZiele", width: 52 },
      { header: "Interessen", key: "interessen", width: 58 },
      { header: "URL", key: "profilUrl", width: 64 },
    ];
    people.forEach((person: ItsaPerson) => sheet.addRow(person));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF172554" } };
    sheet.autoFilter = { from: "A1", to: `M${people.length + 1}` };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getColumn("ziele").alignment = { wrapText: true, vertical: "top" };
    sheet.getColumn("passendeZiele").alignment = { wrapText: true, vertical: "top" };
    sheet.getColumn("interessen").alignment = { wrapText: true, vertical: "top" };

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="itsa365_personen_${scope}_${stamp}.xlsx"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Der Excel-Export ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
