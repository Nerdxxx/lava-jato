import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { services } from "@/db/schema";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { formatDateTimeBR } from "@/lib/time";
import { formatOsNumber } from "@/modules/operations/state-machine";
import { INVENTORY_UNITS, listItems, listMovements, listRules, MOVEMENT_LABEL, type StockLevel } from "@/modules/inventory/inventory";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { createItemAction, deleteRuleAction, movementAction, saveRuleAction, updateItemAction } from "./actions";

export const metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

const LEVEL: Record<StockLevel, { tone: "success" | "warning" | "danger"; label: string }> = {
  OK: { tone: "success", label: "OK" },
  BAIXO: { tone: "warning", label: "Baixo" },
  ZERADO: { tone: "danger", label: "Zerado" },
  NEGATIVO: { tone: "danger", label: "Negativo — conferir" },
};
const select = "min-h-11 w-full rounded-lg border border-line bg-surface px-3";
const n = (v: number) => v.toLocaleString("pt-BR");

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; inativos?: string }> }) {
  await requirePermission("estoque:gerir");
  const sp = await searchParams;
  const showInactive = sp.inativos === "1";
  const db = await getDb();
  const [items, rules, moves, svcs] = await Promise.all([
    listItems(db, showInactive),
    listRules(db),
    listMovements(db, { limit: 40 }),
    db.select({ id: services.id, name: services.name }).from(services).orderBy(asc(services.displayOrder)),
  ]);
  const active = items.filter((i) => i.active);
  const alerts = active.filter((i) => i.level !== "OK");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy-950">Estoque</h1>
      <Flash ok={sp.ok} erro={sp.erro} />

      {alerts.length > 0 && (
        <Card className="space-y-2 border-sun-400">
          <h2 className="font-bold">Atenção: {alerts.length} produto(s) precisam de reposição</h2>
          <ul className="text-sm">
            {alerts.map((i) => (
              <li key={i.id}>
                <strong>{i.name}</strong>: {n(i.quantity)} {i.unit} (mínimo {n(i.minQuantity)}) · {LEVEL[i.level].label}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Produtos</h2>
          <a href={showInactive ? "/admin/estoque" : "/admin/estoque?inativos=1"} className="text-sm underline">
            {showInactive ? "Ocultar inativos" : "Mostrar inativos"}
          </a>
        </div>
        {items.length === 0 ? (
          <EmptyState title="Nenhum produto cadastrado" description="Cadastre shampoo, cera, pretinho, panos etc. abaixo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2">Produto</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th>Mínimo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id} className={i.active ? "" : "opacity-60"}>
                    <td className="py-2 font-semibold">{i.name}</td>
                    <td>
                      {n(i.quantity)} {i.unit}
                    </td>
                    <td>{i.active ? <Badge tone={LEVEL[i.level].tone}>{LEVEL[i.level].label}</Badge> : <Badge>Inativo</Badge>}</td>
                    <td>
                      <form action={updateItemAction} className="flex items-center gap-1">
                        <input type="hidden" name="itemId" value={i.id} />
                        <Input name="minQuantity" defaultValue={i.minQuantity} inputMode="numeric" className="min-h-9 w-24" aria-label={`Estoque mínimo de ${i.name}`} />
                        <Button type="submit" variant="ghost" className="min-h-9 px-2">
                          Salvar
                        </Button>
                      </form>
                    </td>
                    <td>
                      <form action={updateItemAction}>
                        <input type="hidden" name="itemId" value={i.id} />
                        <input type="hidden" name="active" value={String(!i.active)} />
                        <Button type="submit" variant="ghost" className="min-h-9 px-2">
                          {i.active ? "Desativar" : "Reativar"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-bold">Movimentar estoque</h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted">Cadastre um produto primeiro.</p>
          ) : (
            <form action={movementAction} className="space-y-3">
              <Field label="Produto" htmlFor="mv-item">
                <select id="mv-item" name="itemId" className={select} required>
                  {active.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({n(i.quantity)} {i.unit})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo" htmlFor="mv-type">
                <select id="mv-type" name="type" className={select}>
                  <option value="ENTRADA">Entrada (compra/reposição)</option>
                  <option value="SAIDA">Saída (perda, uso avulso)</option>
                  <option value="AJUSTE">Ajuste (informar quantidade contada)</option>
                </select>
              </Field>
              <Field label="Quantidade" htmlFor="mv-qty">
                <Input id="mv-qty" name="quantity" inputMode="numeric" required placeholder="Ex.: 5000" />
              </Field>
              <Field label="Motivo (obrigatório para saída e ajuste)" htmlFor="mv-reason">
                <Input id="mv-reason" name="reason" maxLength={160} />
              </Field>
              <Button type="submit">Registrar</Button>
            </form>
          )}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">Novo produto</h2>
          <form action={createItemAction} className="space-y-3">
            <Field label="Nome" htmlFor="it-name">
              <Input id="it-name" name="name" required minLength={2} maxLength={80} placeholder="Ex.: Shampoo automotivo" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Unidade" htmlFor="it-unit">
                <select id="it-unit" name="unit" className={select}>
                  {INVENTORY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Saldo inicial" htmlFor="it-initial">
                <Input id="it-initial" name="initialQuantity" inputMode="numeric" placeholder="0" />
              </Field>
              <Field label="Mínimo" htmlFor="it-min">
                <Input id="it-min" name="minQuantity" inputMode="numeric" placeholder="0" />
              </Field>
            </div>
            <p className="text-xs text-muted">Use a menor unidade que você controla (ex.: ml para líquidos), sempre em números inteiros.</p>
            <Button type="submit">Cadastrar</Button>
          </form>
        </Card>
      </div>

      <Card className="space-y-3">
        <div>
          <h2 className="font-bold">Consumo por serviço</h2>
          <p className="text-sm text-muted">
            Quando uma OS é entregue, o estoque baixa automaticamente conforme estas regras. A regra de uma categoria específica substitui a regra geral.
          </p>
        </div>
        {rules.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {rules.map(({ r, serviceName, itemName, unit }) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  <strong>{serviceName}</strong> · {r.category ? CATEGORY_LABEL[r.category] : "todas as categorias"} → {n(r.quantity)} {unit} de {itemName}
                </span>
                <form action={deleteRuleAction}>
                  <input type="hidden" name="ruleId" value={r.id} />
                  <Button type="submit" variant="ghost" className="min-h-9 px-2 text-danger">
                    Remover
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {active.length > 0 && svcs.length > 0 && (
          <form action={saveRuleAction} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_1fr_8rem_auto] sm:items-end">
            <Field label="Serviço" htmlFor="rl-svc">
              <select id="rl-svc" name="serviceId" className={select}>
                {svcs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Categoria" htmlFor="rl-cat">
              <select id="rl-cat" name="category" className={select}>
                <option value="">Todas</option>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Produto" htmlFor="rl-item">
              <select id="rl-item" name="itemId" className={select}>
                {active.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.unit})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantidade" htmlFor="rl-qty">
              <Input id="rl-qty" name="quantity" inputMode="numeric" required />
            </Field>
            <Button type="submit" variant="outline">
              Salvar regra
            </Button>
          </form>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Últimas movimentações</h2>
        {moves.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {moves.map(({ m, itemName, unit, woNumber }) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <span className="text-muted">{formatDateTimeBR(m.createdAt)}</span> · <strong>{itemName}</strong> · {MOVEMENT_LABEL[m.type]}
                  {woNumber ? ` (${formatOsNumber(woNumber)})` : ""}
                  {m.reason ? ` · ${m.reason}` : ""}
                </span>
                <span className={m.delta < 0 ? "text-danger" : "text-success"}>
                  {m.delta > 0 ? "+" : ""}
                  {n(m.delta)} {unit} → {n(m.balanceAfter)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
