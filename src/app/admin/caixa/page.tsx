import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { formatDateTimeBR } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { getCashBalance, listCashMovements, listCashRegisters } from "@/modules/finance/cash";
import { getOpenCashRegister } from "@/modules/finance/payments";
import { cashMovementAction, closeCashAction, openCashAction } from "../financeiro/actions";

export const metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

const TYPE_LABEL = { PAGAMENTO: "Recebimento em dinheiro", SUPRIMENTO: "Suprimento", SANGRIA: "Sangria", ESTORNO: "Estorno em dinheiro" } as const;
const OUT = new Set(["SANGRIA", "ESTORNO"]);

export default async function CashPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requirePermission("caixa:operar");
  const { ok, erro } = await searchParams;
  const db = await getDb();
  const open = await getOpenCashRegister(db);
  const balance = open ? await getCashBalance(db, open.id) : null;
  const movements = open ? await listCashMovements(db, open.id) : [];
  const history = (await listCashRegisters(db, 10)).filter((r) => r.closedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Caixa</h1>
      <Flash ok={ok} erro={erro} />

      {!open || !balance ? (
        <Card className="space-y-3">
          <h2 className="font-bold">Caixa fechado</h2>
          <p className="text-sm text-muted">Abra o caixa para receber em dinheiro. Pix e cartão não dependem do caixa.</p>
          <form action={openCashAction} className="flex flex-wrap items-end gap-2">
            <Field label="Valor inicial (troco)" htmlFor="opening">
              <Input id="opening" name="opening" inputMode="decimal" placeholder="0,00" className="w-40" />
            </Field>
            <Button type="submit">Abrir caixa</Button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Caixa aberto</h2>
              <Badge tone="success">desde {formatDateTimeBR(open.openedAt)}</Badge>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Abertura</dt>
              <dd>{formatBRL(balance.openingCents)}</dd>
              <dt className="text-muted">Recebido em dinheiro</dt>
              <dd>{formatBRL(balance.cashInCents)}</dd>
              <dt className="text-muted">Suprimentos</dt>
              <dd>{formatBRL(balance.suppliesCents)}</dd>
              <dt className="text-muted">Sangrias</dt>
              <dd>− {formatBRL(balance.withdrawalsCents)}</dd>
              <dt className="text-muted">Estornos em dinheiro</dt>
              <dd>− {formatBRL(balance.refundsCents)}</dd>
              <dt className="font-bold">Esperado em caixa</dt>
              <dd className="font-bold">{formatBRL(balance.expectedCents)}</dd>
            </dl>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-bold">Suprimento / sangria</h2>
            <form action={cashMovementAction} className="grid gap-2 sm:grid-cols-[auto_8rem_1fr_auto] sm:items-end">
              <select name="type" aria-label="Tipo" className="min-h-11 rounded-lg border border-line bg-surface px-3">
                <option value="SUPRIMENTO">Suprimento (entrada)</option>
                <option value="SANGRIA">Sangria (retirada)</option>
              </select>
              <Input name="amount" inputMode="decimal" placeholder="0,00" required aria-label="Valor" />
              <Input name="reason" placeholder="Motivo" required minLength={3} maxLength={160} aria-label="Motivo" />
              <Button type="submit" variant="outline">
                Registrar
              </Button>
            </form>
          </Card>

          <Card className="space-y-2">
            <h2 className="font-bold">Movimentos</h2>
            {movements.length === 0 && <p className="text-sm text-muted">Nenhum movimento neste caixa.</p>}
            <ul className="divide-y divide-line text-sm">
              {movements.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 py-1.5">
                  <span>
                    <span className="text-muted">{formatDateTimeBR(m.createdAt)}</span> · {TYPE_LABEL[m.type]}
                    {m.reason ? ` — ${m.reason}` : ""}
                  </span>
                  <span className={OUT.has(m.type) ? "text-danger" : ""}>
                    {OUT.has(m.type) ? "− " : "+ "}
                    {formatBRL(m.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-bold">Fechar caixa</h2>
            <p className="text-sm text-muted">Conte o dinheiro da gaveta. Se houver diferença, a observação é obrigatória. Depois de fechado, o caixa não pode ser alterado.</p>
            <form action={closeCashAction} className="space-y-3">
              <Field label="Valor contado" htmlFor="counted">
                <Input id="counted" name="counted" inputMode="decimal" placeholder="0,00" required className="w-40" />
              </Field>
              <Field label="Observação (obrigatória se houver diferença)" htmlFor="notes">
                <Input id="notes" name="notes" maxLength={300} />
              </Field>
              <Button type="submit" variant="danger">
                Fechar caixa
              </Button>
            </form>
          </Card>
        </>
      )}

      <Card className="space-y-2">
        <h2 className="font-bold">Caixas anteriores</h2>
        {history.length === 0 && <p className="text-sm text-muted">Nenhum caixa fechado ainda.</p>}
        <ul className="divide-y divide-line text-sm">
          {history.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                {formatDateTimeBR(r.openedAt)} → {r.closedAt ? formatDateTimeBR(r.closedAt) : ""}
              </span>
              <span>
                esperado {formatBRL(r.expectedCents ?? 0)} · contado {formatBRL(r.countedCents ?? 0)} ·{" "}
                <strong className={(r.differenceCents ?? 0) === 0 ? "" : "text-danger"}>
                  dif. {(r.differenceCents ?? 0) < 0 ? "−" : ""}
                  {formatBRL(Math.abs(r.differenceCents ?? 0))}
                </strong>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
