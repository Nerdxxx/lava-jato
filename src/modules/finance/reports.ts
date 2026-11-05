import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { expenseCategories, expenses, payments, workOrders } from "@/db/schema";
import { addDays, isValidDateStr, localToUtc } from "@/lib/time";
import { amountDue } from "./payments";

/** Intervalo [de, ate] em dias locais → instantes UTC [início, fim). */
export function dayRange(from: string, to: string): { start: Date; end: Date } | null {
  if (!isValidDateStr(from) || !isValidDateStr(to) || from > to) return null;
  return { start: localToUtc(from, "00:00"), end: localToUtc(addDays(to, 1), "00:00") };
}

export type FinancialSummary = {
  from: string;
  to: string;
  receivedCents: number; // regime de caixa: pagamentos efetivos no período (líquido de estornos)
  refundedCents: number; // estornos feitos no período
  byMethod: { method: string; label: string | null; totalCents: number; count: number }[];
  expensesPaidCents: number;
  expensesPendingCents: number;
  expensesByCategory: { category: string; totalCents: number }[];
  resultCents: number; // recebido - despesas (pagas + pendentes do período, exceto canceladas)
  deliveredCount: number;
  averageTicketCents: number;
  receivableCents: number; // saldo a receber de OS abertas/entregues em aberto (posição atual)
};

export async function getFinancialSummary(db: Database, from: string, to: string): Promise<FinancialSummary | null> {
  const range = dayRange(from, to);
  if (!range) return null;
  const inRange = and(gte(payments.createdAt, range.start), lt(payments.createdAt, range.end));

  const byMethod = await db
    .select({
      method: payments.method,
      label: payments.methodLabel,
      total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(payments)
    .where(and(inRange, eq(payments.status, "PAGO")))
    .groupBy(payments.method, payments.methodLabel);

  const [refunds] = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.status, "ESTORNADO"), gte(payments.refundedAt, range.start), lt(payments.refundedAt, range.end)));

  const expRows = await db
    .select({ category: expenseCategories.name, status: expenses.status, total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int` })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(and(sql`${expenses.expenseDate} >= ${from}`, sql`${expenses.expenseDate} <= ${to}`, ne(expenses.status, "CANCELADA")))
    .groupBy(expenseCategories.name, expenses.status);

  const delivered = await db
    .select({ price: workOrders.priceCents, discount: workOrders.discountCents })
    .from(workOrders)
    .where(and(eq(workOrders.status, "ENTREGUE"), gte(workOrders.deliveredAt, range.start), lt(workOrders.deliveredAt, range.end)));

  const open = await db
    .select({ price: workOrders.priceCents, discount: workOrders.discountCents, id: workOrders.id })
    .from(workOrders)
    .where(and(ne(workOrders.status, "CANCELADO"), ne(workOrders.financialStatus, "PAGO")));
  let receivable = 0;
  if (open.length) {
    const paidRows = await db
      .select({ id: payments.workOrderId, total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(eq(payments.status, "PAGO"))
      .groupBy(payments.workOrderId);
    const paidMap = new Map(paidRows.map((r) => [r.id, r.total]));
    for (const w of open) receivable += Math.max(0, amountDue({ priceCents: w.price, discountCents: w.discount }) - (paidMap.get(w.id) ?? 0));
  }

  const received = byMethod.reduce((s, r) => s + r.total, 0);
  const expPaid = expRows.filter((r) => r.status === "PAGA").reduce((s, r) => s + r.total, 0);
  const expPending = expRows.filter((r) => r.status === "PENDENTE").reduce((s, r) => s + r.total, 0);
  const catMap = new Map<string, number>();
  for (const r of expRows) catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.total);
  const deliveredTotal = delivered.reduce((s, w) => s + amountDue({ priceCents: w.price, discountCents: w.discount }), 0);

  return {
    from,
    to,
    receivedCents: received,
    refundedCents: refunds?.total ?? 0,
    byMethod: byMethod.map((r) => ({ method: r.method, label: r.label, totalCents: r.total, count: r.count })),
    expensesPaidCents: expPaid,
    expensesPendingCents: expPending,
    expensesByCategory: [...catMap.entries()].map(([category, totalCents]) => ({ category, totalCents })).sort((a, b) => b.totalCents - a.totalCents),
    resultCents: received - expPaid - expPending,
    deliveredCount: delivered.length,
    averageTicketCents: delivered.length ? Math.round(deliveredTotal / delivered.length) : 0,
    receivableCents: receivable,
  };
}

export async function listPaymentsInRange(db: Database, from: string, to: string) {
  const range = dayRange(from, to);
  if (!range) return [];
  return db
    .select({ p: payments, osNumber: workOrders.number, service: workOrders.serviceName })
    .from(payments)
    .innerJoin(workOrders, eq(workOrders.id, payments.workOrderId))
    .where(and(gte(payments.createdAt, range.start), lt(payments.createdAt, range.end)))
    .orderBy(desc(payments.createdAt));
}
