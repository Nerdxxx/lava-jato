"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { addCashMovement, closeCashRegister, openCashRegister } from "@/modules/finance/cash";
import { cancelExpense, createExpense, markExpensePaid } from "@/modules/finance/expenses";
import { PAYMENT_METHODS, recordPayments, refundPayment, type PaymentEntry } from "@/modules/finance/payments";
import { parseMoneyToCents } from "@/modules/scheduling/config";

const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function back(path: string, kind: "ok" | "erro", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

async function audit(userId: string, action: string, entity: string, entityId: string | null, details?: string) {
  const db = await getDb();
  await db.insert(auditLogs).values({ userId, action, entity, entityId, details });
}

/** Recebimento na OS, com até 3 linhas (pagamento dividido). */
export async function receivePaymentAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:receber");
  const woId = uuid.safeParse(str(fd, "workOrderId"));
  if (!woId.success) back("/admin/os", "erro", "OS inválida.");
  const dest = `/admin/os/${woId.data}`;
  const entries: PaymentEntry[] = [];
  for (let i = 0; i < 3; i++) {
    const raw = str(fd, `amount${i}`);
    if (raw === "") continue;
    const cents = parseMoneyToCents(raw);
    const method = z.enum(PAYMENT_METHODS).safeParse(str(fd, `method${i}`));
    if (cents === null || cents <= 0 || !method.success) back(dest, "erro", `Pagamento ${i + 1}: valor ou meio inválido.`);
    entries.push({
      method: method.data,
      amountCents: cents,
      methodLabel: method.data === "OUTRO" ? str(fd, `ref${i}`).slice(0, 40) || undefined : undefined,
      transactionRef: str(fd, `ref${i}`) || undefined,
    });
  }
  if (entries.length === 0) back(dest, "erro", "Informe ao menos um pagamento.");
  const key = str(fd, "idempotencyKey");
  const res = await recordPayments(await getDb(), woId.data, entries, user.id, /^[\w-]{8,50}$/.test(key) ? key : undefined);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "payment.create", "work_order", woId.data, entries.map((e) => `${e.method}:${e.amountCents}`).join(","));
  revalidatePath("/admin/caixa");
  back(dest, "ok", "Pagamento registrado.");
}

export async function refundPaymentAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:estornar");
  const pid = uuid.safeParse(str(fd, "paymentId"));
  const woId = uuid.safeParse(str(fd, "workOrderId"));
  if (!pid.success || !woId.success) back("/admin/os", "erro", "Pagamento inválido.");
  const dest = `/admin/os/${woId.data}`;
  const res = await refundPayment(await getDb(), pid.data, str(fd, "reason"), user.id);
  if (!res.ok) back(dest, "erro", res.message);
  await audit(user.id, "payment.refund", "payment", pid.data, str(fd, "reason"));
  revalidatePath("/admin/caixa");
  back(dest, "ok", "Pagamento estornado.");
}

export async function openCashAction(fd: FormData): Promise<void> {
  const user = await requirePermission("caixa:operar");
  const raw = str(fd, "opening");
  const cents = raw === "" ? 0 : parseMoneyToCents(raw);
  if (cents === null) back("/admin/caixa", "erro", "Valor inválido.");
  const res = await openCashRegister(await getDb(), cents, user.id);
  if (!res.ok) back("/admin/caixa", "erro", res.message);
  await audit(user.id, "cash.open", "cash_register", res.value.id, String(cents));
  back("/admin/caixa", "ok", "Caixa aberto.");
}

export async function closeCashAction(fd: FormData): Promise<void> {
  const user = await requirePermission("caixa:operar");
  const cents = parseMoneyToCents(str(fd, "counted"));
  if (cents === null) back("/admin/caixa", "erro", "Informe o valor contado.");
  const res = await closeCashRegister(await getDb(), cents, user.id, str(fd, "notes") || undefined);
  if (!res.ok) back("/admin/caixa", "erro", res.message);
  await audit(user.id, "cash.close", "cash_register", res.value.id, `dif:${res.value.differenceCents}`);
  back("/admin/caixa", "ok", `Caixa fechado. Diferença: ${(res.value.differenceCents / 100).toFixed(2).replace(".", ",")}`);
}

export async function cashMovementAction(fd: FormData): Promise<void> {
  const user = await requirePermission("caixa:operar");
  const type = z.enum(["SUPRIMENTO", "SANGRIA"]).safeParse(str(fd, "type"));
  const cents = parseMoneyToCents(str(fd, "amount"));
  if (!type.success || cents === null) back("/admin/caixa", "erro", "Dados inválidos.");
  const res = await addCashMovement(await getDb(), type.data, cents, str(fd, "reason"), user.id);
  if (!res.ok) back("/admin/caixa", "erro", res.message);
  await audit(user.id, `cash.${type.data.toLowerCase()}`, "cash_register", null, String(cents));
  back("/admin/caixa", "ok", "Movimento registrado.");
}

export async function createExpenseAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:ver");
  const cents = parseMoneyToCents(str(fd, "amount"));
  if (cents === null) back("/admin/despesas", "erro", "Valor inválido.");
  const res = await createExpense(
    await getDb(),
    {
      description: str(fd, "description"),
      categoryId: str(fd, "categoryId"),
      amountCents: cents,
      expenseDate: str(fd, "expenseDate"),
      dueDate: str(fd, "dueDate") || undefined,
      paid: str(fd, "paid") === "on",
    },
    user.id,
  );
  if (!res.ok) back("/admin/despesas", "erro", res.message);
  await audit(user.id, "expense.create", "expense", res.value.id, String(cents));
  back("/admin/despesas", "ok", "Despesa registrada.");
}

export async function payExpenseAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:ver");
  const id = uuid.safeParse(str(fd, "expenseId"));
  if (!id.success) back("/admin/despesas", "erro", "Despesa inválida.");
  const res = await markExpensePaid(await getDb(), id.data);
  if (!res.ok) back("/admin/despesas", "erro", res.message);
  await audit(user.id, "expense.pay", "expense", id.data);
  back("/admin/despesas", "ok", "Despesa marcada como paga.");
}

export async function cancelExpenseAction(fd: FormData): Promise<void> {
  const user = await requirePermission("financeiro:ver");
  const id = uuid.safeParse(str(fd, "expenseId"));
  if (!id.success) back("/admin/despesas", "erro", "Despesa inválida.");
  const res = await cancelExpense(await getDb(), id.data, str(fd, "reason"));
  if (!res.ok) back("/admin/despesas", "erro", res.message);
  await audit(user.id, "expense.cancel", "expense", id.data, str(fd, "reason"));
  back("/admin/despesas", "ok", "Despesa cancelada.");
}
