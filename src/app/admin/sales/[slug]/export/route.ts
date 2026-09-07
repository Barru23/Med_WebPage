import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { getSalesExport } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendent",
  paid: "Pagat",
  cancelled: "Cancel·lat",
  refunded: "Reemborsat",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // No layout runs above a route handler, so the buyer list is guarded here.
  if (!(await isAdmin())) return new NextResponse("No autoritzat", { status: 401 });

  const { slug } = await params;
  const edition = req.nextUrl.searchParams.get("edition") ?? undefined;

  const data = await getSalesExport(slug, edition);
  if (!data) return new NextResponse("Not found", { status: 404 });
  const { activity, fields, rows } = data;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(activity.title_ca.slice(0, 31));

  sheet.columns = [
    { header: "Comprador", key: "buyer_name", width: 24 },
    { header: "Email", key: "buyer_email", width: 26 },
    { header: "Telèfon", key: "buyer_phone", width: 14 },
    { header: "Modalitat", key: "variant_name", width: 18 },
    { header: "Quantitat", key: "quantity", width: 10 },
    { header: "Codi", key: "ticket_code", width: 10 },
    { header: "Estat", key: "status", width: 12 },
    { header: "Recollit / Check-in", key: "checked_in_at", width: 18 },
    { header: "Data compra", key: "created_at", width: 18 },
    ...fields.map((f) => ({ header: f.label_ca, key: f.id, width: 18 })),
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    let answers: Record<string, string> = {};
    if (row.field_answers_json) {
      try {
        answers = JSON.parse(row.field_answers_json);
      } catch {
        answers = {};
      }
    }
    sheet.addRow({
      buyer_name: row.buyer_name,
      buyer_email: row.buyer_email,
      buyer_phone: row.buyer_phone ?? "",
      variant_name: row.variant_name,
      quantity: row.quantity,
      ticket_code: row.ticket_code,
      status: STATUS_LABELS[row.status] ?? row.status,
      checked_in_at: row.checked_in_at ?? "",
      created_at: row.created_at,
      ...Object.fromEntries(fields.map((f) => [f.id, answers[f.id] ?? ""])),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${slug}${edition ? `-${edition}` : ""}.xlsx`.replace(/[^a-z0-9.-]+/gi, "-");

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
