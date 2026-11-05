import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { servicePrices, services } from "@/db/schema";

export interface CatalogService {
  id: string;
  name: string;
  description: string | null;
  includes: string[];
  excludes: string[];
  durationMinutes: number;
  /** Preço em centavos por categoria; categoria ausente = indisponível. */
  prices: Partial<Record<string, number>>;
}

/** Serviços ativos com preço por categoria. Fonte única para o site e o agendamento. */
export async function getCatalog(db: Database): Promise<CatalogService[]> {
  const svcs = await db.select().from(services).where(eq(services.active, true)).orderBy(asc(services.displayOrder));
  const prices = await db.select().from(servicePrices).where(eq(servicePrices.active, true));
  return svcs.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    includes: s.includes,
    excludes: s.excludes,
    durationMinutes: s.durationMinutes,
    prices: Object.fromEntries(prices.filter((p) => p.serviceId === s.id).map((p) => [p.category, p.priceCents])),
  }));
}

/** Duração efetiva do serviço para a categoria, ou null se indisponível. */
export async function resolveDuration(db: Database, serviceId: string, category: string): Promise<number | null> {
  const rows = await db
    .select({ duration: services.durationMinutes, override: servicePrices.durationMinutesOverride })
    .from(services)
    .innerJoin(servicePrices, eq(servicePrices.serviceId, services.id))
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.active, true),
        eq(servicePrices.active, true),
        eq(servicePrices.category, category as "MOTO"),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? (row.override ?? row.duration) : null;
}
