import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import {
  expenseCategories,
  operatingHours,
  resources,
  serviceChecklistTemplates,
  servicePrices,
  services,
  users,
} from "../src/db/schema";
import { DEFAULT_EXTERNAL_CHECKLIST, DEFAULT_INTERIOR_CHECKLIST } from "../src/modules/operations/work-orders";
import { DEFAULT_EXPENSE_CATEGORIES } from "../src/modules/finance/expenses";
import { hashPassword, validatePasswordStrength } from "../src/lib/password";

type Cat = "MOTO" | "CARRO_PEQUENO" | "CARRO_MEDIO" | "SUV" | "PICAPE";

// Valores iniciais definidos pelo negócio (centavos). Editáveis no painel administrativo.
const CATALOG = [
  {
    slug: "lavagem-externa",
    name: "Lavagem externa",
    durationMinutes: 40,
    displayOrder: 1,
    includes: [
      "Pré-lavagem quando necessária",
      "Lavagem da lataria",
      "Limpeza de rodas",
      "Limpeza de pneus",
      "Limpeza dos vidros externos",
      "Enxágue",
      "Secagem com microfibra",
    ],
    excludes: [],
    prices: { MOTO: 2000, CARRO_PEQUENO: 4000, CARRO_MEDIO: 4000, SUV: 6000, PICAPE: 6000 } as Partial<Record<Cat, number>>,
  },
  {
    slug: "lavagem-completa",
    name: "Lavagem completa",
    durationMinutes: 70,
    displayOrder: 2,
    includes: [
      "Todos os itens da lavagem externa",
      "Aspiração de bancos",
      "Aspiração de carpetes",
      "Limpeza superficial do painel",
      "Limpeza de portas",
      "Limpeza do console central",
      "Limpeza de tapetes",
      "Limpeza dos vidros internos",
      "Aspiração do porta-malas",
    ],
    excludes: ["Higienização profunda"],
    prices: { CARRO_PEQUENO: 6000, CARRO_MEDIO: 7000, SUV: 9000, PICAPE: 10000 } as Partial<Record<Cat, number>>,
  },
];

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");
const handle = await createDb(url);
await handle.migrate("./drizzle");
const { db } = handle;

const CHECKLISTS: Record<string, string[]> = {
  "lavagem-externa": DEFAULT_EXTERNAL_CHECKLIST,
  "lavagem-completa": [...DEFAULT_EXTERNAL_CHECKLIST, ...DEFAULT_INTERIOR_CHECKLIST],
};

for (const s of CATALOG) {
  const { prices, ...data } = s;
  let [row] = await db.select().from(services).where(eq(services.slug, s.slug)).limit(1);
  if (!row) {
    [row] = await db.insert(services).values(data).returning();
    for (const [category, priceCents] of Object.entries(prices)) {
      await db.insert(servicePrices).values({ serviceId: row!.id, category: category as Cat, priceCents });
    }
  }
  const hasTemplate = await db
    .select({ id: serviceChecklistTemplates.id })
    .from(serviceChecklistTemplates)
    .where(eq(serviceChecklistTemplates.serviceId, row!.id))
    .limit(1);
  if (!hasTemplate.length) {
    await db
      .insert(serviceChecklistTemplates)
      .values((CHECKLISTS[s.slug] ?? []).map((label, position) => ({ serviceId: row!.id, position, label })));
  }
}

if ((await db.select().from(resources).limit(1)).length === 0) {
  await db.insert(resources).values({ name: "Vaga 1" });
}
if ((await db.select().from(expenseCategories).limit(1)).length === 0) {
  await db.insert(expenseCategories).values(DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name })));
}
// Horário padrão inicial (seg–sáb, 08:00–18:00). Ajustável no painel — confirme com o negócio.
if ((await db.select().from(operatingHours).limit(1)).length === 0) {
  await db.insert(operatingHours).values(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "08:00", closesAt: "18:00" })),
  );
}

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (email && password) {
  const problem = validatePasswordStrength(password);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD inválida: ${problem}`);
  const exists = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!exists.length) {
    await db.insert(users).values({
      name: "Administrador",
      email,
      passwordHash: await hashPassword(password),
      role: "ADMINISTRADOR",
    });
    console.log(`Administrador criado: ${email}`);
  }
} else {
  console.log("SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos: nenhum administrador criado.");
}

await handle.close();
console.log("Seed concluído.");
