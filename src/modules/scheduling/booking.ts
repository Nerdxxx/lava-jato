import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { appointmentHistory, appointments, customers, servicePrices, services } from "@/db/schema";
import { normalizePhone, normalizePlate } from "@/lib/phone";
import { localDateOf } from "@/lib/time";
import { addonsDuration, addonsTotal, loadAddons, resolveAddons } from "./addons";
import { getAvailableSlots } from "./availability";
import { loadSettings } from "./settings";
import { canTransition, type AppointmentStatus } from "./state-machine";

export type BookingErrorCode =
  | "DADOS_INVALIDOS"
  | "SERVICO_INDISPONIVEL"
  | "HORARIO_INDISPONIVEL"
  | "NAO_ENCONTRADO"
  | "PRAZO_EXPIRADO"
  | "TRANSICAO_INVALIDA";

export type Result<T> = { ok: true; value: T } | { ok: false; error: BookingErrorCode; message: string };

const fail = (error: BookingErrorCode, message: string): { ok: false; error: BookingErrorCode; message: string } => ({
  ok: false,
  error,
  message,
});

export const VEHICLE_CATEGORIES = ["MOTO", "CARRO_PEQUENO", "CARRO_MEDIO", "SUV", "PICAPE"] as const;

export const bookingInputSchema = z.object({
  category: z.enum(VEHICLE_CATEGORIES),
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date(),
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  phone: z.string().trim().min(8, "Informe seu WhatsApp."),
  vehicleModel: z.string().trim().min(2, "Informe o modelo do veículo.").max(80),
  plate: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(500).optional(),
  /** Slugs dos adicionais escolhidos; nome e preço são resolvidos no servidor. */
  addons: z.array(z.string().max(40)).max(10).optional(),
});
export type BookingInput = z.input<typeof bookingInputSchema>;

/** Extrai o SQLSTATE de erros do driver (que podem vir embrulhados em `cause`). */
export function pgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function effectivePrice(
  p: { priceCents: number; promoPriceCents: number | null; promoUntil: Date | null },
  now: Date,
): number {
  return p.promoPriceCents !== null && p.promoUntil !== null && p.promoUntil > now ? p.promoPriceCents : p.priceCents;
}

async function findCustomerId(db: Database, name: string, phone: string): Promise<string> {
  const found = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone)).limit(1);
  if (found[0]) return found[0].id;
  await db.insert(customers).values({ name, phone }).onConflictDoNothing({ target: customers.phone });
  const again = await db.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone)).limit(1);
  return again[0]!.id;
}

export type AppointmentRow = typeof appointments.$inferSelect;

/** Cria um agendamento validando disponibilidade no servidor; a constraint do banco decide corridas. */
export async function createAppointment(
  db: Database,
  rawInput: BookingInput,
  opts: { now?: Date; actorUserId?: string } = {},
): Promise<Result<AppointmentRow>> {
  const now = opts.now ?? new Date();
  const parsed = bookingInputSchema.safeParse(rawInput);
  if (!parsed.success) return fail("DADOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const input = parsed.data;

  const phone = normalizePhone(input.phone);
  if (!phone) return fail("DADOS_INVALIDOS", "Informe um WhatsApp válido com DDD.");
  let plate: string | null = null;
  if (input.plate) {
    plate = normalizePlate(input.plate);
    if (!plate) return fail("DADOS_INVALIDOS", "Placa inválida.");
  }

  const [svc] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.active, true))).limit(1);
  const [price] = svc
    ? await db
        .select()
        .from(servicePrices)
        .where(
          and(
            eq(servicePrices.serviceId, svc.id),
            eq(servicePrices.category, input.category),
            eq(servicePrices.active, true),
          ),
        )
        .limit(1)
    : [];
  if (!svc || !price) return fail("SERVICO_INDISPONIVEL", "Este serviço não está disponível para o veículo escolhido.");

  const chosen = resolveAddons(await loadAddons(db), input.category, input.addons ?? []);
  if (!chosen.ok) return fail("SERVICO_INDISPONIVEL", chosen.message);

  const duration = (price.durationMinutesOverride ?? svc.durationMinutes) + addonsDuration(chosen.value);
  const slots = await getAvailableSlots(db, { date: localDateOf(input.startsAt), durationMinutes: duration, now });
  const slot = slots.find((s) => s.startsAt.getTime() === input.startsAt.getTime());
  if (!slot) return fail("HORARIO_INDISPONIVEL", "Este horário não está mais disponível. Escolha outro.");

  const customerId = await findCustomerId(db, input.name, phone);

  for (const resourceId of slot.freeResourceIds) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await db.transaction(async (tx) => {
          const [appt] = await tx
            .insert(appointments)
            .values({
              code: generateCode(),
              customerId,
              serviceId: svc.id,
              resourceId,
              category: input.category,
              vehicleModel: input.vehicleModel,
              vehiclePlate: plate,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              priceCents: effectivePrice(price, now) + addonsTotal(chosen.value),
              addons: chosen.value,
              notes: input.notes || null,
            })
            .returning();
          await tx.insert(appointmentHistory).values({
            appointmentId: appt!.id,
            fromStatus: null,
            toStatus: "PENDENTE",
            changedBy: opts.actorUserId ?? null,
            note: "Agendamento solicitado",
          });
          return appt!;
        });
        return { ok: true, value: row };
      } catch (err) {
        const code = pgErrorCode(err);
        if (code === "23P01") break; // vaga tomada por outra reserva: tenta a próxima vaga livre
        if (code === "23505") continue; // colisão de código: gera outro
        throw err;
      }
    }
  }
  return fail("HORARIO_INDISPONIVEL", "Este horário acabou de ser reservado. Escolha outro.");
}

