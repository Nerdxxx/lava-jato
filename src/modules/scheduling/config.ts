import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  appointments,
  businessSettings,
  holidays,
  operatingHours,
  resources,
  scheduleBlocks,
  servicePrices,
  services,
} from "@/db/schema";
import { isValidDateStr, localToUtc } from "@/lib/time";
import { VEHICLE_CATEGORIES } from "./booking";
import type { SchedulingSettings } from "./settings";
import { ACTIVE_STATUSES } from "./state-machine";

export type ConfigResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string };
const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// ---------- Regras de agendamento ----------

const settingsSchema = z.object({
  slotStepMinutes: z.number().int().min(5, "Intervalo mínimo: 5 min").max(240),
  prepMinutes: z.number().int().min(0).max(240),
  minAdvanceMinutes: z.number().int().min(0).max(60 * 24 * 7),
  maxAdvanceDays: z.number().int().min(1, "Antecedência máxima mínima: 1 dia").max(365),
  cancelDeadlineHours: z.number().int().min(0).max(24 * 14),
});

export async function saveSettings(db: Database, input: SchedulingSettings): Promise<ConfigResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Valores inválidos.");
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(parsed.data)) {
      await tx
        .insert(businessSettings)
        .values({ key, value })
        .onConflictDoUpdate({ target: businessSettings.key, set: { value, updatedAt: new Date() } });
    }
  });
  return { ok: true, value: undefined };
}

// ---------- Horário de funcionamento ----------

export interface HoursWindow {
  opensAt: string;
  closesAt: string;
}

/** Substitui as janelas de um dia da semana (0=domingo..6=sábado). Lista vazia = fechado. */
export async function saveOperatingHours(db: Database, weekday: number, windows: HoursWindow[]): Promise<ConfigResult> {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return bad("Dia da semana inválido.");
  for (const w of windows) {
    if (!TIME_RE.test(w.opensAt) || !TIME_RE.test(w.closesAt)) return bad("Use horários no formato HH:MM.");
    if (toMinutes(w.opensAt) >= toMinutes(w.closesAt)) return bad("O fechamento deve ser depois da abertura.");
  }
  const sorted = [...windows].sort((a, b) => toMinutes(a.opensAt) - toMinutes(b.opensAt));
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i]!.opensAt) < toMinutes(sorted[i - 1]!.closesAt)) return bad("As janelas do mesmo dia não podem se sobrepor.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(operatingHours).where(eq(operatingHours.weekday, weekday));
    if (sorted.length) await tx.insert(operatingHours).values(sorted.map((w) => ({ weekday, ...w })));
  });
  return { ok: true, value: undefined };
}

// ---------- Feriados ----------

export async function addHoliday(db: Database, day: string, name: string): Promise<ConfigResult> {
  if (!isValidDateStr(day)) return bad("Data inválida.");
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 100) return bad("Informe o nome do feriado (2 a 100 caracteres).");
  const exists = await db.select({ id: holidays.id }).from(holidays).where(eq(holidays.day, day)).limit(1);
  if (exists.length) return bad("Já existe um feriado nesta data.");
  await db.insert(holidays).values({ day, name: clean });
  return { ok: true, value: undefined };
}

export async function removeHoliday(db: Database, id: string): Promise<void> {
  await db.delete(holidays).where(eq(holidays.id, id));
}

// ---------- Bloqueios ----------

/** Conta agendamentos ativos que colidem com o intervalo (a equipe decide o que fazer com eles). */
export async function countConflicts(db: Database, startsAt: Date, endsAt: Date, resourceId: string | null): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(appointments)
    .where(
      and(
        inArray(appointments.status, [...ACTIVE_STATUSES]),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
        resourceId ? eq(appointments.resourceId, resourceId) : undefined,
      ),
    );
  return row?.n ?? 0;
}

export async function addBlock(
  db: Database,
  input: { date: string; startTime: string; endTime: string; resourceId: string | null; reason: string },
  userId: string,
): Promise<ConfigResult<{ conflicts: number }>> {
  if (!isValidDateStr(input.date)) return bad("Data inválida.");
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) return bad("Use horários no formato HH:MM.");
  if (toMinutes(input.startTime) >= toMinutes(input.endTime)) return bad("O fim do bloqueio deve ser depois do início.");
  const startsAt = localToUtc(input.date, input.startTime);
  const endsAt = localToUtc(input.date, input.endTime);
  if (input.resourceId) {
    const r = await db.select({ id: resources.id }).from(resources).where(eq(resources.id, input.resourceId)).limit(1);
    if (!r.length) return bad("Vaga não encontrada.");
  }
  await db.insert(scheduleBlocks).values({
    resourceId: input.resourceId,
    startsAt,
    endsAt,
    reason: input.reason.trim().slice(0, 160) || null,
    createdBy: userId,
  });
  return { ok: true, value: { conflicts: await countConflicts(db, startsAt, endsAt, input.resourceId) } };
}

