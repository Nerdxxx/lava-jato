import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DbHandle } from "@/db/client";
import {
  appointmentHistory,
  appointments,
  holidays,
  operatingHours,
  resources,
  scheduleBlocks,
  servicePrices,
  services,
  users,
} from "@/db/schema";
import { localToUtc } from "@/lib/time";
import { computeSlots } from "@/modules/scheduling/availability";
import {
  cancelByCustomer,
  changeStatus,
  createAppointment,
  lookupAppointment,
  rescheduleByCustomer,
} from "@/modules/scheduling/booking";
import { DEFAULT_SETTINGS } from "@/modules/scheduling/settings";
import { canTransition } from "@/modules/scheduling/state-machine";

// 2030-01-04 é sexta; 2030-01-07 é segunda. Maceió = UTC-3.
const NOW = new Date("2030-01-04T12:00:00Z");
const MONDAY = "2030-01-07";
const at = (time: string, date = MONDAY) => localToUtc(date, time);

const handles: DbHandle[] = [];
afterEach(async () => {
  while (handles.length) await handles.pop()!.close();
});

async function setup(resourceCount = 1) {
  const handle = await createDb("pglite://memory");
  handles.push(handle);
  await handle.migrate("./drizzle");
  const { db } = handle;
  for (let i = 1; i <= resourceCount; i++) await db.insert(resources).values({ name: `Vaga ${i}` });
  await db
    .insert(operatingHours)
    .values([1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "08:00", closesAt: "18:00" })));
  const [externa] = await db
    .insert(services)
    .values({ slug: "externa", name: "Externa", durationMinutes: 40 })
    .returning();
  const [completa] = await db
    .insert(services)
    .values({ slug: "completa", name: "Completa", durationMinutes: 70 })
    .returning();
  await db.insert(servicePrices).values([
    { serviceId: externa!.id, category: "MOTO", priceCents: 2000 },
    { serviceId: externa!.id, category: "CARRO_PEQUENO", priceCents: 4000 },
    { serviceId: completa!.id, category: "CARRO_PEQUENO", priceCents: 6000 },
  ]);
  return { db, externa: externa!, completa: completa! };
}

const customer = (n = 1) => ({
  name: `Cliente ${n}`,
  phone: `7999900000${n}`,
  vehicleModel: "Onix",
});

describe("computeSlots (função pura)", () => {
  const base = {
    date: MONDAY,
    durationMinutes: 40,
    settings: DEFAULT_SETTINGS,
    now: NOW,
    hours: [{ opensAt: "08:00", closesAt: "18:00" }],
    isHoliday: false,
    resourceIds: ["r1"],
    blocks: [],
    booked: [],
  };

  it("gera horários dentro do expediente, terminando até o fechamento", () => {
    const slots = computeSlots(base);
    expect(slots).toHaveLength(19); // 08:00 .. 17:00 (17:30 terminaria 18:10)
    expect(slots[0]!.startsAt).toEqual(at("08:00"));
    expect(slots.at(-1)!.startsAt).toEqual(at("17:00"));
  });
  it("bloco ocupado = duração + preparação", () => {
    const [s] = computeSlots(base);
    expect(s!.endsAt.getTime() - s!.startsAt.getTime()).toBe(50 * 60_000);
  });
  it("feriado não tem horários", () => {
    expect(computeSlots({ ...base, isHoliday: true })).toEqual([]);
  });
  it("dia sem expediente não tem horários", () => {
    expect(computeSlots({ ...base, hours: [] })).toEqual([]);
  });
  it("bloqueio remove horários sobrepostos", () => {
    const slots = computeSlots({
      ...base,
      blocks: [{ resourceId: null, startsAt: at("12:00"), endsAt: at("14:00") }],
    });
    const starts = slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(at("12:00").getTime());
    expect(starts).not.toContain(at("13:30").getTime());
    expect(starts).toContain(at("14:00").getTime());
    expect(starts).toContain(at("11:00").getTime()); // 11:00 + 50min = 11:50, não encosta
  });
  it("pausa (duas janelas) respeita o intervalo", () => {
    const slots = computeSlots({
      ...base,
      hours: [
        { opensAt: "08:00", closesAt: "12:00" },
        { opensAt: "14:00", closesAt: "18:00" },
      ],
    });
    const starts = slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(at("12:00").getTime());
    expect(starts).not.toContain(at("13:00").getTime());
    expect(starts).toContain(at("14:00").getTime());
  });
  it("horário ocupado some; com 2 vagas continua oferecido", () => {
    const booked = [{ resourceId: "r1", startsAt: at("09:00"), endsAt: at("09:50") }];
    expect(computeSlots({ ...base, booked }).map((s) => s.startsAt.getTime())).not.toContain(at("09:00").getTime());
    const two = computeSlots({ ...base, resourceIds: ["r1", "r2"], booked });
    const s = two.find((x) => x.startsAt.getTime() === at("09:00").getTime());
    expect(s?.freeResourceIds).toEqual(["r2"]);
  });
  it("respeita antecedência mínima", () => {
    const now = new Date(at("08:30").getTime() - 30 * 60_000); // 30 min antes de 08:30
    const slots = computeSlots({ ...base, now });
    expect(slots[0]!.startsAt.getTime()).toBeGreaterThanOrEqual(now.getTime() + 60 * 60_000);
  });
  it("não oferece datas passadas nem além da antecedência máxima", () => {
    expect(computeSlots({ ...base, date: "2029-12-31" })).toEqual([]);
    expect(computeSlots({ ...base, date: "2030-03-01" })).toEqual([]);
  });
  it("rejeita data inválida", () => {
    expect(computeSlots({ ...base, date: "2030-02-31" })).toEqual([]);
  });
  it("virada de dia: horário local 23:30 não vaza para o dia seguinte", () => {
    const slots = computeSlots({ ...base, hours: [{ opensAt: "22:00", closesAt: "23:59" }] });
    expect(slots.every((s) => s.startsAt.toISOString().startsWith("2030-01-08T0"))).toBe(true); // 22:00 local = 01:00Z
  });
});

