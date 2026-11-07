import { afterEach, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "@/db/client";
import { resources, servicePrices, services, users } from "@/db/schema";
import { localToUtc } from "@/lib/time";
import { getOpenStatus, getOpeningHours } from "@/modules/business/hours";
import { checkInAppointment } from "@/modules/operations/work-orders";
import { DEFAULT_ADDONS, loadAddons, resolveAddons, saveAddon } from "@/modules/scheduling/addons";
import { changeStatus, createAppointment, rescheduleByCustomer } from "@/modules/scheduling/booking";
import { addHoliday, saveOperatingHours } from "@/modules/scheduling/config";

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
  await db.insert(servicePrices).values([
    { serviceId: svc!.id, category: "CARRO_PEQUENO", priceCents: 4000 },
    { serviceId: svc!.id, category: "MOTO", priceCents: 3000 },
  ]);
  const [staff] = await db.insert(users).values({ name: "Equipe", email: "a@example.com", passwordHash: "x", role: "ADMINISTRADOR" }).returning();
  return { db, svc: svc!, staff: staff! };
}

const book = (s: Awaited<ReturnType<typeof setup>>, extra: { category?: "CARRO_PEQUENO" | "MOTO"; addons?: string[]; time?: string } = {}) =>
  createAppointment(
    s.db,
    {
      category: extra.category ?? "CARRO_PEQUENO",
      serviceId: s.svc.id,
      startsAt: localToUtc(MONDAY, extra.time ?? "09:00"),
      name: "Cliente",
      phone: "79999000001",
      vehicleModel: "Onix",
      addons: extra.addons,
    },
    { now: NOW },
  );

describe("serviços adicionais", () => {
  it("padrão: cera R$ 20 e chuva ácida R$ 40, ativos só para carros", async () => {
    const s = await setup();
    const addons = await loadAddons(s.db);
    expect(addons.map((a) => [a.slug, a.priceCents, a.active])).toEqual([
      ["cera", 2000, true],
      ["chuva-acida-vidros", 4000, true],
    ]);
    expect(addons.every((a) => !a.categories.includes("MOTO"))).toBe(true);
  });

  it("o servidor soma os adicionais ao preço e grava o snapshot", async () => {
    const s = await setup();
    const r = await book(s, { addons: ["cera", "chuva-acida-vidros", "cera"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.priceCents).toBe(4000 + 2000 + 4000);
    expect(r.value.addons.map((a) => a.slug)).toEqual(["cera", "chuva-acida-vidros"]);
  });

  it("recusa adicional desconhecido, inativo ou de outra categoria", async () => {
    const s = await setup();
    expect((await book(s, { addons: ["polimento"] })).ok).toBe(false);
    expect((await book(s, { category: "MOTO", addons: ["cera"] })).ok).toBe(false);
    await saveAddon(s.db, { ...DEFAULT_ADDONS[0]!, active: false });
    const r = await book(s, { addons: ["cera"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("SERVICO_INDISPONIVEL");
  });

  it("alterar o preço do adicional não muda agendamento já feito; reagendar e check-in preservam", async () => {
    const s = await setup();
    const r = await book(s, { addons: ["cera"] });
    if (!r.ok) throw new Error(r.message);
    await saveAddon(s.db, { ...DEFAULT_ADDONS[0]!, priceCents: 9900 });
    const moved = await rescheduleByCustomer(s.db, r.value.code, "79999000001", localToUtc(MONDAY, "14:00"), NOW);
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.value.priceCents).toBe(6000);
    expect(moved.value.addons).toEqual([{ slug: "cera", name: "Aplicação de cera", priceCents: 2000, durationMinutes: 10 }]);
    await changeStatus(s.db, moved.value.id, "CONFIRMADO", s.staff.id);
    const wo = await checkInAppointment(s.db, moved.value.id, s.staff.id);
    if (!wo.ok) throw new Error(wo.message);
    expect(wo.value.priceCents).toBe(6000);
    expect(wo.value.addons).toHaveLength(1);
  });

  it("sem adicionais o preço continua o do serviço", async () => {
    const s = await setup();
    const r = await book(s);
    expect(r.ok && r.value.priceCents).toBe(4000);
    expect(resolveAddons(await loadAddons(s.db), "CARRO_PEQUENO", []).ok).toBe(true);
  });

  it("adicionais aumentam a duração ocupada e são respeitados ao escolher horários", async () => {
    const s = await setup();
    const withAddon = await book(s, { addons: ["cera"] });
    if (!withAddon.ok) throw new Error(withAddon.message);
    // Serviço (40) + cera (10) + intervalo operacional (10).
    expect(withAddon.value.endsAt.getTime() - withAddon.value.startsAt.getTime()).toBe(60 * 60_000);
    expect((await book(s, { time: "09:30" })).ok).toBe(false);
    expect((await book(s, { time: "10:00" })).ok).toBe(true);
  });
});

describe("aberto agora (America/Maceio)", () => {
  it("usa o horário configurado, o fuso de Maceió e os feriados", async () => {
    const s = await setup();
    const hours = await getOpeningHours(s.db);
    // segunda 2030-01-07 10:00 em Maceió = 13:00 UTC
    expect(await getOpenStatus(s.db, hours, new Date("2030-01-07T13:00:00Z"))).toMatchObject({ open: true, todayWeekday: 1, detail: "Fecha às 18:00" });
    // segunda 07:00 local: fechado, abre às 08:00
    expect(await getOpenStatus(s.db, hours, new Date("2030-01-07T10:00:00Z"))).toMatchObject({ open: false, detail: "Abre hoje às 08:00" });
    // segunda 18:00 local = 21:00 UTC: fechado
    expect((await getOpenStatus(s.db, hours, new Date("2030-01-07T21:00:00Z")))?.open).toBe(false);
    await addHoliday(s.db, MONDAY, "Feriado teste");
    expect(await getOpenStatus(s.db, hours, new Date("2030-01-07T13:00:00Z"))).toMatchObject({ open: false, detail: "Fechado hoje: Feriado teste" });
  });

  it("sem horários cadastrados não mostra status", async () => {
    const handle = await createDb("pglite://memory");
    handles.push(handle);
    await handle.migrate("./drizzle");
    expect(await getOpenStatus(handle.db, await getOpeningHours(handle.db))).toBeNull();
  });
});
