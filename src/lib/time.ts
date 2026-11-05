// America/Maceio não usa horário de verão (UTC-3 fixo desde 2019). Se isso mudar, trocar por biblioteca de fuso.
export const TIMEZONE = "America/Maceio";
export const TZ_OFFSET_MINUTES = -180;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

export function isValidDateStr(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** "2030-01-07" + "08:30" (hora local de Maceió) → instante UTC. */
export function localToUtc(dateStr: string, time: string): Date {
  const dm = DATE_RE.exec(dateStr);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw new Error(`Data/hora inválida: ${dateStr} ${time}`);
  const ms = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  return new Date(ms - TZ_OFFSET_MINUTES * 60_000);
}

/** 0=domingo..6=sábado para uma data local. */
export function weekdayOf(dateStr: string): number {
  const m = DATE_RE.exec(dateStr);
  if (!m) throw new Error(`Data inválida: ${dateStr}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** Data local (YYYY-MM-DD) de um instante. */
export function localDateOf(instant: Date): string {
  return new Date(instant.getTime() + TZ_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const m = DATE_RE.exec(dateStr);
  if (!m) throw new Error(`Data inválida: ${dateStr}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)).toISOString().slice(0, 10);
}

export function formatDateTimeBR(instant: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

export function formatTimeBR(instant: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(instant);
}
