/**
 * Confere preços e durações por categoria. Sem argumentos: só mostra diferenças.
 * --aplicar atualiza preços e descrições ausentes; --aplicar-duracoes atualiza apenas tempos e é uma decisão separada.
 *   npx tsx --env-file-if-exists=.env scripts/precos.ts [--aplicar] [--aplicar-duracoes]
 */
import { and, eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { auditLogs, servicePrices, services } from "../src/db/schema";

type Cat = "MOTO" | "CARRO_PEQUENO" | "CARRO_MEDIO" | "SUV" | "PICAPE";
// Descrições só são gravadas quando o serviço ainda não tem nenhuma (nunca sobrescreve texto do painel).
const DESCRIPTIONS: Record<string, string> = {
  "lavagem-externa": "Limpeza da parte de fora do veículo, com rodas, pneus e vidros.",
  "lavagem-completa": "Lavagem externa mais limpeza interna básica: aspiração, painel, portas e vidros.",
};
const REFERENCE: Record<string, Partial<Record<Cat, number>>> = {
  "lavagem-externa": { MOTO: 3000, CARRO_PEQUENO: 4000, CARRO_MEDIO: 4000, SUV: 6000, PICAPE: 6000 },
  "lavagem-completa": { CARRO_PEQUENO: 6000, CARRO_MEDIO: 7000, SUV: 9000, PICAPE: 10000 },
};
const DURATION_REFERENCE: Record<string, Partial<Record<Cat, number>>> = {
  "lavagem-externa": { MOTO: 30, CARRO_PEQUENO: 50, CARRO_MEDIO: 60, SUV: 70, PICAPE: 80 },
  "lavagem-completa": { CARRO_PEQUENO: 90, CARRO_MEDIO: 100, SUV: 120, PICAPE: 130 },
};

const applyPrices = process.argv.includes("--aplicar");
const applyDurations = process.argv.includes("--aplicar-duracoes");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");
const handle = await createDb(url);
const { db } = handle;
const brl = (c: number | undefined) => (c === undefined ? "—" : `R$ ${(c / 100).toFixed(2).replace(".", ",")}`);
let priceDiffs = 0;
let durationDiffs = 0;
let descriptionDiffs = 0;

for (const [slug, prices] of Object.entries(REFERENCE)) {
  const [svc] = await db.select().from(services).where(eq(services.slug, slug)).limit(1);
  if (!svc) {
    console.log(`! serviço "${slug}" não existe no banco — rode o seed.`);
    continue;
  }
  if (!svc.description && DESCRIPTIONS[slug]) {
    descriptionDiffs++;
    console.log(`${svc.name}: sem descrição → "${DESCRIPTIONS[slug]}"`);
    if (applyPrices) await db.update(services).set({ description: DESCRIPTIONS[slug] }).where(eq(services.id, svc.id));
  }
  for (const [category, cents] of Object.entries(prices) as [Cat, number][]) {
    const [row] = await db
      .select()
      .from(servicePrices)
      .where(and(eq(servicePrices.serviceId, svc.id), eq(servicePrices.category, category)))
      .limit(1);
    const current = row?.active ? row.priceCents : undefined;
    if (current === cents) continue;
    priceDiffs++;
    console.log(`${svc.name} / ${category}: banco ${brl(current)} → referência ${brl(cents)}`);
    if (!applyPrices) continue;
    if (row) await db.update(servicePrices).set({ priceCents: cents, active: true }).where(eq(servicePrices.id, row.id));
    else await db.insert(servicePrices).values({ serviceId: svc.id, category, priceCents: cents });
    await db.insert(auditLogs).values({
      action: "config.price.reference",
      entity: "service_price",
      details: `${slug} ${category}: ${brl(current)} -> ${brl(cents)}`,
    });
  }
  for (const [category, minutes] of Object.entries(DURATION_REFERENCE[slug] ?? {}) as [Cat, number][]) {
    const [row] = await db
      .select()
      .from(servicePrices)
      .where(and(eq(servicePrices.serviceId, svc.id), eq(servicePrices.category, category)))
      .limit(1);
    if (!row?.active) continue;
    const current = row.durationMinutesOverride ?? svc.durationMinutes;
    if (current === minutes) continue;
    durationDiffs++;
    console.log(`${svc.name} / ${category}: duração no banco ${current} min → referência ${minutes} min`);
    if (!applyDurations) continue;
    await db.update(servicePrices).set({ durationMinutesOverride: minutes }).where(eq(servicePrices.id, row.id));
    await db.insert(auditLogs).values({
      action: "config.duration.reference",
      entity: "service_price",
      details: `${slug} ${category}: ${current} min -> ${minutes} min`,
    });
  }
}
if (priceDiffs === 0 && durationDiffs === 0 && descriptionDiffs === 0) console.log("Banco igual às referências de preço, duração e descrição.");
else if (applyPrices || applyDurations) console.log(`Diferenças: ${priceDiffs} de preço, ${durationDiffs} de duração e ${descriptionDiffs} de descrição. Consulte os avisos acima para confirmar o que foi gravado.`);
else console.log(`${priceDiffs} diferença(s) de preço, ${durationDiffs} de duração e ${descriptionDiffs} de descrição. Os dados não foram alterados.`);
await handle.close();
