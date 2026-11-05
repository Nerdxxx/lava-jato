import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { cashMovements, cashRegisters, payments, workOrders } from "@/db/schema";

export type OpResult<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type FinancialStatus = "PENDENTE" | "PARCIAL" | "PAGO" | "ESTORNADO" | "CANCELADO";

export const PAYMENT_METHODS = ["DINHEIRO", "PIX", "DEBITO", "CREDITO", "OUTRO"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  DEBITO: "Cartão de débito",
  CREDITO: "Cartão de crédito",
  OUTRO: "Outro",
};
export const FINANCIAL_STATUS_LABEL: Record<FinancialStatus, string> = {
  PENDENTE: "Pendente",
  PARCIAL: "Parcial",
  PAGO: "Pago",
  ESTORNADO: "Estornado",
  CANCELADO: "Cancelado",
};

/** Valor a cobrar de uma OS: preço contratado (snapshot) menos o desconto autorizado. */
export function amountDue(wo: { priceCents: number; discountCents: number }): number {
  return Math.max(0, wo.priceCents - wo.discountCents);
}

/** Status financeiro derivado. Função pura: única fonte da regra. */
export function deriveFinancialStatus(input: {
  dueCents: number;
  paidCents: number;
  hasRefund: boolean;
  cancelled: boolean;
}): FinancialStatus {
  if (input.cancelled) return "CANCELADO";
  if (input.dueCents === 0) return "PAGO";
  if (input.paidCents >= input.dueCents) return "PAGO";
  if (input.paidCents > 0) return "PARCIAL";
  return input.hasRefund ? "ESTORNADO" : "PENDENTE";
}

/** Recalcula e grava o status financeiro da OS (dentro de uma transação). */
export async function recomputeFinancialStatus(tx: Tx, workOrderId: string): Promise<FinancialStatus> {
  const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) throw new Error("OS inexistente");
  const rows = await tx.select({ status: payments.status, amount: payments.amountCents }).from(payments).where(eq(payments.workOrderId, workOrderId));
  const paid = rows.filter((r) => r.status === "PAGO").reduce((s, r) => s + r.amount, 0);
  const status = deriveFinancialStatus({
    dueCents: amountDue(wo),
    paidCents: paid,
    hasRefund: rows.some((r) => r.status === "ESTORNADO"),
    cancelled: wo.status === "CANCELADO",
  });
  if (status !== wo.financialStatus) await tx.update(workOrders).set({ financialStatus: status }).where(eq(workOrders.id, workOrderId));
  return status;
}

export async function getOpenCashRegister(db: Database | Tx) {
  const [r] = await db.select().from(cashRegisters).where(sql`${cashRegisters.closedAt} IS NULL`).limit(1);
  return r ?? null;
}

const entrySchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountCents: z.number().int().positive().max(100_000_00),
  methodLabel: z.string().trim().max(40).optional(),
  transactionRef: z.string().trim().max(80).optional(),
});
export type PaymentEntry = z.input<typeof entrySchema>;

export type PaymentSummary = { dueCents: number; paidCents: number; remainingCents: number };

export async function getPaymentSummary(db: Database | Tx, workOrderId: string): Promise<PaymentSummary | null> {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) return null;
  const [agg] = await db
    .select({ paid: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.workOrderId, workOrderId), eq(payments.status, "PAGO")));
  const due = amountDue(wo);
  const paid = agg?.paid ?? 0;
  return { dueCents: due, paidCents: paid, remainingCents: Math.max(0, due - paid) };
}

/**
 * Registra um ou mais pagamentos (pagamento dividido) de uma OS, tudo-ou-nada.
 * - A soma não pode ultrapassar o saldo (sem pagamento a maior).
 * - Dinheiro exige caixa aberto e gera movimento de caixa.
 * - `idempotencyKey` protege contra reenvio do mesmo formulário.
 */
