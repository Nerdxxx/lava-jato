import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import { inventoryItems, inventoryMovements, resources, servicePrices, services, users, workOrderChecklistItems, workOrders } from "@/db/schema";
import { recordPayments } from "@/modules/finance/payments";
import { createItem, deleteRule, listItems, recordMovement, stockLevel, updateItem, upsertRule } from "@/modules/inventory/inventory";
import {
  adjustPoints,
  getActiveRedemption,
  getBalance,
  loadLoyaltyConfig,
  redeemOnWorkOrder,
  saveLoyaltyConfig,
  undoRedemption,
} from "@/modules/loyalty/loyalty";
import { changeWorkOrderStatus, createWalkInWorkOrder } from "@/modules/operations/work-orders";

const handles: DbHandle[] = [];
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

async function setup() {
  const handle = await createDb("pglite://memory");
  handles.push(handle);
  await handle.migrate("./drizzle");
  const { db } = handle;
  await db.insert(resources).values({ name: "Vaga 1" });
  const [svc] = await db.insert(services).values({ slug: "externa", name: "Lavagem externa", durationMinutes: 40 }).returning();
  await db.insert(servicePrices).values([
    { serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 },
    { serviceId: svc!.id, category: "SUV", priceCents: 6000 },
  ]);
  const [staff] = await db.insert(users).values({ name: "Admin", email: "a@example.com", passwordHash: "x", role: "ADMINISTRADOR" }).returning();
  const newOrder = async (phone = "79999910001", category: "CARRO_PEQUENO" | "SUV" = "CARRO_PEQUENO") => {
    const r = await createWalkInWorkOrder(db, { name: "Cliente", phone, category, serviceId: svc!.id, vehicleModel: "Onix" }, staff!.id);
    if (!r.ok) throw new Error(r.message);
    return r.value;
  };
  /** Leva a OS até a entrega: pagamento integral (Pix) + fluxo de status. */
  const deliver = async (woId: string) => {
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, woId));
    const due = wo!.priceCents - wo!.discountCents;
    if (due > 0) {
      const pay = await recordPayments(db, woId, [{ method: "PIX", amountCents: due }], staff!.id);
      if (!pay.ok) throw new Error(pay.message);
    }
    await db.update(workOrderChecklistItems).set({ done: true }).where(eq(workOrderChecklistItems.workOrderId, woId));
    for (const to of ["EM_LAVAGEM", "EM_FINALIZACAO", "AGUARDANDO_INSPECAO", "PRONTO_PARA_ENTREGA", "ENTREGUE"] as const) {
      const r = await changeWorkOrderStatus(db, woId, to, staff!.id);
      if (!r.ok) throw new Error(`${to}: ${r.message}`);
    }
  };
  return { db, svc: svc!, staff: staff!, newOrder, deliver };
}

