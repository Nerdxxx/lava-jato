import Link from "next/link";
import { getDb } from "@/db/client";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { requireCustomer } from "@/lib/auth";
import { formatDateTimeBR } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { getCustomerForUser, getPortalData } from "@/modules/customers/portal";
import { getBalance, loadLoyaltyConfig } from "@/modules/loyalty/loyalty";
import { formatOsNumber, WORK_ORDER_STATUS_LABEL, type WorkOrderStatus } from "@/modules/operations/state-machine";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE } from "@/modules/scheduling/labels";

export const metadata = { title: "Meu painel" };
export const dynamic = "force-dynamic";

/** Etapas mostradas ao cliente (linguagem simples). */
const STEPS: { label: string; statuses: WorkOrderStatus[] }[] = [
  { label: "Recebido", statuses: ["AGUARDANDO_RECEPCAO", "RECEBIDO", "NA_FILA"] },
  { label: "Lavando", statuses: ["EM_LAVAGEM", "EM_FINALIZACAO"] },
  { label: "Conferência", statuses: ["AGUARDANDO_INSPECAO"] },
  { label: "Pronto", statuses: ["PRONTO_PARA_ENTREGA"] },
];
const KIND_LABEL: Record<string, string> = { ANTES: "Antes", DURANTE: "Durante", DEPOIS: "Depois", AVARIA: "Avaria" };

export default async function CustomerHome() {
  const user = await requireCustomer();
  const db = await getDb();
  const customer = await getCustomerForUser(db, user.id);
  if (!customer) {
    return (
      <Card>
        <EmptyState title="Cadastro não vinculado" description="Fale com o lava jato para vincular seu cadastro a esta conta." />
      </Card>
    );
  }
  const [data, loyalty] = await Promise.all([getPortalData(db, customer.id), loadLoyaltyConfig(db)]);
  const balance = loyalty.enabled ? await getBalance(db, customer.id) : 0;
  const photosOf = (woId: string) => data.photos.filter((p) => p.workOrderId === woId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {data.active.length > 0 && <AutoRefresh seconds={30} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-navy-950">Olá, {customer.name.split(" ")[0]}!</h1>
        <Link href="/agendar" className={buttonVariants()}>
          Agendar lavagem
        </Link>
      </div>

      {data.active.map((wo) => {
        const current = STEPS.findIndex((s) => s.statuses.includes(wo.status));
        return (
          <Card key={wo.id} className="space-y-3 border-aqua-400">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">
                {wo.vehicleModel} · {wo.serviceName}
              </h2>
              <Badge tone="info">{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge>
            </div>
            <ol className="grid grid-cols-4 gap-1 text-center text-xs font-semibold" aria-label="Andamento da lavagem">
              {STEPS.map((s, i) => (
                <li
                  key={s.label}
                  aria-current={i === current ? "step" : undefined}
                  className={`rounded-full px-2 py-1.5 ${i <= current ? "bg-navy-950 text-white" : "bg-bg text-muted"}`}
                >
                  {s.label}
                </li>
              ))}
            </ol>
            <p className="text-sm text-muted">
              {formatOsNumber(wo.number)} · entrada {formatDateTimeBR(wo.receivedAt)} · valor {formatBRL(wo.priceCents - wo.discountCents)}
              {wo.financialStatus === "PAGO" ? " (pago)" : ""}
            </p>
            {wo.status === "PRONTO_PARA_ENTREGA" && <p className="font-semibold text-success">Seu veículo está pronto para retirada!</p>}
            <Photos ids={photosOf(wo.id)} />
          </Card>
        );
      })}

      {loyalty.enabled && (
        <Card className="space-y-2">
          <h2 className="font-bold">Fidelidade</h2>
          <p className="text-sm">
            Você tem <strong>{balance}</strong> de {loyalty.visitsRequired} lavagens.{" "}
            {balance >= loyalty.visitsRequired
              ? `Prêmio disponível: ${loyalty.rewardPercent === 100 ? "uma lavagem grátis" : `${loyalty.rewardPercent}% de desconto`}! Avise no atendimento.`
              : `Faltam ${loyalty.visitsRequired - balance} para ganhar ${loyalty.rewardPercent === 100 ? "uma lavagem grátis" : `${loyalty.rewardPercent}% de desconto`}.`}
          </p>
          <div className="h-3 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuemin={0} aria-valuemax={loyalty.visitsRequired} aria-valuenow={Math.min(balance, loyalty.visitsRequired)}>
            <div className="h-full bg-sun-400" style={{ width: `${Math.min(100, (balance / loyalty.visitsRequired) * 100)}%` }} />
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-bold">Próximos agendamentos</h2>
        {data.upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nenhum agendamento marcado.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.upcoming.map(({ a, serviceName }) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{formatDateTimeBR(a.startsAt)}</strong> · {serviceName} · {a.vehicleModel} · código {a.code}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  <Link href="/agendamento" className="underline">
                    Alterar
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Histórico</h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-muted">Suas lavagens concluídas aparecerão aqui.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.history.map((wo) => (
              <li key={wo.id} className="space-y-2 py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {formatDateTimeBR(wo.deliveredAt ?? wo.receivedAt)} · {wo.serviceName} · {wo.vehicleModel}
                  </span>
                  <span>
                    {wo.status === "CANCELADO" ? <Badge tone="danger">Cancelado</Badge> : <strong>{formatBRL(wo.priceCents - wo.discountCents)}</strong>}
                  </span>
                </div>
                <Photos ids={photosOf(wo.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.vehicles.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-bold">Meus veículos</h2>
          <ul className="text-sm">
            {data.vehicles.map((v) => (
              <li key={v.id}>
                {CATEGORY_LABEL[v.category]} — {v.model}
                {v.plate ? ` (${v.plate})` : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Photos({ ids }: { ids: { id: string; kind: string }[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {ids.map((p) => (
        <a key={p.id} href={`/api/cliente/fotos/${p.id}`} target="_blank" rel="noopener" className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/cliente/fotos/${p.id}`} alt={`Foto ${KIND_LABEL[p.kind] ?? ""}`} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
          <span className="block text-xs text-muted">{KIND_LABEL[p.kind]}</span>
        </a>
      ))}
    </div>
  );
}
