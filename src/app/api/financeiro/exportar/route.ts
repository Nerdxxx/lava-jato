import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatDateTimeBR, isValidDateStr } from "@/lib/time";
import { listExpenses } from "@/modules/finance/expenses";
import { toCsv, toXlsx, type Table } from "@/modules/finance/export";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/modules/finance/payments";
import { listPaymentsInRange } from "@/modules/finance/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "financeiro:ver")) return new NextResponse("Acesso negado", { status: 403 });

  const p = new URL(req.url).searchParams;
  const tipo = p.get("tipo");
  const formato = p.get("formato") === "xlsx" ? "xlsx" : "csv";
  const de = p.get("de") ?? "";
  const ate = p.get("ate") ?? "";
  if ((tipo !== "pagamentos" && tipo !== "despesas") || !isValidDateStr(de) || !isValidDateStr(ate) || de > ate) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }

  const db = await getDb();
  let table: Table;
  if (tipo === "pagamentos") {
    const rows = await listPaymentsInRange(db, de, ate);
    table = {
      name: "Pagamentos",
      headers: ["Data", "OS", "Serviço", "Meio", "Valor", "Situação", "Motivo do estorno"],
      moneyCols: [4],
      rows: rows.map(({ p: pay, osNumber, service }) => [
        formatDateTimeBR(pay.createdAt),
        `OS-${String(osNumber).padStart(5, "0")}`,
        service,
        PAYMENT_METHOD_LABEL[pay.method as PaymentMethod] + (pay.methodLabel ? ` (${pay.methodLabel})` : ""),
        pay.amountCents,
        pay.status === "PAGO" ? "Pago" : "Estornado",
        pay.refundReason,
      ]),
    };
  } else {
    const rows = await listExpenses(db, de, ate);
    table = {
      name: "Despesas",
      headers: ["Data", "Descrição", "Categoria", "Valor", "Situação"],
      moneyCols: [3],
      rows: rows.map(({ e, category }) => [
        e.expenseDate.split("-").reverse().join("/"),
        e.description,
        category,
        e.amountCents,
        e.status === "PAGA" ? "Paga" : e.status === "PENDENTE" ? "Pendente" : "Cancelada",
      ]),
    };
  }

  await db.insert(auditLogs).values({ userId: user.id, action: "finance.export", entity: tipo, details: `${formato} ${de}..${ate}` });
  const filename = `${tipo}-${de}_a_${ate}.${formato}`;
  if (formato === "csv") {
    return new NextResponse(toCsv(table), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
    });
  }
  const buf = await toXlsx(table);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