export async function removeBlock(db: Database, id: string): Promise<void> {
  await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id));
}

// ---------- Vagas ----------

export async function addResource(db: Database, name: string): Promise<ConfigResult> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 60) return bad("Informe o nome da vaga (até 60 caracteres).");
  await db.insert(resources).values({ name: clean });
  return { ok: true, value: undefined };
}

export async function setResourceActive(db: Database, id: string, active: boolean): Promise<ConfigResult> {
  if (!active) {
    const others = await db.select({ id: resources.id }).from(resources).where(eq(resources.active, true));
    if (others.filter((r) => r.id !== id).length === 0) return bad("É preciso manter ao menos uma vaga ativa.");
  }
  await db.update(resources).set({ active }).where(eq(resources.id, id));
  return { ok: true, value: undefined };
}

// ---------- Serviços e preços ----------

/** "40", "40,00", "R$ 1.234,50" → centavos. Retorna null se inválido. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) && cents >= 0 && cents <= 10_000_00 ? cents : null;
}

export async function updateService(
  db: Database,
  serviceId: string,
  input: { durationMinutes: number; active: boolean; description?: string },
): Promise<ConfigResult> {
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 600) {
    return bad("Duração deve estar entre 5 e 600 minutos.");
  }
  const updated = await db
    .update(services)
    .set({
      durationMinutes: input.durationMinutes,
      active: input.active,
      ...(input.description !== undefined ? { description: input.description.trim().slice(0, 240) || null } : {}),
    })
    .where(eq(services.id, serviceId))
    .returning({ id: services.id });
  return updated.length ? { ok: true, value: undefined } : bad("Serviço não encontrado.");
}

/**
 * Define o preço de um serviço para uma categoria.
 * priceCents null = serviço indisponível para a categoria. Agendamentos já criados não mudam (preço é snapshot).
 */
export async function setPrice(
  db: Database,
  input: {
    serviceId: string;
    category: string;
    priceCents: number | null;
    promoPriceCents?: number | null;
    promoUntil?: Date | null;
    durationMinutes?: number | null;
  },
): Promise<ConfigResult> {
  if (!(VEHICLE_CATEGORIES as readonly string[]).includes(input.category)) return bad("Categoria inválida.");
  if (input.durationMinutes !== undefined && input.durationMinutes !== null && (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 600)) {
    return bad("Duração por veículo deve estar entre 5 e 600 minutos.");
  }
  const category = input.category as (typeof VEHICLE_CATEGORIES)[number];
  const svc = await db.select({ id: services.id }).from(services).where(eq(services.id, input.serviceId)).limit(1);
  if (!svc.length) return bad("Serviço não encontrado.");

  const where = and(eq(servicePrices.serviceId, input.serviceId), eq(servicePrices.category, category));
  if (input.priceCents === null) {
    await db.update(servicePrices).set({ active: false }).where(where);
    return { ok: true, value: undefined };
  }
  const promo = input.promoPriceCents ?? null;
  const promoUntil = input.promoUntil ?? null;
  if (promo !== null) {
    if (promoUntil === null) return bad("Informe até quando a promoção vale.");
    if (promo >= input.priceCents) return bad("O preço promocional deve ser menor que o preço normal.");
  }
  const values = {
    priceCents: input.priceCents,
    promoPriceCents: promo,
    promoUntil: promo === null ? null : promoUntil,
    active: true,
    ...(input.durationMinutes !== undefined ? { durationMinutesOverride: input.durationMinutes } : {}),
  };
  const existing = await db.select({ id: servicePrices.id }).from(servicePrices).where(where).limit(1);
  if (existing.length) await db.update(servicePrices).set(values).where(where);
  else await db.insert(servicePrices).values({ serviceId: input.serviceId, category, ...values, durationMinutesOverride: input.durationMinutes ?? null });
  return { ok: true, value: undefined };
}
