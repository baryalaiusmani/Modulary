import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import type { ItsaExhibitor } from "@/features/scraper/types";

export const runtime = "nodejs";

function isExhibitor(value: unknown): value is ItsaExhibitor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ItsaExhibitor>;
  return typeof candidate.unternehmensname === "string"
    && typeof candidate.domain === "string"
    && typeof candidate.ansprechpartner === "string"
    && typeof candidate.email === "string"
    && typeof candidate.profilUrl === "string";
}

function buildFileName(prefix: string) {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  return `${prefix}_${stamp}.xlsx`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const exhibitors = Array.isArray(body?.exhibitors) ? body.exhibitors : [];
    const scope = body?.scope === "all" ? "alle" : "neue";

    if (!exhibitors.every(isExhibitor)) {
      return NextResponse.json({ error: "Die Ausstellerdaten konnten nicht exportiert werden." }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Modulary AI Workspace";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("it-sa 2026");
    worksheet.columns = [
      { header: "Unternehmensname", key: "unternehmensname", width: 42 },
      { header: "Domain", key: "domain", width: 34 },
      { header: "Ansprechpartner", key: "ansprechpartner", width: 28 },
      { header: "E-Mail-Adresse", key: "email", width: 34 },
      { header: "it-sa Profil-URL", key: "profilUrl", width: 64 },
      { header: "Erstmals gesehen", key: "firstSeenAt", width: 22 },
      { header: "Zuletzt gesehen", key: "lastSeenAt", width: 22 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF635BFF" } };
    worksheet.getRow(1).alignment = { vertical: "middle" };

    for (const exhibitor of exhibitors) {
      worksheet.addRow({
        unternehmensname: exhibitor.unternehmensname,
        domain: exhibitor.domain,
        ansprechpartner: exhibitor.ansprechpartner,
        email: exhibitor.email,
        profilUrl: exhibitor.profilUrl,
        firstSeenAt: exhibitor.firstSeenAt,
        lastSeenAt: exhibitor.lastSeenAt,
      });
    }

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, exhibitors.length + 1), column: worksheet.columns.length },
    };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = buildFileName(`itsa2026_${scope}_aussteller`);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Der Excel-Export ist fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