describe("estoque", () => {
  it("cadastra produto com saldo inicial e registra entrada, saída e ajuste", async () => {
    const { db, staff } = await setup();
    const created = await createItem(db, { name: "Shampoo automotivo", unit: "ml", minQuantity: 1000, initialQuantity: 5000 }, staff.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    expect((await createItem(db, { name: "Shampoo automotivo", unit: "ml" }, staff.id)).ok).toBe(false); // nome duplicado

    expect(await recordMovement(db, { itemId: id, type: "ENTRADA", quantity: 2000 }, staff.id)).toEqual({ ok: true, value: { balance: 7000 } });
    expect((await recordMovement(db, { itemId: id, type: "SAIDA", quantity: 500 }, staff.id)).ok).toBe(false); // exige motivo
    expect(await recordMovement(db, { itemId: id, type: "SAIDA", quantity: 500, reason: "Vazamento" }, staff.id)).toEqual({ ok: true, value: { balance: 6500 } });
    const neg = await recordMovement(db, { itemId: id, type: "SAIDA", quantity: 99999, reason: "x" }, staff.id);
    expect(neg.ok).toBe(false);
    expect(await recordMovement(db, { itemId: id, type: "AJUSTE", quantity: 6000, reason: "Contagem" }, staff.id)).toEqual({ ok: true, value: { balance: 6000 } });
    expect((await recordMovement(db, { itemId: id, type: "AJUSTE", quantity: 6000, reason: "Contagem" }, staff.id)).ok).toBe(false); // sem diferença

    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, id));
    expect(moves.map((m) => m.delta).sort((a, b) => a - b)).toEqual([-500, -500, 2000, 5000]);
    expect(moves.reduce((s, m) => s + m.delta, 0)).toBe(6000); // saldo explicado pelo histórico

    await updateItem(db, id, { active: false });
    expect((await recordMovement(db, { itemId: id, type: "ENTRADA", quantity: 1 }, staff.id)).ok).toBe(false);
    expect((await listItems(db)).length).toBe(0);
  });

  it("classifica o nível de estoque", () => {
    expect(stockLevel({ quantity: 10, minQuantity: 5 })).toBe("OK");
    expect(stockLevel({ quantity: 5, minQuantity: 5 })).toBe("BAIXO");
    expect(stockLevel({ quantity: 0, minQuantity: 5 })).toBe("ZERADO");
    expect(stockLevel({ quantity: -3, minQuantity: 0 })).toBe("NEGATIVO");
  });

  it("dá baixa automática na entrega, com regra por categoria tendo prioridade e sem duplicar", async () => {
    const { db, svc, staff, newOrder, deliver } = await setup();
    const shampoo = await createItem(db, { name: "Shampoo", unit: "ml", initialQuantity: 1000 }, staff.id);
    const pano = await createItem(db, { name: "Pano", unit: "un", initialQuantity: 1 }, staff.id);
    if (!shampoo.ok || !pano.ok) throw new Error("setup");
    expect((await upsertRule(db, { serviceId: svc.id, itemId: shampoo.value.id, category: null, quantity: 100 })).ok).toBe(true);
    expect((await upsertRule(db, { serviceId: svc.id, itemId: shampoo.value.id, category: "SUV", quantity: 250 })).ok).toBe(true);
    expect((await upsertRule(db, { serviceId: svc.id, itemId: pano.value.id, category: null, quantity: 2 })).ok).toBe(true);
    // upsert atualiza a mesma regra em vez de duplicar
    expect((await upsertRule(db, { serviceId: svc.id, itemId: shampoo.value.id, category: null, quantity: 120 })).ok).toBe(true);

    const car = await newOrder("79999910001", "CARRO_PEQUENO");
    await deliver(car.id);
    const suv = await newOrder("79999910002", "SUV");
    await deliver(suv.id);

    const [s] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, shampoo.value.id));
    expect(s!.quantity).toBe(1000 - 120 - 250);
    const [p] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, pano.value.id));
    expect(p!.quantity).toBe(1 - 2 - 2); // consumo automático pode negativar (sinaliza cadastro desatualizado)
    const consumos = await db.select().from(inventoryMovements).where(eq(inventoryMovements.type, "CONSUMO_OS"));
    expect(consumos.length).toBe(4);

    // OS cancelada não consome
    const cancelled = await newOrder("79999910003");
    await changeWorkOrderStatus(db, cancelled.id, "CANCELADO", staff.id);
    expect((await db.select().from(inventoryMovements).where(eq(inventoryMovements.workOrderId, cancelled.id))).length).toBe(0);

    const rules = await db.query.serviceConsumptionRules.findMany();
    expect(rules.length).toBe(3);
    expect((await deleteRule(db, rules[0]!.id)).ok).toBe(true);
  });
});

