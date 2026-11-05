import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { addDays, localDateOf } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { listExpenseCategories, listExpenses } from "@/modules/finance/expenses";
import { cancelExpenseAction, createExpenseAction, payExpenseAction } from "../financeiro/actions";

export const metadata = { title: "Despesas" };
export const dynamic = "force-dynamic";

const STATUS = { PENDENTE: "warning", PAGA: "success", CANCELADA: "neutral" } as const;
const dateBR = (d: string) => d.split("-").reverse().join("/");

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; de?: string; ate?: string }> }) {
  await requirePermission("financeiro:ver");
  const sp = await searchParams;
  const today = localDateOf(new Date());
  const from = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : addDays(today, -30);
  const to = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : today;
  const db = await getDb();
  const [categories, rows] = await Promise.all([listExpenseCategories(db), listExpenses(db, from, to)]);
  const total = rows.filter((r) => r.e.status !== "CANCELADA").reduce((s, r) => s + r.e.amountCents, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Despesas</h1>
      <Flash ok={sp.ok} erro={sp.erro} />

      <Card className="space-y-3">
        <h2 className="font-bold">Nova despesa</h2>
        <form action={createExpenseAction} className="grid gap-3 sm:grid-cols-2">
          <Field label="Descrição" htmlFor="description">
            <Input id="description" name="description" required minLength={3} maxLength={160} />
          </Field>
          <Field label="Categoria" htmlFor="categoryId">
            <select id="categoryId" name="categoryId" required className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor (R$)" htmlFor="amount">
            <Input id="amount" name="amount" inputMode="decimal" placeholder="0,00" required />
          </Field>
          <Field label="Data da despesa" htmlFor="expenseDate">
            <Input id="expenseDate" name="expenseDate" type="date" defaultValue={today} required />
          </Field>
          <Field label="Vencimento (opcional)" htmlFor="dueDate">
            <Input id="dueDate" name="dueDate" type="date" />
          </Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="paid" /> Já foi paga
          </label>
          <div className="sm:col-span-2">
            <Button type="submit">Registrar despesa</Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-3">
        <form className="flex flex-wrap items-end gap-2">
          <Field label="De" htmlFor="de">
            <Input id="de" name="de" type="date" defaultValue={from} />
          </Field>
          <Field label="Até" htmlFor="ate">
            <Input id="ate" name="ate" type="date" defaultValue={to} />
          </Field>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          <a className="min-h-11 content-center text-sm underline" href={`/api/financeiro/exportar?tipo=despesas&formato=csv&de=${from}&ate=${to}`}>
            CSV
          </a>
          <a className="min-h-11 content-center text-sm underline" href={`/api/financeiro/exportar?tipo=despesas&formato=xlsx&de=${from}&ate=${to}`}>
            Excel
          </a>
        </form>
        <p className="text-sm text-muted">
          Total do período (sem canceladas): <strong>{formatBRL(total)}</strong>
        </p>
        {rows.length === 0 && <p className="text-sm text-muted">Nenhuma despesa no período.</p>}
        <ul className="divide-y divide-line">
          {rows.map(({ e, category }) => (
            <li key={e.id} className="space-y-1.5 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-muted">{dateBR(e.expenseDate)}</span> · <strong>{e.description}</strong> · {category}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS[e.status]}>{e.status === "PAGA" ? "Paga" : e.status === "PENDENTE" ? "Pendente" : "Cancelada"}</Badge>
                  <strong>{formatBRL(e.amountCents)}</strong>
                </span>
              </div>
              {e.dueDate && e.status === "PENDENTE" && <p className="text-xs text-muted">Vence em {dateBR(e.dueDate)}</p>}
              {e.cancelReason && <p className="text-xs text-muted">Motivo: {e.cancelReason}</p>}
              {e.status === "PENDENTE" && (
                <div className="flex flex-wrap gap-2">
                  <form action={payExpenseAction}>
                    <input type="hidden" name="expenseId" value={e.id} />
                    <Button type="submit" variant="outline">
                      Marcar como paga
                    </Button>
                  </form>
                  <form action={cancelExpenseAction} className="flex gap-2">
                    <input type="hidden" name="expenseId" value={e.id} />
                    <Input name="reason" placeholder="Motivo do cancelamento" required minLength={3} maxLength={300} aria-label="Motivo do cancelamento" />
                    <Button type="submit" variant="danger">
                      Cancelar
                    </Button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
