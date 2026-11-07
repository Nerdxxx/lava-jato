import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import { operatingHours, resources, servicePrices, services, users } from "@/db/schema";
import { localToUtc } from "@/lib/time";
import { getAvailableSlots } from "@/modules/scheduling/availability";
import { createAppointment } from "@/modules/scheduling/booking";
import {
  addBlock,
  addHoliday,
  addResource,
  parseMoneyToCents,
  saveOperatingHours,
  saveSettings,
  setPrice,
  setResourceActive,
  updateService,
} from "@/modules/scheduling/config";
import { loadSettings } from "@/modules/scheduling/settings";

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
  const [res] = await db.insert(resources).values({ name: "Vaga 1" }).returning();
  const [svc] = await db.insert(services).values({ slug: "externa", name: "Externa", durationMinutes: 40 }).returning();
  await db.insert(servicePrices).values({ serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 });
  await saveOperatingHours(db, 1, [{ opensAt: "08:00", closesAt: "18:00" }]);
  const [staff] = await db
    .insert(users)
    .values({ name: "Admin", email: "a@example.com", passwordHash: "x", role: "ADMINISTRADOR" })
    .returning();
  return { db, res: res!, svc: svc!, staff: staff! };
}

describe("parseMoneyToCents", () => {
  it("aceita formatos brasileiros e rejeita lixo", () => {
    expect(parseMoneyToCents("40")).toBe(4000);
    expect(parseMoneyToCents("40,5")).toBe(4050);
    expect(parseMoneyToCents("R$ 1.234,50")).toBe(123450);
    expect(parseMoneyToCents("12.50")).toBe(1250);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
  });
});

describe("configurações de agendamento", () => {
  it("persiste regras e o motor passa a usá-las", async () => {
    const { db, svc } = await setup();
    const r = await saveSettings(db, {
      slotStepMinutes: 60,
      prepMinutes: 0,
      minAdvanceMinutes: 0,
      maxAdvanceDays: 30,
      cancelDeadlineHours: 5,
    });
    expect(r.ok).toBe(true);
    expect((await loadSettings(db)).slotStepMinutes).toBe(60);
    const slots = await getAvailableSlots(db, { date: MONDAY, durationMinutes: 40, now: NOW });
    expect(slots.map((s) => s.startsAt.getTime())).toContain(localToUtc(MONDAY, "09:00").getTime());
    expect(slots.map((s) => s.startsAt.getTime())).not.toContain(localToUtc(MONDAY, "09:30").getTime());
    expect(svc.id).toBeTruthy();
  });
  it("rejeita valores inválidos", async () => {
    const { db } = await setup();
    const base = { slotStepMinutes: 30, prepMinutes: 10, minAdvanceMinutes: 60, maxAdvanceDays: 30, cancelDeadlineHours: 2 };
    expect((await saveSettings(db, { ...base, slotStepMinutes: 1 })).ok).toBe(false);
    expect((await saveSettings(db, { ...base, maxAdvanceDays: 0 })).ok).toBe(false);
    expect((await saveSettings(db, { ...base, prepMinutes: -5 })).ok).toBe(false);
  });
});

describe("horário de funcionamento", () => {
  it("salva pausa (duas janelas) e fecha o dia com lista vazia", async () => {
    const { db } = await setup();
    expect(
      (await saveOperatingHours(db, 1, [
        { opensAt: "08:00", closesAt: "12:00" },
        { opensAt: "14:00", closesAt: "18:00" },
      ])).ok,
    ).toBe(true);
    expect(await db.select().from(operatingHours).where(eq(operatingHours.weekday, 1))).toHaveLength(2);
    expect((await getAvailableSlots(db, { date: MONDAY, durationMinutes: 40, now: NOW })).some((s) => s.startsAt.getTime() === localToUtc(MONDAY, "12:30").getTime())).toBe(false);
    expect((await saveOperatingHours(db, 1, [])).ok).toBe(true);
    expect(await getAvailableSlots(db, { date: MONDAY, durationMinutes: 40, now: NOW })).toEqual([]);
  });
  it("rejeita janelas inválidas ou sobrepostas", async () => {
    const { db } = await setup();
    expect((await saveOperatingHours(db, 1, [{ opensAt: "18:00", closesAt: "08:00" }])).ok).toBe(false);
    expect((await saveOperatingHours(db, 1, [{ opensAt: "8h", closesAt: "18:00" }])).ok).toBe(false);
    expect(
      (await saveOperatingHours(db, 1, [
        { opensAt: "08:00", closesAt: "13:00" },
        { opensAt: "12:00", closesAt: "18:00" },
      ])).ok,
    ).toBe(false);
    expect((await saveOperatingHours(db, 9, [])).ok).toBe(false);
  });
});

