import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { inventoryItems, inventoryMovements, serviceConsumptionRules, services, workOrders } from "@/db/schema";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";

export type OpResult<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const INVENTORY_UNITS = ["un", "ml", "l", "g", "kg", "m"] as const;
export const MOVEMENT_LABEL = { ENTRADA: "Entrada", SAIDA: "Saída", AJUSTE: "Ajuste (contagem)", CONSUMO_OS: "Consumo em OS" } as const;

const MAX_QTY = 100_000_000;

const itemSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto.").max(80),
  unit: z.enum(INVENTORY_UNITS, { message: "Unidade inválida." }),
  minQuantity: z.number().int("Use números inteiros.").min(0).max(MAX_QTY).default(0),
  initialQuantity: z.number().int("Use números inteiros.").min(0).max(MAX_QTY).default(0),
});

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    if ((cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export async function createItem(db: Database, raw: z.input<typeof itemSchema>, userId: string): Promise<OpResult<{ id: string }>> {
  const p = itemSchema.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  try {
    const id = await db.transaction(async (tx) => {
      const [item] = await tx
        .insert(inventoryItems)
        .values({ name: p.data.name, unit: p.data.unit, minQuantity: p.data.minQuantity, quantity: p.data.initialQuantity })
        .returning({ id: inventoryItems.id });
      if (p.data.initialQuantity > 0) {
        await tx.insert(inventoryMovements).values({
          itemId: item!.id,
          type: "ENTRADA",
          delta: p.data.initialQuantity,
          balanceAfter: p.data.initialQuantity,
          reason: "Saldo inicial",
          createdBy: userId,
        });
      }
      return item!.id;
    });
    return { ok: true, value: { id } };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("Já existe um produto com esse nome.");
    throw e;
  }
}

export async function updateItem(
  db: Database,
  itemId: string,
  patch: { minQuantity?: number; active?: boolean; name?: string },
): Promise<OpResult<undefined>> {
  const set: Partial<typeof inventoryItems.$inferInsert> = {};
  if (patch.minQuantity !== undefined) {
    if (!Number.isInteger(patch.minQuantity) || patch.minQuantity < 0 || patch.minQuantity > MAX_QTY) return fail("Estoque mínimo inválido.");
    set.minQuantity = patch.minQuantity;
  }
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n.length < 2 || n.length > 80) return fail("Nome inválido.");
    set.name = n;
  }
  try {
    const rows = await db.update(inventoryItems).set(set).where(eq(inventoryItems.id, itemId)).returning({ id: inventoryItems.id });
    return rows.length ? { ok: true, value: undefined } : fail("Produto não encontrado.");
  } catch (e) {
    if (isUniqueViolation(e)) return fail("Já existe um produto com esse nome.");
    throw e;
  }
}

const movementSchema = z.object({
  itemId: z.string().uuid(),
  type: z.enum(["ENTRADA", "SAIDA", "AJUSTE"]),
  /** ENTRADA/SAIDA: quantidade movimentada (> 0). AJUSTE: quantidade contada (>= 0). */
  quantity: z.number().int("Use números inteiros.").min(0).max(MAX_QTY),
  reason: z.string().trim().max(160).optional(),
});

/** Movimentação manual. Saída nunca deixa o saldo negativo; ajuste grava a diferença para a contagem. */
export async function recordMovement(
  db: Database,
  raw: z.input<typeof movementSchema>,
  userId: string,
): Promise<OpResult<{ balance: number }>> {
  const p = movementSchema.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const { itemId, type, quantity } = p.data;
  if (type !== "AJUSTE" && quantity <= 0) return fail("Informe uma quantidade maior que zero.");
  if (type === "AJUSTE" && !p.data.reason) return fail("Informe o motivo do ajuste.");
  if (type === "SAIDA" && !p.data.reason) return fail("Informe o motivo da saída.");

  try {
    const balance = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).for("update");
      if (!item) throw new Error("NOT_FOUND");
      if (!item.active) throw new Error("INACTIVE");
      const delta = type === "ENTRADA" ? quantity : type === "SAIDA" ? -quantity : quantity - item.quantity;
      if (delta === 0) throw new Error("NO_CHANGE");
      const next = item.quantity + delta;
      if (next < 0) throw new Error("NEGATIVE");
      await tx.update(inventoryItems).set({ quantity: next }).where(eq(inventoryItems.id, itemId));
      await tx.insert(inventoryMovements).values({ itemId, type, delta, balanceAfter: next, reason: p.data.reason ?? null, createdBy: userId });
      return next;
    });
    return { ok: true, value: { balance } };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") return fail("Produto não encontrado.");
      if (e.message === "INACTIVE") return fail("Produto inativo. Reative antes de movimentar.");
      if (e.message === "NO_CHANGE") return fail("A contagem é igual ao saldo atual; nada a ajustar.");
      if (e.message === "NEGATIVE") return fail("Saída maior que o saldo disponível.");
    }
    throw e;
  }
}

const ruleSchema = z.object({
  serviceId: z.string().uuid("Serviço inválido."),
  itemId: z.string().uuid("Produto inválido."),
  category: z.enum(VEHICLE_CATEGORIES).nullable(),
  quantity: z.number().int("Use números inteiros.").positive("A quantidade deve ser maior que zero.").max(MAX_QTY),
});

