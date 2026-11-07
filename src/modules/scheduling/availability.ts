import { and, eq, gt, inArray, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { appointments, holidays, operatingHours, resources, scheduleBlocks } from "@/db/schema";
import { addDays, isValidDateStr, localDateOf, localToUtc, weekdayOf } from "@/lib/time";
import { ACTIVE_STATUSES } from "./state-machine";
import { loadSettings, type SchedulingSettings } from "./settings";

export interface Slot {
  startsAt: Date;
  /** Fim do bloco ocupado (duração + preparação). */
  endsAt: Date;
  /** Vagas livres neste horário (a primeira é a escolhida na reserva). */
  freeResourceIds: string[];
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface AvailabilityInput {
  /** Data local YYYY-MM-DD. */
  date: string;
  durationMinutes: number;
  settings: SchedulingSettings;
  now: Date;
  /** Janelas de funcionamento do dia da semana, "HH:MM". */
  hours: { opensAt: string; closesAt: string }[];
  isHoliday: boolean;
  resourceIds: string[];
  /** Bloqueios; resourceId null = todas as vagas. */
  blocks: { resourceId: string | null; startsAt: Date; endsAt: Date }[];
  /** Agendamentos ativos. */
  booked: { resourceId: string; startsAt: Date; endsAt: Date }[];
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart < bEnd && bStart < aEnd;

/** Função pura: calcula os horários livres de uma data. Sem acesso a banco ou relógio. */
export function computeSlots(input: AvailabilityInput): Slot[] {
  const { date, durationMinutes, settings, now, hours, isHoliday, resourceIds, blocks, booked } = input;
  if (!isValidDateStr(date) || isHoliday || resourceIds.length === 0 || durationMinutes <= 0) return [];

  const earliest = new Date(now.getTime() + settings.minAdvanceMinutes * 60_000);
  const latest = localToUtc(addDays(localDateOf(now), settings.maxAdvanceDays), "23:59");
  const slots: Slot[] = [];

  for (const window of hours) {
    const opens = localToUtc(date, window.opensAt);
    const closes = localToUtc(date, window.closesAt);
    const stepMs = settings.slotStepMinutes * 60_000;

    for (let t = opens.getTime(); ; t += stepMs) {
      const start = new Date(t);
      const finish = new Date(t + durationMinutes * 60_000);
      const end = new Date(finish.getTime() + settings.prepMinutes * 60_000);
      if (end > closes) break; // atendimento e preparação precisam caber no expediente
      if (start < earliest || start > latest) continue;

      const free = resourceIds.filter(
        (rid) =>
          !blocks.some((b) => (b.resourceId === null || b.resourceId === rid) && overlaps(start, end, b.startsAt, b.endsAt)) &&
          !booked.some((a) => a.resourceId === rid && overlaps(start, end, a.startsAt, a.endsAt)),
      );
      if (free.length > 0) slots.push({ startsAt: start, endsAt: end, freeResourceIds: free });
    }
  }
  return slots;
}

/** Carrega os dados do banco e calcula os horários livres da data. */
export async function getAvailableSlots(
  db: Database,
  params: { date: string; durationMinutes: number; now?: Date; excludeAppointmentId?: string },
): Promise<Slot[]> {
  const { date, durationMinutes, now = new Date(), excludeAppointmentId } = params;
  if (!isValidDateStr(date)) return [];

  const dayStart = localToUtc(date, "00:00");
  const dayEnd = localToUtc(addDays(date, 1), "00:00");

  const [settings, hourRows, holidayRows, resourceRows, blockRows, bookedRows] = await Promise.all([
    loadSettings(db),
    db.select().from(operatingHours).where(eq(operatingHours.weekday, weekdayOf(date))),
    db.select().from(holidays).where(eq(holidays.day, date)),
    db.select({ id: resources.id }).from(resources).where(eq(resources.active, true)),
    db
      .select()
      .from(scheduleBlocks)
      .where(and(lt(scheduleBlocks.startsAt, dayEnd), gt(scheduleBlocks.endsAt, dayStart))),
    db
      .select({
        id: appointments.id,
        resourceId: appointments.resourceId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
      })
      .from(appointments)
      .where(
        and(
          inArray(appointments.status, [...ACTIVE_STATUSES]),
          lt(appointments.startsAt, dayEnd),
          gt(appointments.endsAt, dayStart),
        ),
      ),
  ]);

  return computeSlots({
    date,
    durationMinutes,
    settings,
    now,
    hours: hourRows.map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt })),
    isHoliday: holidayRows.length > 0,
    resourceIds: resourceRows.map((r) => r.id),
    blocks: blockRows.map((b) => ({ resourceId: b.resourceId, startsAt: b.startsAt, endsAt: b.endsAt })),
    booked: bookedRows.filter((b) => b.id !== excludeAppointmentId),
  });
}
