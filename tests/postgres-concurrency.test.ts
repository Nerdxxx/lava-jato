/**
 * Concorrência REAL contra PostgreSQL (pendência P-01).
 * O PGlite tem uma conexão só, então lá as corridas viram fila. Aqui o pool abre várias conexões
 * simultâneas e as garantias do banco (EXCLUDE, índices únicos, FOR UPDATE) é que decidem.
 *
 * Roda só quando TEST_POSTGRES_URL aponta para um banco DESCARTÁVEL (o schema é recriado). No CI ele existe.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import { appointments, inventoryItems, loyaltyTransactions, operatingHours, payments, resources, servicePrices, services, users } from "@/db/schema";
import { localToUtc } from "@/lib/time";
import { openCashRegister } from "@/modules/finance/cash";
import { recordPayments } from "@/modules/finance/payments";
import { createItem, recordMovement } from "@/modules/inventory/inventory";
import { adjustPoints, redeemOnWorkOrder, saveLoyaltyConfig } from "@/modules/loyalty/loyalty";
import { createWalkInWorkOrder } from "@/modules/operations/work-orders";
import { createAppointment } from "@/modules/scheduling/booking";

const URL = process.env.TEST_POSTGRES_URL;
const NOW = new Date("2030-01-04T12:00:00Z");

describe.skipIf(!URL)("concorrência real no PostgreSQL", () => {
  let handle: DbHandle;
  let svcId = "";
  let staffId = "";

  beforeAll(async () => {
    handle = await createDb(URL!);
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await handle.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await handle.db.execute(sql`CREATE SCHEMA public`);
    await handle.migrate("./drizzle");
    const { db } = handle;
    await db.insert(resources).values({ name: "Vaga 1" });
    await db.insert(operatingHours).values([1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "08:00", closesAt: "18:00" })));
    const [svc] = await db.insert(services).values({ slug: "externa", name: "Externa", durationMinutes: 40 }).returning();
    await db.insert(servicePrices).values({ serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 });
    const [staff] = await db.insert(users).values({ name: "Admin", email: "pg@example.com", passwordHash: "x", role: "ADMINISTRADOR" }).returning();
    svcId = svc!.id;
    staffId = staff!.id;
  }, 60_000);

  afterAll(async () => {
    await handle?.close();
  });

  it("duas pessoas disputam a última vaga no mesmo horário: só uma reserva entra", async () => {
    const results = await Promise.all(
      Array.from({ length: 2 }, (_, n) =>
        createAppointment(
          handle.db,
          {
            name: `Cliente ${n}`,
            phone: `7999980${String(1000 + n)}`,
            vehicleModel: "Onix",
            category: "CARRO_PEQUENO",
            serviceId: svcId,
            startsAt: localToUtc("2030-01-07", "10:00"),
          },
          { now: NOW },
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await handle.db.select().from(appointments)).toHaveLength(1);
  });

  it("aberturas de caixa simultâneas: só 1 caixa aberto", async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, () => openCashRegister(handle.db, 1000, staffId)));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("recebimentos simultâneos nunca ultrapassam o valor da OS", async () => {
    const wo = await createWalkInWorkOrder(handle.db, { name: "Pagador", phone: "79999870001", category: "CARRO_PEQUENO", serviceId: svcId, vehicleModel: "HB20" }, staffId);
    if (!wo.ok) throw new Error(wo.message);
    await Promise.all(Array.from({ length: 8 }, () => recordPayments(handle.db, wo.value.id, [{ method: "PIX", amountCents: 3000 }], staffId)));
    const rows = await handle.db.select().from(payments).where(eq(payments.workOrderId, wo.value.id));
    expect(rows.reduce((s, p) => s + p.amountCents, 0)).toBeLessThanOrEqual(4000);
  });

  it("saídas de estoque simultâneas não deixam saldo negativo", async () => {
    const item = await createItem(handle.db, { name: "Cera", unit: "ml", initialQuantity: 500 }, staffId);
    if (!item.ok) throw new Error(item.message);
    await Promise.all(Array.from({ length: 10 }, () => recordMovement(handle.db, { itemId: item.value.id, type: "SAIDA", quantity: 100, reason: "uso" }, staffId)));
    const [row] = await handle.db.select().from(inventoryItems).where(eq(inventoryItems.id, item.value.id));
    expect(row!.quantity).toBe(0);
  });

  it("resgates simultâneos de fidelidade: o saldo é usado uma vez só", async () => {
    await saveLoyaltyConfig(handle.db, { enabled: true, visitsRequired: 2, rewardPercent: 100 });
    const orders = [];
    for (let i = 0; i < 4; i++) {
      const r = await createWalkInWorkOrder(handle.db, { name: "Fiel", phone: "79999860001", category: "CARRO_PEQUENO", serviceId: svcId, vehicleModel: "Gol" }, staffId);
      if (!r.ok) throw new Error(r.message);
      orders.push(r.value);
    }
    await adjustPoints(handle.db, orders[0]!.customerId, 2, "bônus", staffId);
    const rs = await Promise.all(orders.map((o) => redeemOnWorkOrder(handle.db, o.id, staffId)));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const [bal] = await handle.db
      .select({ n: sql<number>`SUM(${loyaltyTransactions.points})::int` })
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.customerId, orders[0]!.customerId));
    expect(bal!.n).toBeGreaterThanOrEqual(0);
  });
});