describe("feriados e bloqueios", () => {
  it("feriado fecha o dia; duplicado é recusado", async () => {
    const { db } = await setup();
    expect((await addHoliday(db, MONDAY, "Feriado teste")).ok).toBe(true);
    expect((await addHoliday(db, MONDAY, "Outro")).ok).toBe(false);
    expect((await addHoliday(db, "2030-02-31", "Inválido")).ok).toBe(false);
    expect(await getAvailableSlots(db, { date: MONDAY, durationMinutes: 40, now: NOW })).toEqual([]);
  });
  it("bloqueio remove horários e informa conflitos com agendamentos existentes", async () => {
    const { db, svc, staff } = await setup();
    const booked = await createAppointment(
      db,
      {
        category: "CARRO_PEQUENO",
        serviceId: svc.id,
        startsAt: localToUtc(MONDAY, "10:00"),
        name: "Cliente",
        phone: "79999000001",
        vehicleModel: "Onix",
      },
      { now: NOW },
    );
    expect(booked.ok).toBe(true);
    const r = await addBlock(db, { date: MONDAY, startTime: "09:30", endTime: "11:00", resourceId: null, reason: "Manutenção" }, staff.id);
    expect(r).toEqual({ ok: true, value: { conflicts: 1 } });
    const starts = (await getAvailableSlots(db, { date: MONDAY, durationMinutes: 40, now: NOW })).map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(localToUtc(MONDAY, "10:30").getTime());
    expect(starts).toContain(localToUtc(MONDAY, "11:00").getTime());
  });
  it("rejeita bloqueio com horário invertido", async () => {
    const { db, staff } = await setup();
    expect((await addBlock(db, { date: MONDAY, startTime: "11:00", endTime: "10:00", resourceId: null, reason: "" }, staff.id)).ok).toBe(false);
  });
});

describe("vagas", () => {
  it("nova vaga aumenta a capacidade; a última vaga ativa não pode ser desativada", async () => {
    const { db, res } = await setup();
    expect((await setResourceActive(db, res.id, false)).ok).toBe(false);
    expect((await addResource(db, "Vaga 2")).ok).toBe(true);
    expect((await setResourceActive(db, res.id, false)).ok).toBe(true);
    const [r2] = await db.select().from(resources).where(eq(resources.name, "Vaga 2"));
    expect((await setResourceActive(db, r2!.id, false)).ok).toBe(false);
  });
});

describe("serviços e preços", () => {
  it("altera preço sem afetar agendamentos existentes e cria preço de nova categoria", async () => {
    const { db, svc } = await setup();
    const appt = await createAppointment(
      db,
      {
        category: "CARRO_PEQUENO",
        serviceId: svc.id,
        startsAt: localToUtc(MONDAY, "09:00"),
        name: "Cliente",
        phone: "79999000001",
        vehicleModel: "Onix",
      },
      { now: NOW },
    );
    expect((await setPrice(db, { serviceId: svc.id, category: "CARRO_PEQUENO", priceCents: 5500 })).ok).toBe(true);
    expect(appt.ok && appt.value.priceCents).toBe(4000);
    expect((await setPrice(db, { serviceId: svc.id, category: "SUV", priceCents: 6000 })).ok).toBe(true);
    expect((await db.select().from(servicePrices).where(eq(servicePrices.serviceId, svc.id)))).toHaveLength(2);
  });
  it("desativar preço torna o serviço indisponível para a categoria", async () => {
    const { db, svc } = await setup();
    await setPrice(db, { serviceId: svc.id, category: "CARRO_PEQUENO", priceCents: null });
    const r = await createAppointment(
      db,
      {
        category: "CARRO_PEQUENO",
        serviceId: svc.id,
        startsAt: localToUtc(MONDAY, "09:00"),
        name: "Cliente",
        phone: "79999000001",
        vehicleModel: "Onix",
      },
      { now: NOW },
    );
    expect(r).toMatchObject({ ok: false, error: "SERVICO_INDISPONIVEL" });
  });
  it("valida promoção", async () => {
    const { db, svc } = await setup();
    const base = { serviceId: svc.id, category: "CARRO_PEQUENO", priceCents: 4000 };
    expect((await setPrice(db, { ...base, promoPriceCents: 3000 })).ok).toBe(false); // sem validade
    expect((await setPrice(db, { ...base, promoPriceCents: 4500, promoUntil: new Date("2031-01-01") })).ok).toBe(false);
    expect((await setPrice(db, { ...base, promoPriceCents: 3000, promoUntil: new Date("2031-01-01") })).ok).toBe(true);
  });
  it("atualiza duração e ativação do serviço, com validação", async () => {
    const { db, svc } = await setup();
    expect((await updateService(db, svc.id, { durationMinutes: 55, active: true })).ok).toBe(true);
    expect((await updateService(db, svc.id, { durationMinutes: 1, active: true })).ok).toBe(false);
    expect((await updateService(db, "00000000-0000-0000-0000-000000000000", { durationMinutes: 30, active: true })).ok).toBe(false);
  });
  it("salva duração por categoria e rejeita zero ou duração negativa", async () => {
    const { db, svc } = await setup();
    const base = { serviceId: svc.id, category: "CARRO_PEQUENO", priceCents: 4000 };
    expect((await setPrice(db, { ...base, durationMinutes: 0 })).ok).toBe(false);
    expect((await setPrice(db, { ...base, durationMinutes: -5 })).ok).toBe(false);
    expect((await setPrice(db, { ...base, durationMinutes: 50 })).ok).toBe(true);
    const [row] = await db.select().from(servicePrices).where(eq(servicePrices.serviceId, svc.id));
    expect(row?.durationMinutesOverride).toBe(50);
  });
});
