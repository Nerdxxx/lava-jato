import type { CatalogService } from "@/modules/scheduling/catalog";

/** Ofertas exibidas no site, derivadas do catálogo do banco (nada de preço fixo no componente). */
export interface Offer {
  key: string;
  title: string;
  /** Serviço do catálogo e categoria pré-selecionados ao clicar em "Agendar". */
  serviceId: string;
  category?: string;
  description: string | null;
  includes: string[];
  excludes: string[];
  durationMinutes: number;
  minCents: number;
  /** true quando o preço varia conforme o veículo ("a partir de"). */
  varies: boolean;
  kind: "moto" | "car";
}

const priceList = (s: CatalogService, cats: (c: string) => boolean) =>
  Object.entries(s.prices)
    .filter(([c, v]) => cats(c) && typeof v === "number")
    .map(([, v]) => v as number);

/**
 * Motos ganham um card próprio (com o preço da categoria MOTO), e os cards de carro usam só as categorias de carro —
 * assim o preço da moto nunca aparece como "a partir de" da lavagem de carro.
 */
export function buildOffers(catalog: CatalogService[]): Offer[] {
  const offers: Offer[] = [];
  const moto = catalog.find((s) => typeof s.prices.MOTO === "number");
  if (moto) {
    const motoServices = catalog.filter((s) => typeof s.prices.MOTO === "number");
    const values = motoServices.map((s) => s.prices.MOTO as number);
    const durations = motoServices.map((s) => s.durations.MOTO ?? s.durationMinutes);
    offers.push({
      key: "moto",
      title: "Lavagem de motos",
      serviceId: moto.id,
      category: "MOTO",
      description: motoServices.length === 1 ? `${moto.name} para motos.` : null,
      includes: moto.includesByCategory.MOTO ?? moto.includes,
      excludes: moto.excludes,
      durationMinutes: Math.min(...durations),
      minCents: Math.min(...values),
      varies: new Set(values).size > 1,
      kind: "moto",
    });
  }
  for (const s of catalog) {
    const values = priceList(s, (c) => c !== "MOTO");
    if (values.length === 0) continue;
    const durations = Object.entries(s.durations)
      .filter((entry): entry is [string, number] => entry[0] !== "MOTO" && typeof entry[1] === "number")
      .map(([, v]) => v);
    offers.push({
      key: s.id,
      title: s.name,
      serviceId: s.id,
      description: s.description,
      includes: s.includesByCategory.MOTO && Object.keys(s.prices).length === 1 ? s.includesByCategory.MOTO : s.includes,
      excludes: s.excludes,
      durationMinutes: durations.length ? Math.min(...durations) : s.durationMinutes,
      minCents: Math.min(...values),
      varies: new Set(values).size > 1,
      kind: "car",
    });
  }
  return offers;
}

export function bookingHref(serviceId?: string, category?: string): string {
  const p = new URLSearchParams();
  if (category) p.set("categoria", category);
  if (serviceId) p.set("servico", serviceId);
  const q = p.toString();
  return q ? `/agendar?${q}` : "/agendar";
}
