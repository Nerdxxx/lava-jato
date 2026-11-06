import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { normalizePhone } from "@/lib/phone";

/** Dados públicos do negócio (rodapé, contato, mensagens de WhatsApp). Editáveis em Configurações. */
export interface BusinessProfile {
  name: string;
  /** WhatsApp do lava jato: só dígitos com DDD (vazio = não informado). */
  whatsapp: string;
  address: string;
  /** Link do Google Maps (opcional). */
  mapsUrl: string;
  /** Usuário do Instagram sem @ (opcional). */
  instagram: string;
  /** Chave Pix exibida no recibo (opcional). */
  pixKey: string;
}

export const DEFAULT_PROFILE: BusinessProfile = {
  name: "Lava Jato Capuã",
  whatsapp: "",
  address: "Povoado Capuã, Barra dos Coqueiros — SE",
  mapsUrl: "",
  instagram: "",
  pixKey: "",
};

const KEY = "business_profile";

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome do negócio.").max(80),
  whatsapp: z.string().trim().max(20),
  address: z.string().trim().max(200),
  mapsUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\//.test(v), "O link do mapa deve começar com https://"),
  instagram: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || /^[A-Za-z0-9._]+$/.test(v), "Instagram inválido."),
  pixKey: z.string().trim().max(120),
});

export async function loadProfile(db: Database): Promise<BusinessProfile> {
  const [row] = await db.select().from(businessSettings).where(eq(businessSettings.key, KEY)).limit(1);
  const value = (row?.value ?? {}) as Partial<BusinessProfile>;
  return { ...DEFAULT_PROFILE, ...Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "string")) };
}

export async function saveProfile(
  db: Database,
  raw: z.input<typeof schema>,
): Promise<{ ok: true; value: BusinessProfile } | { ok: false; message: string }> {
  const p = schema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Dados inválidos." };
  let whatsapp = "";
  if (p.data.whatsapp) {
    const n = normalizePhone(p.data.whatsapp);
    if (!n) return { ok: false, message: "WhatsApp do negócio inválido. Use o DDD." };
    whatsapp = n;
  }
  const value: BusinessProfile = { ...p.data, whatsapp };
  await db
    .insert(businessSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: businessSettings.key, set: { value, updatedAt: new Date() } });
  return { ok: true, value };
}

export function formatPhoneBR(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}
