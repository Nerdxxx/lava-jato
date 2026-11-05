import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import {
  appointments,
  customers,
  resources,
  serviceChecklistTemplates,
  servicePrices,
  services,
  users,
  vehicles,
  workOrderChecklistItems,
  workOrderStatusHistory,
  workOrders,
} from "@/db/schema";
import { localToUtc } from "@/lib/time";
import { formatOsNumber, maskPlate, canTransitionWorkOrder } from "@/modules/operations/state-machine";
import {
  applyDiscount,
  assignWorkOrder,
  changeWorkOrderStatus,
  checkInAppointment,
  createWalkInWorkOrder,
  toggleChecklistItem,
} from "@/modules/operations/work-orders";
import { recordPayments } from "@/modules/finance/payments";
import { changeStatus, createAppointment } from "@/modules/scheduling/booking";
import { saveOperatingHours } from "@/modules/scheduling/config";

const NOW = new Date("2030-01-04T12:00:00Z");
const MONDAY = "2030-01-07";
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
  await saveOperatingHours(db, 1, [{ opensAt: "08:00", closesAt: "18:00" }]);
  const [svc] = await db.insert(services).values({ slug: "externa", name: "Lavagem externa", durationMinutes: 40 }).returning();
  await db.insert(servicePrices).values({ serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 });
  await db.insert(serviceChecklistTemplates).values([
    { serviceId: svc!.id, position: 0, label: "Lavar lataria" },
    { serviceId: svc!.id, position: 1, label: "Secar" },
  ]);
  const [staff] = await db
    .insert(users)
    .values({ name: "Equipe", email: "e@example.com", passwordHash: "x", role: "ADMINISTRADOR" })
    .returning();
  return { db, svc: svc!, staff: staff! };
}

async function confirmedAppointment(s: Awaited<ReturnType<typeof setup>>) {
  const r = await createAppointment(
    s.db,
    {
      category: "CARRO_PEQUENO",
      serviceId: s.svc.id,
      startsAt: localToUtc(MONDAY, "09:00"),
      name: "Cliente",
      phone: "79999000001",
      vehicleModel: "Onix",
      plate: "ABC1D23",
    },
    { now: NOW },
  );
  if (!r.ok) throw new Error("setup");
  await changeStatus(s.db, r.value.id, "CONFIRMADO", s.staff.id);
  return r.value;
}

describe("utilitários", () => {
  it("mascara placa e formata número da OS", () => {
    expect(maskPlate("ABC1D23")).toBe("ABC••23");
    expect(maskPlate(null)).toBe("sem placa");
    expect(formatOsNumber(7)).toBe("OS-00007");
  });
  it("máquina de estados da OS", () => {
    expect(canTransitionWorkOrder("RECEBIDO", "EM_LAVAGEM")).toBe(true);
    expect(canTransitionWorkOrder("RECEBIDO", "ENTREGUE")).toBe(false);
    expect(canTransitionWorkOrder("ENTREGUE", "CANCELADO")).toBe(false);
    expect(canTransitionWorkOrder("AGUARDANDO_INSPECAO", "EM_LAVAGEM")).toBe(true);
  });
});

describe("check-in", () => {
  it("converte agendamento confirmado em OS com snapshot de preço, checklist e veículo", async () => {
    const s = await setup();
    const appt = await confirmedAppointment(s);
    await s.db.update(servicePrices).set({ priceCents: 9999 }); // mudança posterior de preço
    const r = await checkInAppointment(s.db, appt.id, s.staff.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.priceCents).toBe(4000);
    expect(r.value.status).toBe("RECEBIDO");
    expect(r.value.vehiclePlate).toBe("ABC1D23");
    const items = await s.db.select().from(workOrderChecklistItems).where(eq(workOrderChecklistItems.workOrderId, r.value.id));
    expect(items.map((i) => i.label).sort()).toEqual(["Lavar lataria", "Secar"]);
    const [a] = await s.db.select().from(appointments).where(eq(appointments.id, appt.id));
    expect(a!.status).toBe("CONVERTIDO_EM_OS");
    expect(await s.db.select().from(vehicles)).toHaveLength(1);
  });
  it("é idempotente: repetir o check-in devolve a mesma OS", async () => {
    const s = await setup();
    const appt = await confirmedAppointment(s);
    const [a, b] = await Promise.all([checkInAppointment(s.db, appt.id, s.staff.id), checkInAppointment(s.db, appt.id, s.staff.id)]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.id).toBe(b.value.id);
    expect(await s.db.select().from(workOrders)).toHaveLength(1);
  });
  it("recusa agendamento não confirmado", async () => {
    const s = await setup();
    const r = await createAppointment(
      s.db,
      { category: "CARRO_PEQUENO", serviceId: s.svc.id, startsAt: localToUtc(MONDAY, "10:00"), name: "Cliente Dois", phone: "79999000002", vehicleModel: "Gol" },
      { now: NOW },
    );
    if (!r.ok) throw new Error("setup");
    expect((await checkInAppointment(s.db, r.value.id, s.staff.id)).ok).toBe(false);
  });
});