async function loadOwnedAppointment(db: Database, code: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const rows = await db
    .select({ appt: appointments })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(and(eq(appointments.code, code.trim().toUpperCase()), eq(customers.phone, phone)))
    .limit(1);
  return rows[0]?.appt ?? null;
}

/** Consulta pública: exige código E telefone, para não expor dados a quem só adivinha o código. */
export async function lookupAppointment(db: Database, code: string, phone: string) {
  return loadOwnedAppointment(db, code, phone);
}

async function applyStatus(
  db: Database,
  appt: AppointmentRow,
  to: AppointmentStatus,
  by: string | null,
  note: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(appointments)
      .set({ status: to })
      .where(and(eq(appointments.id, appt.id), eq(appointments.status, appt.status)))
      .returning({ id: appointments.id });
    if (updated.length === 0) throw new Error("STATUS_CONFLICT");
    await tx
      .insert(appointmentHistory)
      .values({ appointmentId: appt.id, fromStatus: appt.status, toStatus: to, changedBy: by, note });
  });
}

/** Alteração de status feita pela equipe (validada pela máquina de estados). */
export async function changeStatus(
  db: Database,
  appointmentId: string,
  to: AppointmentStatus,
  userId: string,
  note = "Alterado pela equipe",
): Promise<Result<AppointmentRow>> {
  const [appt] = await db.select().from(appointments).where(eq(appointments.id, appointmentId)).limit(1);
  if (!appt) return fail("NAO_ENCONTRADO", "Agendamento não encontrado.");
  if (!canTransition(appt.status, to)) return fail("TRANSICAO_INVALIDA", `Não é possível ir de ${appt.status} para ${to}.`);
  try {
    await applyStatus(db, appt, to, userId, note);
  } catch (e) {
    if (e instanceof Error && e.message === "STATUS_CONFLICT") {
      return fail("TRANSICAO_INVALIDA", "O agendamento foi alterado por outra pessoa. Atualize a página.");
    }
    throw e;
  }
  return { ok: true, value: { ...appt, status: to } };
}

/** Cancelamento pelo cliente (código + telefone), respeitando o prazo configurado. */
export async function cancelByCustomer(
  db: Database,
  code: string,
  phone: string,
  now = new Date(),
): Promise<Result<AppointmentRow>> {
  const appt = await loadOwnedAppointment(db, code, phone);
  if (!appt) return fail("NAO_ENCONTRADO", "Agendamento não encontrado. Confira o código e o WhatsApp.");
  if (!canTransition(appt.status, "CANCELADO")) return fail("TRANSICAO_INVALIDA", "Este agendamento não pode mais ser cancelado.");
  const { cancelDeadlineHours } = await loadSettings(db);
  if (appt.startsAt.getTime() - now.getTime() < cancelDeadlineHours * 3_600_000) {
    return fail("PRAZO_EXPIRADO", `O prazo para cancelar (${cancelDeadlineHours}h antes) já passou. Fale com o lava jato.`);
  }
  try {
    await applyStatus(db, appt, "CANCELADO", null, "Cancelado pelo cliente");
  } catch (e) {
    if (e instanceof Error && e.message === "STATUS_CONFLICT") return fail("TRANSICAO_INVALIDA", "O agendamento foi alterado. Consulte novamente.");
    throw e;
  }
  return { ok: true, value: { ...appt, status: "CANCELADO" } };
}

