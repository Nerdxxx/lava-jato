import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { CATEGORY_ORDER } from "./labels";

/**
 * Serviços adicionais (cera, remoção de chuva ácida...). Ficam em business_settings["addons"], editáveis em Configurações.
 * O preço é somado ao do serviço principal NO SERVIDOR, no momento do agendamento, e fica congelado (snapshot)
 * no agendamento e na OS — igual ao preço do serviço principal.
 */
export interface Addon {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  /** Tempo operacional adicional; somado à duração do serviço para reservar a vaga. */
  durationMinutes: number;
  active: boolean;
  /** Categorias de veículo em que o adicional pode ser contratado. */
  categories: string[];
}

/** Snapshot gravado no agendamento/OS. */
export interface AppliedAddon {
  slug: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}

const CAR_CATEGORIES = CATEGORY_ORDER.filter((c) => c !== "MOTO");

/** Valores definidos pelo negócio (nov/2026). Usados enquanto o painel não salvar outra configuração. */
export const DEFAULT_ADDONS: Addon[] = [
  {
    slug: "cera",
    name: "Aplicação de cera",
    description: "Acabamento com brilho e proteção superficial da pintura.",
    priceCents: 2000,
    durationMinutes: 10,
    active: true,
    categories: [...CAR_CATEGORIES],
  },
  {
    slug: "chuva-acida-vidros",
    name: "Remoção de manchas de chuva ácida dos vidros",
    description: "Tratamento de manchas minerais nos vidros. O resultado depende do tipo de mancha e das condições do vidro.",
    priceCents: 4000,
    durationMinutes: 10,
    active: true,
    categories: [...CAR_CATEGORIES],
  },
];

const KEY = "addons";

const addonSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2, "Informe o nome do adicional.").max(80),
  description: z.string().trim().max(240),
  priceCents: z.number().int().min(0).max(10_000_00),
  durationMinutes: z.number().int().min(1).max(600).default(10),
  active: z.boolean(),
  categories: z.array(z.enum(CATEGORY_ORDER)).max(CATEGORY_ORDER.length),
});

export async function loadAddons(db: Database): Promise<Addon[]> {
  const [row] = await db.select().from(businessSettings).where(eq(businessSettings.key, KEY)).limit(1);
  if (!row) return DEFAULT_ADDONS.map((a) => ({ ...a, categories: [...a.categories] }));
  const parsed = z.array(addonSchema).safeParse(row.value);
  return parsed.success ? parsed.data : [];
}

/** Adicionais que o cliente pode escolher para a categoria (ativos, com a categoria habilitada). */
export function addonsFor(addons: Addon[], category: string): Addon[] {
  return addons.filter((a) => a.active && a.categories.includes(category));
}

export async function saveAddon(
  db: Database,
  input: Addon,
): Promise<{ ok: true; value: Addon[] } | { ok: false; message: string }> {
  const p = addonSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Dados do adicional inválidos." };
  const current = await loadAddons(db);
  const idx = current.findIndex((a) => a.slug === p.data.slug);
  const next = idx === -1 ? [...current, p.data] : current.map((a, i) => (i === idx ? p.data : a));
  await db
    .insert(businessSettings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({ target: businessSettings.key, set: { value: next, updatedAt: new Date() } });
  return { ok: true, value: next };
}

/**
 * Resolve os adicionais escolhidos contra a configuração vigente.
 * Recusa adicional desconhecido, inativo ou não disponível para a categoria (nunca confia no preço vindo do cliente).
 */
export function resolveAddons(
  addons: Addon[],
  category: string,
  slugs: string[],
): { ok: true; value: AppliedAddon[] } | { ok: false; message: string } {
  const unique = [...new Set(slugs)];
  const available = addonsFor(addons, category);
  const out: AppliedAddon[] = [];
  for (const slug of unique) {
    const a = available.find((x) => x.slug === slug);
    if (!a) return { ok: false, message: "Um dos adicionais escolhidos não está disponível para este veículo." };
    out.push({ slug: a.slug, name: a.name, priceCents: a.priceCents, durationMinutes: a.durationMinutes });
  }
  return { ok: true, value: out };
}

export const addonsTotal = (list: AppliedAddon[]): number => list.reduce((s, a) => s + a.priceCents, 0);

export const addonsDuration = (list: AppliedAddon[]): number => list.reduce((s, a) => s + (a.durationMinutes ?? 10), 0);