export async function recordPayments(
  db: Database,
  workOrderId: string,
  entries: PaymentEntry[],
  userId: string,
  idempotencyKey?: string,
): Promise<OpResult<{ status: FinancialStatus; paymentIds: string[] }>> {
  const parsed = z.array(entrySchema).min(1).max(5).safeParse(entries);
  if (!parsed.success) return fail("Informe ao menos um pagamento com valor válido.");
  const list = parsed.data;
  if (list.some((e) => e.method === "OUTRO" && !e.methodLabel)) return fail("Descreva o meio de pagamento \"Outro\".");
  const keyFor = (i: number) => (idempotencyKey ? `${idempotencyKey.slice(0, 56)}:${i}` : null);

  try {
    return await db.transaction(async (tx) => {
      if (idempotencyKey) {
        const dup = await tx.select().from(payments).where(eq(payments.idempotencyKey, keyFor(0)!)).limit(1);
        if (dup.length) {
          const [wo0] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
          return { ok: true as const, value: { status: wo0!.financialStatus, paymentIds: [dup[0]!.id] } };
        }
      }
      // Trava a linha da OS: dois recebimentos simultâneos não ultrapassam o saldo.
      const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).for("update").limit(1);
      if (!wo) return fail("Ordem de serviço não encontrada.");
      if (wo.status === "CANCELADO") return fail("A OS está cancelada.");
      const summary = (await getPaymentSummary(tx, workOrderId))!;
      const total = list.reduce((s, e) => s + e.amountCents, 0);
      if (total > summary.remainingCents) return fail("O valor informado é maior que o saldo a receber.");

      const needsCash = list.some((e) => e.method === "DINHEIRO");
      const register = needsCash ? await getOpenCashRegister(tx) : null;
      if (needsCash && !register) return fail("Abra o caixa antes de receber em dinheiro.");

      const ids: string[] = [];
      for (const [i, e] of list.entries()) {
        const [p] = await tx
          .insert(payments)
          .values({
            workOrderId,
            method: e.method,
            methodLabel: e.method === "OUTRO" ? e.methodLabel : null,
            amountCents: e.amountCents,
            transactionRef: e.transactionRef || null,
            cashRegisterId: e.method === "DINHEIRO" ? register!.id : null,
            idempotencyKey: keyFor(i),
            receivedBy: userId,
          })
          .returning({ id: payments.id });
        ids.push(p!.id);
        if (e.method === "DINHEIRO") {
          await tx.insert(cashMovements).values({
            cashRegisterId: register!.id,
            type: "PAGAMENTO",
            amountCents: e.amountCents,
            paymentId: p!.id,
            createdBy: userId,
          });
        }
      }
      const status = await recomputeFinancialStatus(tx, workOrderId);
      return { ok: true as const, value: { status, paymentIds: ids } };
    });
  } catch (e) {
    // Violação da chave de idempotência em corrida: o outro pedido já registrou.
    if (isUniqueViolation(e)) {
      return fail("Este pagamento já foi registrado.");
    }
    throw e;
  }
}

/** Estorno (devolução) de um pagamento. Em dinheiro, sai do caixa aberto. */
export async function refundPayment(
  db: Database,
  paymentId: string,
  reason: string,
  userId: string,
): Promise<OpResult<{ status: FinancialStatus }>> {
  const why = reason.trim();
  if (why.length < 3) return fail("Informe o motivo do estorno.");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update").limit(1);
    if (!p) return fail("Pagamento não encontrado.");
    if (p.status === "ESTORNADO") return fail("Este pagamento já foi estornado.");
    let registerId: string | null = null;
    if (p.method === "DINHEIRO") {
      const register = await getOpenCashRegister(tx);
      if (!register) return fail("Abra o caixa para estornar um pagamento em dinheiro.");
      registerId = register.id;
    }
    await tx
      .update(payments)
      .set({ status: "ESTORNADO", refundedAt: new Date(), refundedBy: userId, refundReason: why.slice(0, 300) })
      .where(eq(payments.id, paymentId));
    if (registerId) {
      await tx.insert(cashMovements).values({
        cashRegisterId: registerId,
        type: "ESTORNO",
        amountCents: p.amountCents,
        reason: why.slice(0, 160),
        paymentId: p.id,
        createdBy: userId,
      });
    }
    const status = await recomputeFinancialStatus(tx, p.workOrderId);
    return { ok: true as const, value: { status } };
  });
}

/** Drizzle encapsula o erro do driver em `cause`; procura o SQLSTATE 23505 nos dois níveis. */
export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (typeof x === "object" && x ? (x as { code?: string }).code : undefined);
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}