/** Reagendamento: o antigo vira REAGENDADO (histórico preservado) e um novo é criado, vinculado ao anterior. */
export async function rescheduleByCustomer(
  db: Database,
  code: string,
  phone: string,
  newStartsAt: Date,
  now = new Date(),
): Promise<Result<AppointmentRow>> {
  const appt = await loadOwnedAppointment(db, code, phone);
  if (!appt) return fail("NAO_ENCONTRADO", "Agendamento não encontrado. Confira o código e o WhatsApp.");
  if (!canTransition(appt.status, "REAGENDADO")) return fail("TRANSICAO_INVALIDA", "Este agendamento não pode mais ser reagendado.");
  const settings = await loadSettings(db);
  if (appt.startsAt.getTime() - now.getTime() < settings.cancelDeadlineHours * 3_600_000) {
    return fail("PRAZO_EXPIRADO", `O prazo para reagendar (${settings.cancelDeadlineHours}h antes) já passou.`);
  }

  const [svc] = await db.select().from(services).where(eq(services.id, appt.serviceId)).limit(1);
  const [price] = await db
    .select()
    .from(servicePrices)
    .where(and(eq(servicePrices.serviceId, appt.serviceId), eq(servicePrices.category, appt.category)))
    .limit(1);
  const duration = price?.durationMinutesOverride ?? svc?.durationMinutes;
  if (!duration) return fail("SERVICO_INDISPONIVEL", "Serviço indisponível.");
  const addonSnapshots = appt.addons.map((a) => ({ ...a, durationMinutes: a.durationMinutes ?? 10 }));

  const slots = await getAvailableSlots(db, {
    date: localDateOf(newStartsAt),
    durationMinutes: duration + addonsDuration(addonSnapshots),
    now,
    excludeAppointmentId: appt.id,
  });
  const slot = slots.find((s) => s.startsAt.getTime() === newStartsAt.getTime());
  if (!slot) return fail("HORARIO_INDISPONIVEL", "Este horário não está disponível. Escolha outro.");

  for (const resourceId of slot.freeResourceIds) {
    try {
      const row = await db.transaction(async (tx) => {
        const freed = await tx
          .update(appointments)
          .set({ status: "REAGENDADO" })
          .where(and(eq(appointments.id, appt.id), eq(appointments.status, appt.status)))
          .returning({ id: appointments.id });
        if (freed.length === 0) throw new Error("STATUS_CONFLICT");
        const [created] = await tx
          .insert(appointments)
          .values({
            code: generateCode(),
            customerId: appt.customerId,
            vehicleId: appt.vehicleId,
            serviceId: appt.serviceId,
            resourceId,
            category: appt.category,
            vehicleModel: appt.vehicleModel,
            vehiclePlate: appt.vehiclePlate,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            priceCents: appt.priceCents, // preço contratado é preservado
            addons: addonSnapshots,
            status: appt.status,
            notes: appt.notes,
            rescheduledFromId: appt.id,
          })
          .returning();
        await tx.insert(appointmentHistory).values([
          { appointmentId: appt.id, fromStatus: appt.status, toStatus: "REAGENDADO", note: `Reagendado para ${created!.code}` },
          { appointmentId: created!.id, fromStatus: null, toStatus: appt.status, note: `Reagendamento de ${appt.code}` },
        ]);
        return created!;
      });
      return { ok: true, value: row };
    } catch (err) {
      if (err instanceof Error && err.message === "STATUS_CONFLICT") return fail("TRANSICAO_INVALIDA", "O agendamento foi alterado. Consulte novamente.");
      if (pgErrorCode(err) === "23P01") continue;
      throw err;
    }
  }
  return fail("HORARIO_INDISPONIVEL", "Este horário acabou de ser reservado. Escolha outro.");
}