describe("atendimento sem agendamento", () => {
  it("cria cliente, veículo e OS com preço vigente; reaproveita cliente pelo telefone", async () => {
    const s = await setup();
    const input = { name: "Maria", phone: "(79) 99900-0003", category: "CARRO_PEQUENO" as const, serviceId: s.svc.id, vehicleModel: "Polo", plate: "xyz-1a23" };
    const a = await createWalkInWorkOrder(s.db, input, s.staff.id);
    const b = await createWalkInWorkOrder(s.db, { ...input, vehicleModel: "Polo" }, s.staff.id);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok) expect(a.value.priceCents).toBe(4000);
    expect(await s.db.select().from(customers)).toHaveLength(1);
    expect(await s.db.select().from(vehicles)).toHaveLength(1); // mesmo veículo
    if (a.ok && b.ok) expect(b.value.number).toBeGreaterThan(a.value.number);
  });
  it("valida serviço indisponível, telefone e placa", async () => {
    const s = await setup();
    const base = { name: "Maria", phone: "79999000003", category: "MOTO" as const, serviceId: s.svc.id, vehicleModel: "Biz" };
    expect((await createWalkInWorkOrder(s.db, base, s.staff.id)).ok).toBe(false); // sem preço de moto
    expect((await createWalkInWorkOrder(s.db, { ...base, category: "CARRO_PEQUENO", phone: "12" }, s.staff.id)).ok).toBe(false);
    expect((await createWalkInWorkOrder(s.db, { ...base, category: "CARRO_PEQUENO", plate: "??" }, s.staff.id)).ok).toBe(false);
  });
});

