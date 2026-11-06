import { asc } from "drizzle-orm";
import type { Database } from "@/db/client";
import { operatingHours } from "@/db/schema";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Horário de funcionamento por dia, para exibição pública ("08:00–12:00, 13:00–18:00" ou "Fechado"). */
export async function getOpeningHours(db: Database): Promise<{ day: string; hours: string }[]> {
  const rows = await db.select().from(operatingHours).orderBy(asc(operatingHours.opensAt));
  return [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const windows = rows.filter((r) => r.weekday === wd).map((r) => `${r.opensAt.slice(0, 5)}–${r.closesAt.slice(0, 5)}`);
    return { day: WEEKDAYS[wd]!, hours: windows.length ? windows.join(", ") : "Fechado" };
  });
}
