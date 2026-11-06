import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatDateTimeBR } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { getCustomer360 } from "@/modules/customers/customers";
import { formatOsNumber, WORK_ORDER_STATUS_LABEL } from "@/modules/operations/state-machine";
import { CATEGORY_LABEL, CATEGORY_ORDER, STATUS_LABEL, STATUS_TONE } from "@/modules/scheduling/labels";
import { addVehicleAction, portalAccessAction, updateCustomerAction } from "../actions";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { adjustPointsAction } from "../../fidelidade/actions";
import { PORTAL_LINK_COOKIE } from "@/modules/customers/portal";
import { getBalance, listTransactions, loadLoyaltyConfig, LOYALTY_KIND_LABEL } from "@/modules/loyalty/loyalty";
import { waLink } from "@/modules/notifications/whatsapp";

export const metadata = { title: "Cliente" };
export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requirePermission("clientes:ver");
  const { id } = await params;
  const { ok, erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const view = await getCustomer360(db, id);
  if (!view) notFound();
  const { customer, vehicles, appointments, workOrders, totalSpentCents } = view;
  const canEdit = hasPermission(user.role, "clientes:gerir");
  const canAddVehicle = hasPermission(user.role, "veiculos:gerir");
  const canSeeMoney = hasPermission(user.role, "financeiro:ver");
  const isAdmin = hasPermission(user.role, "configuracoes:gerir");
  const loyalty = await loadLoyaltyConfig(db);
  const [balance, extract] = await Promise.all([getBalance(db, customer.id), listTransactions(db, customer.id, 15)]);
  const [account] = customer.userId ? await db.select({ email: users.email }).from(users).where(eq(users.id, customer.userId)).limit(1) : [];
  const freshToken = canEdit ? (await cookies()).get(PORTAL_LINK_COOKIE)?.value : undefined;
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const portalLink = freshToken && /^[\w-]{20,100}$/.test(freshToken) ? `${appUrl}/redefinir-senha?t=${freshToken}` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/clientes" className="text-sm underline">
        ← Clientes
      </Link>
      <h1 className="text-2xl font-extrabold text-navy-950">{customer.name}</h1>
      <Flash ok={ok} erro={erro} />

      <Card className="space-y-3">
        <h2 className="font-bold">Dados</h2>
        <p className="text-sm text-muted">
          WhatsApp:{" "}
          <a className="underline" href={`https://wa.me/55${customer.phone}`} target="_blank" rel="noopener noreferrer">
            {customer.phone}
          </a>{" "}
          · Cliente desde {formatDateTimeBR(customer.createdAt)}
          {canSeeMoney ? ` · Total em OS entregues: ${formatBRL(totalSpentCents)}` : ""}
        </p>
        {canEdit ? (
          <form action={updateCustomerAction} className="space-y-3">
            <input type="hidden" name="customerId" value={customer.id} />
            <Field label="Nome" htmlFor="name">
              <Input id="name" name="name" defaultValue={customer.name} required maxLength={120} />
            </Field>
            <Field label="E-mail (opcional)" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={customer.email ?? ""} maxLength={254} />
            </Field>
            <Field label="Observações administrativas" htmlFor="notes">
              <textarea id="notes" name="notes" defaultValue={customer.notes ?? ""} maxLength={1000} rows={3} className="w-full rounded-lg border border-line bg-surface p-3" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="marketingConsent" defaultChecked={customer.marketingConsent} className="size-5" />
              Aceita receber comunicações de marketing (consentimento separado do atendimento)
            </label>
            <Button type="submit">Salvar</Button>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Veículos</h2>
        {vehicles.length === 0 && <p className="text-sm text-muted">Nenhum veículo cadastrado.</p>}
        <ul className="space-y-1 text-sm">
          {vehicles.map((v) => (
            <li key={v.id}>
              <span className="font-semibold">{v.model}</span> · {CATEGORY_LABEL[v.category]}
              {v.plate ? ` · ${v.plate}` : ""}
              {v.color ? ` · ${v.color}` : ""}
            </li>
          ))}
        </ul>
        {canAddVehicle && (
          <form action={addVehicleAction} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <input type="hidden" name="customerId" value={customer.id} />
            <Field label="Modelo" htmlFor="v-model">
              <Input id="v-model" name="model" required maxLength={80} />
            </Field>
            <Field label="Tipo" htmlFor="v-category">
              <select id="v-category" name="category" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Placa (opcional)" htmlFor="v-plate">
              <Input id="v-plate" name="plate" maxLength={10} autoCapitalize="characters" />
            </Field>
            <Field label="Cor (opcional)" htmlFor="v-color">
              <Input id="v-color" name="color" maxLength={40} />
            </Field>
            <div>
              <Button type="submit" variant="outline">
                Cadastrar veículo
              </Button>
            </div>
          </form>
        )}
      </Card>

      {(loyalty.enabled || extract.length > 0) && (
        <Card className="space-y-3">
          <h2 className="font-bold">Fidelidade</h2>
          <p className="text-sm">
            Saldo: <strong>{balance}</strong> de {loyalty.visitsRequired} pontos{loyalty.enabled ? "" : " (programa desativado)"}
          </p>
          {extract.length > 0 && (
            <ul className="text-sm">
              {extract.map(({ t, woNumber }) => (
                <li key={t.id}>
                  <span className="text-muted">{formatDateTimeBR(t.createdAt)}</span> · {LOYALTY_KIND_LABEL[t.kind]}
                  {woNumber ? ` (${formatOsNumber(woNumber)})` : ""} · {t.points > 0 ? "+" : ""}
                  {t.points}
                  {t.reason ? ` · ${t.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
          {isAdmin && (
            <form action={adjustPointsAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <input type="hidden" name="customerId" value={customer.id} />
              <Field label="Pontos (+/−)" htmlFor="lp-points">
                <Input id="lp-points" name="points" inputMode="numeric" className="w-24" required />
              </Field>
              <Field label="Motivo" htmlFor="lp-reason">
                <Input id="lp-reason" name="reason" required minLength={3} maxLength={160} placeholder="Ex.: cartão fidelidade de papel" />
              </Field>
              <Button type="submit" variant="outline">
                Ajustar
              </Button>
            </form>
          )}
        </Card>
      )}

      {canEdit && (
        <Card className="space-y-3">
          <h2 className="font-bold">Acesso ao portal do cliente</h2>
          <p className="text-sm text-muted">
            {account
              ? `Conta ativa: ${account.email}. Gere um link se o cliente esqueceu a senha.`
              : "O cliente ainda não tem acesso. Informe o e-mail dele e envie o link para ele criar a senha."}
          </p>
          {portalLink && (
            <div className="space-y-2 rounded-lg bg-bg p-3 text-sm">
              <p className="break-all font-mono text-xs">{portalLink}</p>
              <a
                className="inline-block font-semibold underline"
                target="_blank"
                rel="noopener noreferrer"
                href={waLink(customer.phone, `Olá, ${customer.name.split(" ")[0]}! Aqui está o link para acessar sua área no site do lava jato e definir sua senha (válido por 48 h): ${portalLink}`)}
              >
                Enviar pelo WhatsApp
              </a>
            </div>
          )}
          <form action={portalAccessAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="customerId" value={customer.id} />
            {!account && (
              <Field label="E-mail do cliente" htmlFor="pa-email">
                <Input id="pa-email" name="email" type="email" defaultValue={customer.email ?? ""} required />
              </Field>
            )}
            <Button type="submit" variant="outline">
              {account ? "Gerar link de nova senha" : "Criar acesso e gerar link"}
            </Button>
          </form>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-bold">Agendamentos</h2>
        {appointments.length === 0 && <p className="text-sm text-muted">Nenhum agendamento.</p>}
        <ul className="space-y-1 text-sm">
          {appointments.map(({ a, serviceName }) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              {formatDateTimeBR(a.startsAt)} · {serviceName} · {a.vehicleModel}
              <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-bold">Histórico de serviços (OS)</h2>
        {workOrders.length === 0 && <p className="text-sm text-muted">Nenhuma ordem de serviço.</p>}
        <ul className="space-y-1 text-sm">
          {workOrders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/os/${o.id}`} className="underline">
                {formatOsNumber(o.number)}
              </Link>{" "}
              · {formatDateTimeBR(o.createdAt)} · {o.serviceName} · {o.vehicleModel} · {WORK_ORDER_STATUS_LABEL[o.status]}
              {canSeeMoney ? ` · ${formatBRL(o.priceCents - o.discountCents)}` : ""}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
