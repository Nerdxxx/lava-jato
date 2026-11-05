import { asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { cashMovements, cashRegisters } from "@/db/schema";
import { getOpenCashRegister, isUniqueViolation, type OpResult } from "./payments";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

type Db = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CashBalance = {
  openingCents: number;
  cashInCents: number; // pagamentos em dinheiro
  suppliesCents: number;
  withdrawalsCents: number;
  refundsCents: number;
  expectedCents: number;
};

export async function getCashBalance(db: Db, registerId: string): Promise<CashBalance | null> {
  const [reg] = await db.select().from(cashRegisters).where(eq(cashRegisters.id, registerId)).limit(1);
  if (!reg) return null;
  const rows = await db
    .select({ type: cashMovements.type, total: sql<number>`COALESCE(SUM(${cashMovements.amountCents}), 0)::int` })
    .from(cashMovements)
    .where(eq(cashMovements.cashRegisterId, registerId))
    .groupBy(cashMovements.type);
  const sum = (t: "PAGAMENTO" | "SUPRIMENTO" | "SANGRIA" | "ESTORNO") => rows.find((r) => r.type === t)?.total ?? 0;
  const b = {
    openingCents: reg.openingCents,
    cashInCents: sum("PAGAMENTO"),
    suppliesCents: sum("SUPRIMENTO"),
    withdrawalsCents: sum("SANGRIA"),
    refundsCents: sum("ESTORNO"),
  };
  return { ...b, expectedCents: b.openingCents + b.cashInCents + b.suppliesCents - b.withdrawalsCents - b.refundsCents };
}

export async function openCashRegister(db: Database, openingCents: number, userId: string): Promise<OpResult<{ id: string }>> {
  if (!Number.isInteger(openingCents) || openingCents < 0 || openingCents > 100_000_00) return fail("Valor de abertura inválido.");
  if (await getOpenCashRegister(db)) return fail("Já existe um caixa aberto.");
  try {
    const [r] = await db.insert(cashRegisters).values({ openedBy: userId, openingCents }).returning({ id: cashRegisters.id });
    return { ok: true, value: { id: r!.id } };
  } catch (e) {
    // Índice único parcial: duas aberturas simultâneas.
    if (isUniqueViolation(e)) return fail("Já existe um caixa aberto.");
    throw e;
  }
}

/** Suprimento (entrada de troco) ou sangria (retirada) do caixa aberto. */
export async function addCashMovement(
  db: Database,
  type: "SUPRIMENTO" | "SANGRIA",
  amountCents: number,
  reason: string,
  userId: string,
): Promise<OpResult<undefined>> {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_00) return fail("Valor inválido.");
  const why = reason.trim();
  if (why.length < 3) return fail("Informe o motivo.");
  return db.transaction(async (tx) => {
    const [reg] = await tx.select().from(cashRegisters).where(sql`${cashRegisters.closedAt} IS NULL`).for("update").limit(1);
    if (!reg) return fail("Não há caixa aberto.");
    if (type === "SANGRIA") {
      const bal = (await getCashBalance(tx, reg.id))!;
      if (amountCents > bal.expectedCents) return fail("A retirada é maior que o saldo em dinheiro do caixa.");
    }
    await tx.insert(cashMovements).values({ cashRegisterId: reg.id, type, amountCents, reason: why.slice(0, 160), createdBy: userId });
    return { ok: true as const, value: undefined };
  });
}

/** Fecha o caixa: grava esperado, contado e diferença. Depois disso fica imutável. */
export async function closeCashRegister(
  db: Database,
  countedCents: number,
  userId: string,
  notes?: string,
): Promise<OpResult<{ id: string; expectedCents: number; differenceCents: number }>> {
  if (!Number.isInteger(countedCents) || countedCents < 0 || countedCents > 100_000_00) return fail("Valor contado inválido.");
  return db.transaction(async (tx) => {
    const [reg] = await tx.select().from(cashRegisters).where(sql`${cashRegisters.closedAt} IS NULL`).for("update").limit(1);
    if (!reg) return fail("Não há caixa aberto.");
    const bal = (await getCashBalance(tx, reg.id))!;
    const diff = countedCents - bal.expectedCents;
    if (diff !== 0 && !(notes ?? "").trim()) return fail("Há diferença no caixa: informe uma observação.");
    await tx
      .update(cashRegisters)
      .set({
        closedAt: new Date(),
        closedBy: userId,
        expectedCents: bal.expectedCents,
        countedCents,
        differenceCents: diff,
        notes: notes?.trim().slice(0, 300) || null,
      })
      .where(eq(cashRegisters.id, reg.id));
    return { ok: true as const, value: { id: reg.id, expectedCents: bal.expectedCents, differenceCents: diff } };
  });
}

export async function listCashMovements(db: Db, registerId: string) {
  return db.select().from(cashMovements).where(eq(cashMovements.cashRegisterId, registerId)).orderBy(asc(cashMovements.createdAt));
}

export async function listCashRegisters(db: Db, limit = 20) {
  return db.select().from(cashRegisters).orderBy(desc(cashRegisters.openedAt)).limit(limit);
}