describe("fidelidade", () => {
  it("vem desativada e valida a configuração", async () => {
    const { db } = await setup();
    expect((await loadLoyaltyConfig(db)).enabled).toBe(false);
    expect((await saveLoyaltyConfig(db, { enabled: true, visitsRequired: 1, rewardPercent: 100 })).ok).toBe(false);
    expect((await saveLoyaltyConfig(db, { enabled: true, visitsRequired: 3, rewardPercent: 50 })).ok).toBe(true);
    expect(await loadLoyaltyConfig(db)).toEqual({ enabled: true, visitsRequired: 3, rewardPercent: 50 });
  });

  it("pontua entregas pagas, resgata desconto e não pontua a OS do resgate", async () => {
    const { db, staff, newOrder, deliver } = await setup();
    const phone = "79999920001";
    // Programa desativado: entrega não pontua
    const first = await newOrder(phone);
    await deliver(first.id);
    expect(await getBalance(db, first.customerId)).toBe(0);

    await saveLoyaltyConfig(db, { enabled: true, visitsRequired: 2, rewardPercent: 100 });
    for (let i = 0; i < 2; i++) {
      const wo = await newOrder(phone);
      expect((await redeemOnWorkOrder(db, wo.id, staff.id)).ok).toBe(false); // saldo insuficiente (0 ou 1 de 2)
      await deliver(wo.id);
    }
    const customerId = first.customerId;
    expect(await getBalance(db, customerId)).toBe(2);

    const free = await newOrder(phone);
    const r = await redeemOnWorkOrder(db, free.id, staff.id);
    expect(r).toEqual({ ok: true, value: { discountCents: 4000 } });
    expect((await redeemOnWorkOrder(db, free.id, staff.id)).ok).toBe(false); // um resgate por OS
    expect(await getBalance(db, customerId)).toBe(0);
    const [afterRedeem] = await db.select().from(workOrders).where(eq(workOrders.id, free.id));
    expect(afterRedeem!.discountCents).toBe(4000);
    expect(afterRedeem!.financialStatus).toBe("PAGO"); // valor zerado

    await deliver(free.id);
    expect(await getBalance(db, customerId)).toBe(0); // OS do resgate não pontua
  });

  it("desfaz o resgate e devolve pontos ao cancelar a OS", async () => {
    const { db, staff, newOrder } = await setup();
    await saveLoyaltyConfig(db, { enabled: true, visitsRequired: 2, rewardPercent: 50 });
    const wo = await newOrder("79999930001");
    expect((await adjustPoints(db, wo.customerId, 4, "Migração do cartão fidelidade", staff.id)).ok).toBe(true);
    expect((await adjustPoints(db, wo.customerId, -10, "x", staff.id)).ok).toBe(false);

    expect(await redeemOnWorkOrder(db, wo.id, staff.id)).toEqual({ ok: true, value: { discountCents: 2000 } });
    expect(await getBalance(db, wo.customerId)).toBe(2);
    expect((await undoRedemption(db, wo.id, staff.id)).ok).toBe(true);
    expect(await getBalance(db, wo.customerId)).toBe(4);
    const [restored] = await db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(restored!.discountCents).toBe(0);
    expect(await getActiveRedemption(db, wo.id)).toBeNull();

    expect((await redeemOnWorkOrder(db, wo.id, staff.id)).ok).toBe(true); // pode resgatar de novo
    expect((await changeWorkOrderStatus(db, wo.id, "CANCELADO", staff.id)).ok).toBe(true);
    expect(await getBalance(db, wo.customerId)).toBe(4);
  });

  it("não resgata se o pagamento já excede o valor com desconto", async () => {
    const { db, staff, newOrder } = await setup();
    await saveLoyaltyConfig(db, { enabled: true, visitsRequired: 2, rewardPercent: 100 });
    const wo = await newOrder("79999940001");
    await adjustPoints(db, wo.customerId, 2, "Bônus", staff.id);
    await recordPayments(db, wo.id, [{ method: "PIX", amountCents: 4000 }], staff.id);
    expect((await redeemOnWorkOrder(db, wo.id, staff.id)).ok).toBe(false);
    expect(await getBalance(db, wo.customerId)).toBe(2);
  });
});
