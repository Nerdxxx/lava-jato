import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appointments, workOrders } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { addDays, localDateOf, localToUtc } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { getOpenCashRegister } from "@/modules/finance/payments";
import { getFinancialSummary } from "@/modules/finance/reports";
import { OPEN_STATUSES } from "@/modules/operations/state-machine";
import { countLowStock } from "@/modules/inventory/inventory";

export const metadata = { title: "Painel" };
export const dynamic = "force-dynamic";

function Stat({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
  const body = (
    <Card className="space-y-1">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-extrabold text-navy-950">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function AdminHome() {
  const user = await requireStaff();
  const db = await getDb();
  const today = localDateOf(new Date());
  const start = localToUtc(today, "00:00");
  const end = localToUtc(addDays(today, 1), "00:00");

  const [{ n: apptToday } = { n: 0 }] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(appointments)
    .where(and(sql`${appointments.startsAt} >= ${start} AND ${appointments.startsAt} < ${end}`, inArray(appointments.status, ["PENDENTE", "CONFIRMADO", "CONVERTIDO_EM_OS"])));
  const [{ n: inProgress } = { n: 0 }] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(workOrders)
    .where(inArray(workOrders.status, [...OPEN_STATUSES]));
  const [{ n: awaitingPay } = { n: 0 }] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(workOrders)
    .where(and(eq(workOrders.status, "PRONTO_PARA_ENTREGA"), inArray(workOrders.financialStatus, ["PENDENTE", "PARCIAL"])));

  const showMoney = hasPermission(user.role, "financeiro:ver");
  const summary = showMoney ? await getFinancialSummary(db, today, today) : null;
  const month = showMoney ? await getFinancialSummary(db, today.slice(0, 8) + "01", today) : null;
  const cash = hasPermission(user.role, "caixa:operar") ? await getOpenCashRegister(db) : undefined;
  const lowStock = hasPermission(user.role, "estoque:gerir") ? await countLowStock(db) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Olá, {user.name.split(" ")[0]}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agendamentos de hoje" value={String(apptToday)} href="/admin/agenda" />
        <Stat label="OS em andamento" value={String(inProgress)} href="/admin/fila" />
        <Stat label="Prontos aguardando pagamento" value={String(awaitingPay)} href="/admin/os" />
        {cash !== undefined && <Stat label="Caixa" value={cash ? "Aberto" : "Fechado"} href="/admin/caixa" />}
        {summary && <Stat label="Recebido hoje" value={formatBRL(summary.receivedCents)} href="/admin/financeiro" />}
        {summary && <Stat label="OS entregues hoje" value={String(summary.deliveredCount)} />}
        {month && <Stat label="Recebido no mês" value={formatBRL(month.receivedCents)} href="/admin/financeiro" />}
        {lowStock !== null && (
          <Stat label="Produtos para repor" value={String(lowStock)} hint={lowStock > 0 ? "Abaixo do estoque mínimo" : "Estoque em dia"} href="/admin/estoque" />
        )}
        {month && <Stat label="Resultado do mês" value={formatBRL(month.resultCents)} hint="Recebido − despesas" href="/admin/financeiro" />}
      </div>
    </div>
  );
}
