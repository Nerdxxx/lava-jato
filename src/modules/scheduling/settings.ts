import { inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { businessSettings } from "@/db/schema";

export interface SchedulingSettings {
  /** Intervalo entre horários oferecidos (min). */
  slotStepMinutes: number;
  /** Tempo de preparação após cada atendimento (min). */
  prepMinutes: number;
  /** Antecedência mínima para agendar (min). */
  minAdvanceMinutes: number;
  /** Antecedência máxima (dias). */
  maxAdvanceDays: number;
  /** Prazo limite para o cliente cancelar/reagendar (horas antes do horário). */
  cancelDeadlineHours: number;
}

export const DEFAULT_SETTINGS: SchedulingSettings = {
  slotStepMinutes: 30,
  prepMinutes: 10,
  minAdvanceMinutes: 60,
  maxAdvanceDays: 30,
  cancelDeadlineHours: 2,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof SchedulingSettings)[];

/** Lê as configurações persistidas, usando o padrão para chaves ausentes ou inválidas. */
export async function loadSettings(db: Database): Promise<SchedulingSettings> {
  const rows = await db.select().from(businessSettings).where(inArray(businessSettings.key, KEYS));
  const result: SchedulingSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const key = row.key as keyof SchedulingSettings;
    if (typeof row.value === "number" && Number.isFinite(row.value) && row.value >= 0) result[key] = row.value;
  }
  if (result.slotStepMinutes < 5) result.slotStepMinutes = DEFAULT_SETTINGS.slotStepMinutes;
  return result;
}