describe("máquina de estados", () => {
  it("permite e bloqueia transições", () => {
    expect(canTransition("PENDENTE", "CONFIRMADO")).toBe(true);
    expect(canTransition("CONFIRMADO", "CONVERTIDO_EM_OS")).toBe(true);
    expect(canTransition("CANCELADO", "CONFIRMADO")).toBe(false);
    expect(canTransition("PENDENTE", "CONCLUIDO")).toBe(false);
  });
});

describe("createAppointment", () => {
  it("cria agendamento com preço contratado e histórico", async () => {
    const { db, externa } = await setup();
    const r = await createAppointment(
      db,
      { ...customer(), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("09:00") },
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.priceCents).toBe(4000);
    expect(r.value.status).toBe("PENDENTE");
    expect(r.value.code).toMatch(/^[A-Z2-9]{8}$/);
    const hist = await db.select().from(appointmentHistory).where(eq(appointmentHistory.appointmentId, r.value.id));
    expect(hist).toHaveLength(1);
  });

  it("alterar a tabela de preços não altera o agendamento já criado", async () => {
    const { db, externa } = await setup();
    const r = await createAppointment(
      db,
      { ...customer(), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("09:00") },
      { now: NOW },
    );
    await db.update(servicePrices).set({ priceCents: 9999 });
    if (!r.ok) throw new Error("falhou");
    const [row] = await db.select().from(appointments).where(eq(appointments.id, r.value.id));
    expect(row!.priceCents).toBe(4000);
  });

  it("usa preço promocional válido e ignora o expirado", async () => {
    const { db, externa } = await setup();
    await db
      .update(servicePrices)
      .set({ promoPriceCents: 3000, promoUntil: new Date("2030-12-31T00:00:00Z") })
      .where(eq(servicePrices.category, "CARRO_PEQUENO"));
    const ok = await createAppointment(
      db,
      { ...customer(1), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("09:00") },
      { now: NOW },
    );
    expect(ok.ok && ok.value.priceCents).toBe(3000);
    await db.update(servicePrices).set({ promoUntil: new Date("2029-01-01T00:00:00Z") });
    const expired = await createAppointment(
      db,
      { ...customer(2), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("11:00") },
      { now: NOW },
    );
    expect(expired.ok && expired.value.priceCents).toBe(4000);
  });

  it("rejeita horário já ocupado (1 vaga) e aceita na 2ª vaga", async () => {
    const one = await setup(1);
    const input = (n: number) => ({
      ...customer(n),
      category: "CARRO_PEQUENO" as const,
      serviceId: one.externa.id,
      startsAt: at("09:00"),
    });
    expect((await createAppointment(one.db, input(1), { now: NOW })).ok).toBe(true);
    const second = await createAppointment(one.db, input(2), { now: NOW });
    expect(second).toMatchObject({ ok: false, error: "HORARIO_INDISPONIVEL" });

    const two = await setup(2);
    const input2 = (n: number) => ({
      ...customer(n),
      category: "CARRO_PEQUENO" as const,
      serviceId: two.externa.id,
      startsAt: at("09:00"),
    });
    expect((await createAppointment(two.db, input2(1), { now: NOW })).ok).toBe(true);
    expect((await createAppointment(two.db, input2(2), { now: NOW })).ok).toBe(true);
    expect((await createAppointment(two.db, input2(3), { now: NOW })).ok).toBe(false);
  });

  it("concorrência pelo último horário: só uma reserva é confirmada", async () => {
    const { db, externa } = await setup(1);
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        createAppointment(
          db,
          { ...customer(n), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("10:00") },
          { now: NOW },
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const rows = await db.select().from(appointments);
    expect(rows).toHaveLength(1);
  });

  it("rejeita fora do expediente, domingo, feriado e bloqueio", async () => {
    const { db, externa } = await setup();
    const base = { ...customer(), category: "CARRO_PEQUENO" as const, serviceId: externa.id };
    const try_ = (startsAt: Date) => createAppointment(db, { ...base, startsAt }, { now: NOW });

    expect(await try_(at("07:00"))).toMatchObject({ ok: false, error: "HORARIO_INDISPONIVEL" });
    expect(await try_(at("17:30"))).toMatchObject({ ok: false, error: "HORARIO_INDISPONIVEL" });
    expect(await try_(at("09:00", "2030-01-06"))).toMatchObject({ ok: false, error: "HORARIO_INDISPONIVEL" }); // domingo

    await db.insert(holidays).values({ day: "2030-01-08", name: "Feriado teste" });
    expect(await try_(at("09:00", "2030-01-08"))).toMatchObject({ ok: false });

    await db.insert(scheduleBlocks).values({ startsAt: at("14:00"), endsAt: at("16:00"), reason: "Manutenção" });
    expect(await try_(at("14:30"))).toMatchObject({ ok: false });
    expect((await try_(at("16:00"))).ok).toBe(true);
  });

  it("rejeita datas passadas e horários que não são do passo de agenda", async () => {
    const { db, externa } = await setup();
    const base = { ...customer(), category: "CARRO_PEQUENO" as const, serviceId: externa.id };
    expect(await createAppointment(db, { ...base, startsAt: at("09:00", "2030-01-03") }, { now: NOW })).toMatchObject({ ok: false });
    expect(await createAppointment(db, { ...base, startsAt: at("09:10") }, { now: NOW })).toMatchObject({ ok: false });
  });

  it("serviço indisponível para a categoria (completa de moto)", async () => {
    const { db, completa } = await setup();
    const r = await createAppointment(
      db,
      { ...customer(), category: "MOTO", serviceId: completa.id, startsAt: at("09:00") },
      { now: NOW },
    );
    expect(r).toMatchObject({ ok: false, error: "SERVICO_INDISPONIVEL" });
  });

  it("valida telefone e placa", async () => {
    const { db, externa } = await setup();
    const base = { ...customer(), category: "CARRO_PEQUENO" as const, serviceId: externa.id, startsAt: at("09:00") };
    expect(await createAppointment(db, { ...base, phone: "123" }, { now: NOW })).toMatchObject({ error: "DADOS_INVALIDOS" });
    expect(await createAppointment(db, { ...base, plate: "XX" }, { now: NOW })).toMatchObject({ error: "DADOS_INVALIDOS" });
    const ok = await createAppointment(db, { ...base, plate: "abc-1d23" }, { now: NOW });
    expect(ok.ok && ok.value.vehiclePlate).toBe("ABC1D23");
  });

  it("reutiliza o cliente pelo telefone", async () => {
    const { db, externa } = await setup();
    const base = { ...customer(), category: "CARRO_PEQUENO" as const, serviceId: externa.id };
    await createAppointment(db, { ...base, startsAt: at("09:00") }, { now: NOW });
    await createAppointment(db, { ...base, phone: "+55 (79) 99900-0001", startsAt: at("11:00") }, { now: NOW });
    const rows = await db.select().from(appointments);
    expect(new Set(rows.map((r) => r.customerId)).size).toBe(1);
  });
});

describe("cancelamento, reagendamento e status", () => {
  async function booked() {
    const s = await setup();
    const r = await createAppointment(
      s.db,
      { ...customer(), category: "CARRO_PEQUENO", serviceId: s.externa.id, startsAt: at("09:00") },
      { now: NOW },
    );
    if (!r.ok) throw new Error("setup falhou");
    return { ...s, appt: r.value };
  }

  it("consulta exige código e telefone corretos", async () => {
    const { db, appt } = await booked();
    expect(await lookupAppointment(db, appt.code, "79999000001")).not.toBeNull();
    expect(await lookupAppointment(db, appt.code, "79999000099")).toBeNull();
    expect(await lookupAppointment(db, "XXXXXXXX", "79999000001")).toBeNull();
  });

  it("cliente cancela dentro do prazo e a vaga é liberada", async () => {
    const { db, appt, externa } = await booked();
    const c = await cancelByCustomer(db, appt.code, "79999000001", NOW);
    expect(c.ok && c.value.status).toBe("CANCELADO");
    const again = await createAppointment(
      db,
      { ...customer(2), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("09:00") },
      { now: NOW },
    );
    expect(again.ok).toBe(true);
  });

  it("cancelamento fora do prazo é recusado", async () => {
    const { db, appt } = await booked();
    const late = new Date(at("09:00").getTime() - 60 * 60_000); // 1h antes; prazo = 2h
    expect(await cancelByCustomer(db, appt.code, "79999000001", late)).toMatchObject({ ok: false, error: "PRAZO_EXPIRADO" });
  });

  it("não cancela com telefone errado nem cancela duas vezes", async () => {
    const { db, appt } = await booked();
    expect(await cancelByCustomer(db, appt.code, "79999000099", NOW)).toMatchObject({ error: "NAO_ENCONTRADO" });
    await cancelByCustomer(db, appt.code, "79999000001", NOW);
    expect(await cancelByCustomer(db, appt.code, "79999000001", NOW)).toMatchObject({ error: "TRANSICAO_INVALIDA" });
  });

  it("reagenda preservando histórico, preço e vínculo", async () => {
    const { db, appt } = await booked();
    await db.update(servicePrices).set({ priceCents: 5000 });
    const r = await rescheduleByCustomer(db, appt.code, "79999000001", at("11:00"), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rescheduledFromId).toBe(appt.id);
    expect(r.value.priceCents).toBe(4000);
    expect(r.value.code).not.toBe(appt.code);
    const [old] = await db.select().from(appointments).where(eq(appointments.id, appt.id));
    expect(old!.status).toBe("REAGENDADO");
    const hist = await db.select().from(appointmentHistory).where(eq(appointmentHistory.appointmentId, appt.id));
    expect(hist.map((h) => h.toStatus)).toEqual(["PENDENTE", "REAGENDADO"]);
  });

  it("reagenda para horário sobreposto ao próprio atendimento", async () => {
    const { db, appt } = await booked();
    const r = await rescheduleByCustomer(db, appt.code, "79999000001", at("09:30"), NOW);
    expect(r.ok).toBe(true);
  });

  it("reagendamento para horário ocupado falha e mantém o original ativo", async () => {
    const { db, appt, externa } = await booked();
    await createAppointment(
      db,
      { ...customer(2), category: "CARRO_PEQUENO", serviceId: externa.id, startsAt: at("12:00") },
      { now: NOW },
    );
    const r = await rescheduleByCustomer(db, appt.code, "79999000001", at("12:00"), NOW);
    expect(r).toMatchObject({ ok: false, error: "HORARIO_INDISPONIVEL" });
    const [still] = await db.select().from(appointments).where(eq(appointments.id, appt.id));
    expect(still!.status).toBe("PENDENTE");
  });

  it("equipe confirma, marca não comparecimento e não faz transição inválida", async () => {
    const { db, appt } = await booked();
    const [staff] = await db
      .insert(users)
      .values({ name: "Atendente", email: "a@example.com", passwordHash: "x", role: "ATENDENTE" })
      .returning();
    expect((await changeStatus(db, appt.id, "CONFIRMADO", staff!.id)).ok).toBe(true);
    expect(await changeStatus(db, appt.id, "CONCLUIDO", staff!.id)).toMatchObject({ error: "TRANSICAO_INVALIDA" });
    expect((await changeStatus(db, appt.id, "NAO_COMPARECEU", staff!.id)).ok).toBe(true);
    expect(await changeStatus(db, appt.id, "CONFIRMADO", staff!.id)).toMatchObject({ error: "TRANSICAO_INVALIDA" });
    const hist = await db.select().from(appointmentHistory).where(eq(appointmentHistory.appointmentId, appt.id));
    expect(hist.map((h) => h.toStatus)).toEqual(["PENDENTE", "CONFIRMADO", "NAO_COMPARECEU"]);
  });
});
