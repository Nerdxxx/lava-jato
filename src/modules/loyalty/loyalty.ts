import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { businessSettings, customers, loyaltyTransactions, payments, workOrders } from "@/db/schema";
import { amountDue, recomputeFinancialStatus } from "@/modules/finance/payments";

export type OpResult<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Conn = Database | Tx;

export interface LoyaltyConfig {
  enabled: boolean;
  /** Lavagens (pontos) necessárias para um resgate. */
  visitsRequired: number;
  /** Desconto do resgate em % do valor do serviço (100 = lavagem grátis). */
  rewardPercent: number;
}

export const DEFAULT_LOYALTY: LoyaltyConfig = { enabled: false, visitsRequired: 10, rewardPercent: 100 };
const KEY = "loyalty";

const configSchema = z.object({
  enabled: z.boolean(),
  visitsRequired: z.number().int().min(2, "Mínimo de 2 lavagens.").max(100, "Máximo de 100 lavagens."),
  rewardPercent: z.number().int().min(5, "Desconto mínimo de 5%.").max(100, "Desconto máximo de 100%."),
});

export async function loadLoyaltyConfig(db: Conn): Promise<LoyaltyConfig> {
  const [row] = await db.select().from(businessSettings).where(eq(businessSettings.key, KEY)).limit(1);
  const parsed = configSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...DEFAULT_LOYALTY };
}

export async function saveLoyaltyConfig(db: Database, raw: LoyaltyConfig): Promise<OpResult<LoyaltyConfig>> {
  const p = configSchema.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  await db
    .insert(businessSettings)
    .values({ key: KEY, value: p.data })
    .onConflictDoUpdate({ target: businessSettings.key, set: { value: p.data, updatedAt: new Date() } });
  return { ok: true, value: p.data };
}

export async function getBalance(db: Conn, customerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COALESCE(SUM(${loyaltyTransactions.points}), 0)::int` })
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.customerId, customerId));
  return row?.n ?? 0;
}

/** Resgate ativo na OS (RESGATE sem ESTORNO_RESGATE correspondente). */
export async function getActiveRedemption(db: Conn, workOrderId: string) {
  const rows = await db
    .select()
    .from(loyaltyTransactions)
    .where(and(eq(loyaltyTransactions.workOrderId, workOrderId), inArray(loyaltyTransactions.kind, ["RESGATE", "ESTORNO_RESGATE"])))
    .orderBy(desc(loyaltyTransactions.createdAt));
  const net = rows.reduce((s, r) => s + r.points, 0);
  if (net >= 0) return null;
  const last = rows.find((r) => r.kind === "RESGATE");
  return last ? { points: -last.points, discountCents: last.discountCents ?? 0 } : null;
}

/** Pontua a OS entregue (chamado na transação da entrega). OS com resgate ou valor zero não pontua. */
export async function earnOnDelivery(
  tx: Tx,
  wo: { id: string; customerId: string; priceCents: number; discountCents: number },
  userId: string | null,
): Promise<boolean> {
  const cfg = await loadLoyaltyConfig(tx);
  if (!cfg.enabled || amountDue(wo) <= 0) return false;
  if (await getActiveRedemption(tx, wo.id)) return false;
  const rows = await tx
    .insert(loyaltyTransactions)
    .values({ customerId: wo.customerId, workOrderId: wo.id, kind: "GANHO", points: 1, reason: "Lavagem entregue", createdBy: userId })
    .onConflictDoNothing()
    .returning({ id: loyaltyTransactions.id });
  return rows.length > 0;
}

/** Resgata o prêmio de fidelidade como desconto na OS. */
export async function redeemOnWorkOrder(db: Database, workOrderId: string, userId: string): Promise<OpResult<{ discountCents: number }>> {
  const cfg = await loadLoyaltyConfig(db);
  if (!cfg.enabled) return fail("O programa de fidelidade está desativado.");
  try {
    const discount = await db.transaction(async (tx) => {
      const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).for("update");
      if (!wo) throw new Error("Ordem de serviço não encontrada.");
      if (wo.status === "ENTREGUE" || wo.status === "CANCELADO") throw new Error("A OS já foi encerrada.");
      if (await getActiveRedemption(tx, wo.id)) throw new Error("Esta OS já tem um resgate de fidelidade.");
      // Trava o cliente: resgates simultâneos em OS diferentes não podem gastar o mesmo saldo.
      await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, wo.customerId)).for("update");
      const balance = await getBalance(tx, wo.customerId);
      if (balance < cfg.visitsRequired) throw new Error(`Saldo insuficiente: ${balance} de ${cfg.visitsRequired} pontos.`);
      const reward = Math.round((wo.priceCents * cfg.rewardPercent) / 100);
      const d = Math.min(reward, wo.priceCents - wo.discountCents);
      if (d <= 0) throw new Error("A OS não tem valor a descontar.");
      const [{ paid } = { paid: 0 }] = await tx
        .select({ paid: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int` })
        .from(payments)
        .where(and(eq(payments.workOrderId, wo.id), eq(payments.status, "PAGO")));
      if (paid > wo.priceCents - wo.discountCents - d) throw new Error("A OS já tem pagamento acima do valor com o resgate. Estorne antes.");
      await tx.update(workOrders).set({ discountCents: wo.discountCents + d }).where(eq(workOrders.id, wo.id));
      await tx.insert(loyaltyTransactions).values({
        customerId: wo.customerId,
        workOrderId: wo.id,
        kind: "RESGATE",
        points: -cfg.visitsRequired,
        discountCents: d,
        reason: `Resgate de ${cfg.rewardPercent}%`,
        createdBy: userId,
      });
      await recomputeFinancialStatus(tx, wo.id);
      return d;
    });
    return { ok: true, value: { discountCents: discount } };
  } catch (e) {
    if (e instanceof Error && !("code" in e)) return fail(e.message);
    throw e;
  }
}