describe("fluxo da OS", () => {
  async function newOrder() {
    const s = await setup();
    const r = await createWalkInWorkOrder(
      s.db,
      { name: "Maria", phone: "79999000003", category: "CARRO_PEQUENO", serviceId: s.svc.id, vehicleModel: "Polo" },
      s.staff.id,
    );
    if (!r.ok) throw new Error("setup");
    return { ...s, wo: r.value };
  }

  it("segue o fluxo completo, registra histórico e datas", async () => {
    const { db, wo, staff } = await newOrder();
    const go = (to: Parameters<typeof changeWorkOrderStatus>[2]) => changeWorkOrderStatus(db, wo.id, to, staff.id);
    expect((await go("EM_LAVAGEM")).ok).toBe(true);
    expect((await go("EM_FINALIZACAO")).ok).toBe(true);
    const items = await db.select().from(workOrderChecklistItems).where(eq(workOrderChecklistItems.workOrderId, wo.id));
    for (const i of items) await toggleChecklistItem(db, i.id, true, staff.id);
    expect((await go("AGUARDANDO_INSPECAO")).ok).toBe(true);
    expect((await go("PRONTO_PARA_ENTREGA")).ok).toBe(true);
    await recordPayments(db, wo.id, [{ method: "PIX", amountCents: 4000 }], staff.id);
    const done = await go("ENTREGUE");
    expect(done.ok).toBe(true);
    const [row] = await db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(row!.startedAt).not.toBeNull();
    expect(row!.finishedAt).not.toBeNull();
    expect(row!.deliveredAt).not.toBeNull();
    const hist = await db.select().from(workOrderStatusHistory).where(eq(workOrderStatusHistory.workOrderId, wo.id));
    expect(hist.map((h) => h.toStatus)).toEqual(["RECEBIDO", "EM_LAVAGEM", "EM_FINALIZACAO", "AGUARDANDO_INSPECAO", "PRONTO_PARA_ENTREGA", "ENTREGUE"]);
  });
  it("bloqueia transição inválida e avanço com checklist incompleto", async () => {
    const { db, wo, staff } = await newOrder();
    expect((await changeWorkOrderStatus(db, wo.id, "ENTREGUE", staff.id)).ok).toBe(false);
    await changeWorkOrderStatus(db, wo.id, "EM_LAVAGEM", staff.id);
    await changeWorkOrderStatus(db, wo.id, "EM_FINALIZACAO", staff.id);
    const r = await changeWorkOrderStatus(db, wo.id, "AGUARDANDO_INSPECAO", staff.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/checklist/i);
  });
  it("não permite alterar OS encerrada", async () => {
    const { db, wo, staff } = await newOrder();
    expect((await changeWorkOrderStatus(db, wo.id, "CANCELADO", staff.id)).ok).toBe(true);
    expect((await changeWorkOrderStatus(db, wo.id, "EM_LAVAGEM", staff.id)).ok).toBe(false);
    const [item] = await db.select().from(workOrderChecklistItems).where(eq(workOrderChecklistItems.workOrderId, wo.id));
    expect((await toggleChecklistItem(db, item!.id, true, staff.id)).ok).toBe(false);
  });
  it("entregar a OS conclui o agendamento de origem", async () => {
    const s = await setup();
    const appt = await confirmedAppointment(s);
    const ci = await checkInAppointment(s.db, appt.id, s.staff.id);
    if (!ci.ok) throw new Error("setup");
    const go = (to: Parameters<typeof changeWorkOrderStatus>[2]) => changeWorkOrderStatus(s.db, ci.value.id, to, s.staff.id);
    await go("EM_LAVAGEM");
    await go("EM_FINALIZACAO");
    for (const i of await s.db.select().from(workOrderChecklistItems).where(eq(workOrderChecklistItems.workOrderId, ci.value.id))) {
      await toggleChecklistItem(s.db, i.id, true, s.staff.id);
    }
    await go("AGUARDANDO_INSPECAO");
    await go("PRONTO_PARA_ENTREGA");
    await recordPayments(s.db, ci.value.id, [{ method: "PIX", amountCents: 4000 }], s.staff.id);
    expect((await go("ENTREGUE")).ok).toBe(true);
    const [a] = await s.db.select().from(appointments).where(eq(appointments.id, appt.id));
    expect(a!.status).toBe("CONCLUIDO");
  });
  it("transições concorrentes: apenas uma vence", async () => {
    const { db, wo, staff } = await newOrder();
    const results = await Promise.all([
      changeWorkOrderStatus(db, wo.id, "EM_LAVAGEM", staff.id),
      changeWorkOrderStatus(db, wo.id, "NA_FILA", staff.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
  it("desconto: aceita até o valor do serviço e rejeita acima ou negativo", async () => {
    const { db, wo } = await newOrder();
    expect((await applyDiscount(db, wo.id, 500)).ok).toBe(true);
    expect((await applyDiscount(db, wo.id, 4001)).ok).toBe(false);
    expect((await applyDiscount(db, wo.id, -1)).ok).toBe(false);
    const [row] = await db.select().from(workOrders).where(eq(workOrders.id, wo.id));
    expect(row!.discountCents).toBe(500);
  });
  it("atribui responsável ativo da equipe e rejeita cliente/inexistente", async () => {
    const { db, wo, staff } = await newOrder();
    expect((await assignWorkOrder(db, wo.id, staff.id)).ok).toBe(true);
    const [cli] = await db.insert(users).values({ name: "C", email: "c@example.com", passwordHash: "x", role: "CLIENTE" }).returning();
    expect((await assignWorkOrder(db, wo.id, cli!.id)).ok).toBe(false);
    expect((await assignWorkOrder(db, wo.id, null)).ok).toBe(true);
  });
});
