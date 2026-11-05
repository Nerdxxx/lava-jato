import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { expenseCategories, expenses } from "@/db/schema";
import { isValidDateStr } from "@/lib/time";
import type { OpResult } from "./payments";

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Produtos de limpeza",
  "Água e energia",
  "Aluguel",
  "Salários e diárias",
  "Manutenção de equipamentos",
  "Marketing",
  "Impostos e taxas",
  "Outros",
];

const dateStr = z.string().refine(isValidDateStr, "Data inválida.");
const createSchema = z.object({
  description: z.string().trim().min(3, "Descreva a despesa.").max(160),
  categoryId: z.string().uuid("Categoria inválida."),
  amountCents: z.number().int().positive("Valor inválido.").max(10_000_000_00),
  expenseDate: dateStr,
  dueDate: dateStr.optional(),
  paid: z.boolean().default(false),
});
export type ExpenseInput = z.input<typeof createSchema>;

export async function createExpense(db: Database, input: ExpenseInput, userId: string, now = new Date()): Promise<OpResult<{ id: string }>> {
  const p = createSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dados inválidos.");
  const [cat] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, p.data.categoryId)).limit(1);
  if (!cat || !cat.active) return fail("Categoria inválida.");
  const [row] = await db
    .insert(expenses)
    .values({
      description: p.data.description,
      categoryId: p.data.categoryId,
      amountCents: p.data.amountCents,
      expenseDate: p.data.expenseDate,
      dueDate: p.data.dueDate ?? null,
      status: p.data.paid ? "PAGA" : "PENDENTE",
      paidAt: p.data.paid ? now : null,
      createdBy: userId,
    })
    .returning({ id: expenses.id });
  return { ok: true, value: { id: row!.id } };
}

export async function markExpensePaid(db: Database, id: string, now = new Date()): Promise<OpResult<undefined>> {
  const rows = await db
    .update(expenses)
    .set({ status: "PAGA", paidAt: now })
    .where(and(eq(expenses.id, id), eq(expenses.status, "PENDENTE")))
    .returning({ id: expenses.id });
  return rows.length ? { ok: true, value: undefined } : fail("Despesa não encontrada ou já finalizada.");
}

/** Despesas nunca são apagadas: cancelamento exige motivo e mantém o registro. */
export async function cancelExpense(db: Database, id: string, reason: string): Promise<OpResult<undefined>> {
  const why = reason.trim();
  if (why.length < 3) return fail("Informe o motivo do cancelamento.");
  const rows = await db
    .update(expenses)
    .set({ status: "CANCELADA", cancelReason: why.slice(0, 300) })
    .where(and(eq(expenses.id, id), eq(expenses.status, "PENDENTE")))
    .returning({ id: expenses.id });
  return rows.length ? { ok: true, value: undefined } : fail("Só despesas pendentes podem ser canceladas.");
}

export async function listExpenseCategories(db: Database) {
  return db.select().from(expenseCategories).where(eq(expenseCategories.active, true)).orderBy(expenseCategories.name);
}

export async function listExpenses(db: Database, from: string, to: string) {
  return db
    .select({ e: expenses, category: expenseCategories.name })
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to)))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
}