/**
 * Desfaz o resgate: devolve os pontos e (se a OS ainda está aberta) remove o desconto.
 * Usado manualmente e, dentro da transação, ao cancelar a OS.
 */
export async function reverseRedemptionTx(tx: Tx, workOrderId: string, userId: string | null, reason: string): Promise<boolean> {
  const active = await getActiveRedemption(tx, workOrderId);
  if (!active) return false;
  const [wo] = await tx.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) return false;
  await tx.insert(loyaltyTransactions).values({
    customerId: wo.customerId,
    workOrderId,
    kind: "ESTORNO_RESGATE",
    points: active.points,
    discountCents: active.discountCents,
    reason: reason.slice(0, 160),
    createdBy: userId,
  });
  if (wo.status !== "CANCELADO" && wo.status !== "ENTREGUE") {
    await tx
      .update(workOrders)
      .set({ discountCents: Math.max(0, wo.discountCents - active.discountCents) })
      .where(eq(workOrders.id, workOrderId));
    await recomputeFinancialStatus(tx, workOrderId);
  }
  return true;
}

export async function undoRedemption(db: Database, workOrderId: string, userId: string): Promise<OpResult<undefined>> {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) return fail("Ordem de serviço não encontrada.");
  if (wo.status === "ENTREGUE" || wo.status === "CANCELADO") return fail("A OS já foi encerrada.");
  const active = await getActiveRedemption(db, workOrderId);
  if (!active) return fail("Esta OS não tem resgate ativo.");
  const [{ paid } = { paid: 0 }] = await db
    .select({ paid: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.workOrderId, wo.id), eq(payments.status, "PAGO")));
  if (paid > 0 && active.discountCents > 0 && wo.priceCents - (wo.discountCents - active.discountCents) < paid) {
    return fail("Não é possível desfazer: valor pago incompatível.");
  }
  const done = await db.transaction((tx) => reverseRedemptionTx(tx, workOrderId, userId, "Resgate desfeito"));
  return done ? { ok: true, value: undefined } : fail("Esta OS não tem resgate ativo.");
}

/** Ajuste manual (somente administrador), com motivo. */
export async function adjustPoints(db: Database, customerId: string, points: number, reason: string, userId: string): Promise<OpResult<number>> {
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 1000) return fail("Quantidade de pontos inválida.");
  const why = reason.trim();
  if (why.length < 3) return fail("Informe o motivo do ajuste.");
  const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) return fail("Cliente não encontrado.");
  const balance = await getBalance(db, customerId);
  if (balance + points < 0) return fail("O ajuste deixaria o saldo negativo.");
  await db.insert(loyaltyTransactions).values({ customerId, kind: "AJUSTE", points, reason: why.slice(0, 160), createdBy: userId });
  return { ok: true, value: balance + points };
}

export async function listTransactions(db: Database, customerId: string, limit = 30) {
  return db
    .select({ t: loyaltyTransactions, woNumber: workOrders.number })
    .from(loyaltyTransactions)
    .leftJoin(workOrders, eq(workOrders.id, loyaltyTransactions.workOrderId))
    .where(eq(loyaltyTransactions.customerId, customerId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limit);
}

export async function topCustomers(db: Database, limit = 50) {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      balance: sql<number>`SUM(${loyaltyTransactions.points})::int`,
    })
    .from(loyaltyTransactions)
    .innerJoin(customers, eq(customers.id, loyaltyTransactions.customerId))
    .groupBy(customers.id)
    .having(sql`SUM(${loyaltyTransactions.points}) > 0`)
    .orderBy(desc(sql`SUM(${loyaltyTransactions.points})`))
    .limit(limit);
}

export const LOYALTY_KIND_LABEL = { GANHO: "Lavagem", RESGATE: "Resgate", ESTORNO_RESGATE: "Resgate desfeito", AJUSTE: "Ajuste" } as const;
