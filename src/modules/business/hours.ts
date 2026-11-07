import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { holidays, operatingHours } from "@/db/schema";
import { TZ_OFFSET_MINUTES, localDateOf, weekdayOf } from "@/lib/time";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export interface DayHours {
  weekday: number;
  day: string;
  /** "08:00–12:00, 13:00–18:00" ou "Fechado". */
  hours: string;
  windows: { opensAt: string; closesAt: string }[];
}

/** Horário de funcionamento por dia (segunda a domingo), vindo do calendário configurado no painel. */
export async function getOpeningHours(db: Database): Promise<DayHours[]> {
  const rows = await db.select().from(operatingHours).orderBy(asc(operatingHours.opensAt));
  return [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const windows = rows
      .filter((r) => r.weekday === wd)
      .map((r) => ({ opensAt: r.opensAt.slice(0, 5), closesAt: r.closesAt.slice(0, 5) }));
    return {
      weekday: wd,
      day: WEEKDAYS[wd]!,
      hours: windows.length ? windows.map((w) => `${w.opensAt}–${w.closesAt}`).join(", ") : "Fechado",
      windows,
    };
  });
}

export interface OpenStatus {
  /** Dia da semana de hoje no fuso de Maceió. */
  todayWeekday: number;
  open: boolean;
  /** Texto curto: "Fecha às 18:00", "Abre às 08:00", "Feriado: ...". */
  detail: string | null;
}

/**
 * "Aberto agora" no fuso America/Maceio (UTC-3 fixo), considerando feriados cadastrados.
 * Retorna null quando não há nenhum horário configurado (informação insuficiente).
 */
export async function getOpenStatus(db: Database, hours: DayHours[], now = new Date()): Promise<OpenStatus | null> {
  if (hours.every((h) => h.windows.length === 0)) return null;
  const today = localDateOf(now);
  const todayWeekday = weekdayOf(today);
  const [holiday] = await db.select().from(holidays).where(eq(holidays.day, today)).limit(1);
  if (holiday) return { todayWeekday, open: false, detail: `Fechado hoje: ${holiday.name}` };

  const local = new Date(now.getTime() + TZ_OFFSET_MINUTES * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const windows = hours.find((h) => h.weekday === todayWeekday)?.windows ?? [];
  const current = windows.find((w) => toMin(w.opensAt) <= minutes && minutes < toMin(w.closesAt));
  if (current) return { todayWeekday, open: true, detail: `Fecha às ${current.closesAt}` };
  const next = windows.find((w) => toMin(w.opensAt) > minutes);
  return { todayWeekday, open: false, detail: next ? `Abre hoje às ${next.opensAt}` : null };
}