/** Cria ou atualiza a regra de consumo (serviço × produto × categoria opcional). */
export async function upsertRule(db: Database, raw: z.input<typeof ruleSchema>): Promise<OpResult<undefined>> {
  const p = ruleSchema.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const { serviceId, itemId, category, quantity } = p.data;
  const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.id, serviceId)).limit(1);
  const [item] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1);
  if (!svc || !item) return fail("Serviço ou produto não encontrado.");
  const match = and(
    eq(serviceConsumptionRules.serviceId, serviceId),
    eq(serviceConsumptionRules.itemId, itemId),
    category ? eq(serviceConsumptionRules.category, category) : isNull(serviceConsumptionRules.category),
  );
  const updated = await db.update(serviceConsumptionRules).set({ quantity }).where(match).returning({ id: serviceConsumptionRules.id });
  if (!updated.length) await db.insert(serviceConsumptionRules).values({ serviceId, itemId, category, quantity });
  return { ok: true, value: undefined };
}

export async function deleteRule(db: Database, ruleId: string): Promise<OpResult<undefined>> {
  const rows = await db.delete(serviceConsumptionRules).where(eq(serviceConsumptionRules.id, ruleId)).returning({ id: serviceConsumptionRules.id });
  return rows.length ? { ok: true, value: undefined } : fail("Regra não encontrada.");
}

/**
 * Baixa automática do estoque para uma OS entregue (chamada dentro da transação da entrega).
 * Regra específica da categoria tem prioridade sobre a regra geral do serviço.
 * Idempotente: o índice único (item, OS) impede baixa duplicada.
 */
export async function applyConsumptionForWorkOrder(
  tx: Tx,
  wo: { id: string; serviceId: string; category: (typeof VEHICLE_CATEGORIES)[number] },
  userId: string | null,
): Promise<number> {
  const rules = await tx
    .select()
    .from(serviceConsumptionRules)
    .innerJoin(inventoryItems, eq(inventoryItems.id, serviceConsumptionRules.itemId))
    .where(
      and(
        eq(serviceConsumptionRules.serviceId, wo.serviceId),
        eq(inventoryItems.active, true),
        or(isNull(serviceConsumptionRules.category), eq(serviceConsumptionRules.category, wo.category)),
      ),
    );
  const perItem = new Map<string, number>();
  for (const r of rules.sort((a, b) => (a.service_consumption_rules.category ? 1 : 0) - (b.service_consumption_rules.category ? 1 : 0))) {
    perItem.set(r.service_consumption_rules.itemId, r.service_consumption_rules.quantity); // específica sobrescreve geral
  }
  let applied = 0;
  for (const [itemId, qty] of perItem) {
    const [already] = await tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(and(eq(inventoryMovements.itemId, itemId), eq(inventoryMovements.workOrderId, wo.id), eq(inventoryMovements.type, "CONSUMO_OS")))
      .limit(1);
    if (already) continue;
    const [row] = await tx
      .update(inventoryItems)
      .set({ quantity: sql`${inventoryItems.quantity} - ${qty}` })
      .where(eq(inventoryItems.id, itemId))
      .returning({ quantity: inventoryItems.quantity });
    await tx.insert(inventoryMovements).values({
      itemId,
      type: "CONSUMO_OS",
      delta: -qty,
      balanceAfter: row!.quantity,
      workOrderId: wo.id,
      reason: "Baixa automática na entrega",
      createdBy: userId,
    });
    applied++;
  }
  return applied;
}

export type StockLevel = "OK" | "BAIXO" | "ZERADO" | "NEGATIVO";
export function stockLevel(item: { quantity: number; minQuantity: number }): StockLevel {
  if (item.quantity < 0) return "NEGATIVO";
  if (item.quantity === 0) return "ZERADO";
  if (item.quantity <= item.minQuantity) return "BAIXO";
  return "OK";
}

export async function listItems(db: Database, includeInactive = false) {
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(includeInactive ? undefined : eq(inventoryItems.active, true))
    .orderBy(asc(inventoryItems.name));
  return rows.map((r) => ({ ...r, level: stockLevel(r) }));
}

export async function countLowStock(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.active, true), sql`${inventoryItems.quantity} <= ${inventoryItems.minQuantity}`));
  return row?.n ?? 0;
}

export async function listMovements(db: Database, opts: { itemId?: string; limit?: number } = {}) {
  return db
    .select({
      m: inventoryMovements,
      itemName: inventoryItems.name,
      unit: inventoryItems.unit,
      woNumber: workOrders.number,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
    .leftJoin(workOrders, eq(workOrders.id, inventoryMovements.workOrderId))
    .where(opts.itemId ? eq(inventoryMovements.itemId, opts.itemId) : undefined)
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(opts.limit ?? 50);
}

export async function listRules(db: Database) {
  return db
    .select({
      r: serviceConsumptionRules,
      serviceName: services.name,
      itemName: inventoryItems.name,
      unit: inventoryItems.unit,
    })
    .from(serviceConsumptionRules)
    .innerJoin(services, eq(services.id, serviceConsumptionRules.serviceId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, serviceConsumptionRules.itemId))
    .orderBy(asc(services.name), asc(inventoryItems.name));
}

export async function listConsumptionForWorkOrder(db: Database, workOrderId: string) {
  return db
    .select({ name: inventoryItems.name, unit: inventoryItems.unit, delta: inventoryMovements.delta })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryMovements.itemId))
    .where(and(eq(inventoryMovements.workOrderId, workOrderId), eq(inventoryMovements.type, "CONSUMO_OS")));
}
