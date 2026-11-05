import { getDb } from "@/db/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { isValidDateStr, localDateOf } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/modules/finance/payments";
import { getFinancialSummary } from "@/modules/finance/reports";

export const metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="space-y-1">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-extrabold text-navy-950">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  await requirePermission("financeiro:ver");
  const sp = await searchParams;
  const today = localDateOf(new Date());
  const from = sp.de && isValidDateStr(sp.de) ? sp.de : today.slice(0, 8) + "01";
  const to = sp.ate && isValidDateStr(sp.ate) ? sp.ate : today;
  const db = await getDb();
  const s = await getFinancialSummary(db, from, to);
  const qs = `de=${from}&ate=${to}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Financeiro</h1>
      <Card>
        <form className="flex flex-wrap items-end gap-2">
          <Field label="De" htmlFor="de">
            <Input id="de" name="de" type="date" defaultValue={from} />
          </Field>
          <Field label="Até" htmlFor="ate">
            <Input id="ate" name="ate" type="date" defaultValue={to} />
          </Field>
          <Button type="submit">Atualizar</Button>
        </form>
      </Card>

      {!s ? (
        <Card>
          <p className="text-sm text-danger" role="alert">
            Período inválido: a data inicial deve ser anterior ou igual à final.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Recebido no período" value={formatBRL(s.receivedCents)} hint="Pagamentos efetivos, sem os estornados" />
            <Stat label="Despesas do período" value={formatBRL(s.expensesPaidCents + s.expensesPendingCents)} hint={`Pagas ${formatBRL(s.expensesPaidCents)} · pendentes ${formatBRL(s.expensesPendingCents)}`} />
            <Stat label="Resultado" value={formatBRL(s.resultCents)} hint="Recebido − despesas" />
            <Stat label="OS entregues" value={String(s.deliveredCount)} />
            <Stat label="Ticket médio" value={formatBRL(s.averageTicketCents)} hint="Valor final médio das OS entregues" />
            <Stat label="A receber (posição atual)" value={formatBRL(s.receivableCents)} hint={s.refundedCents ? `Estornado no período: ${formatBRL(s.refundedCents)}` : "OS não quitadas"} />
          </div>

          <Card className="space-y-2">
            <h2 className="font-bold">Recebido por meio de pagamento</h2>
            {s.byMethod.length === 0 && <p className="text-sm text-muted">Nenhum recebimento no período.</p>}
            <ul className="divide-y divide-line text-sm">
              {s.byMethod.map((m) => (
                <li key={`${m.method}-${m.label ?? ""}`} className="flex justify-between py-1.5">
                  <span>
                    {PAYMENT_METHOD_LABEL[m.method as PaymentMethod]}
                    {m.label ? ` (${m.label})` : ""} <span className="text-muted">· {m.count}</span>
                  </span>
                  <strong>{formatBRL(m.totalCents)}</strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-bold">Despesas por categoria</h2>
            {s.expensesByCategory.length === 0 && <p className="text-sm text-muted">Nenhuma despesa no período.</p>}
            <ul className="divide-y divide-line text-sm">
              {s.expensesByCategory.map((c) => (
                <li key={c.category} className="flex justify-between py-1.5">
                  <span>{c.category}</span>
                  <strong>{formatBRL(c.totalCents)}</strong>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-bold">Exportar período</h2>
            <p className="flex flex-wrap gap-4 text-sm">
              <a className="underline" href={`/api/financeiro/exportar?tipo=pagamentos&formato=csv&${qs}`}>
                Pagamentos (CSV)
              </a>
              <a className="underline" href={`/api/financeiro/exportar?tipo=pagamentos&formato=xlsx&${qs}`}>
                Pagamentos (Excel)
              </a>
              <a className="underline" href={`/api/financeiro/exportar?tipo=despesas&formato=csv&${qs}`}>
                Despesas (CSV)
              </a>
              <a className="underline" href={`/api/financeiro/exportar?tipo=despesas&formato=xlsx&${qs}`}>
                Despesas (Excel)
              </a>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
