import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { Flash } from "@/components/layout/flash";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatDateTimeBR } from "@/lib/time";
import { canAccessWorkOrder } from "@/lib/work-order-access";
import { formatBRL } from "@/lib/utils";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { payments } from "@/db/schema";
import { amountDue, FINANCIAL_STATUS_LABEL, getPaymentSummary, PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/modules/finance/payments";
import { receivePaymentAction, refundPaymentAction } from "../../financeiro/actions";
import { getWorkOrderDetail, listStaff } from "@/modules/operations/queries";
import { PHOTO_KINDS } from "@/modules/operations/photos";
import { formatOsNumber, nextStatuses, WORK_ORDER_STATUS_LABEL, type WorkOrderStatus } from "@/modules/operations/state-machine";
import { CATEGORY_LABEL } from "@/modules/scheduling/labels";
import { assignAction, changeStatusAction, discountAction, notesAction, toggleChecklistAction } from "../actions";
import { redeemAction, undoRedeemAction } from "../../fidelidade/actions";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { listConsumptionForWorkOrder } from "@/modules/inventory/inventory";
import { getActiveRedemption, getBalance, loadLoyaltyConfig } from "@/modules/loyalty/loyalty";
import { listNotificationsFor, TEMPLATE_LABEL } from "@/modules/notifications/whatsapp";

export const metadata = { title: "Ordem de serviço" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { ANTES: "Antes", DURANTE: "Durante", DEPOIS: "Depois", AVARIA: "Avaria" };
const ACTION_LABEL: Partial<Record<WorkOrderStatus, string>> = {
  NA_FILA: "Colocar na fila",
  EM_LAVAGEM: "Iniciar / voltar para lavagem",
  EM_FINALIZACAO: "Finalizar lavagem",
  AGUARDANDO_INSPECAO: "Enviar para inspeção",
  PRONTO_PARA_ENTREGA: "Marcar pronto para entrega",
  ENTREGUE: "Registrar entrega",
  CANCELADO: "Cancelar OS",
};

export default async function WorkOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requirePermission("os:ver");
  const { id } = await params;
  const { ok, erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const detail = await getWorkOrderDetail(db, id);
  if (!detail || !canAccessWorkOrder(user, detail.wo)) notFound();

  const { wo, checklist, photos, history } = detail;
  const canUpdate = hasPermission(user.role, "fila:atualizar");
  const canAssign = hasPermission(user.role, "os:gerir");
  const canDiscount = hasPermission(user.role, "financeiro:receber");
  const canSeeCustomer = hasPermission(user.role, "clientes:ver");
  const closed = wo.status === "ENTREGUE" || wo.status === "CANCELADO";
  const staff = canAssign ? await listStaff(db) : [];
  const done = checklist.filter((c) => c.done).length;
  const finalCents = wo.priceCents - wo.discountCents;
  const canSeeMoney = canDiscount || hasPermission(user.role, "financeiro:ver");
  const canRefund = hasPermission(user.role, "financeiro:estornar");
  const paymentRows = canSeeMoney ? await db.select().from(payments).where(eq(payments.workOrderId, wo.id)).orderBy(payments.createdAt) : [];
  const pay = canSeeMoney ? await getPaymentSummary(db, wo.id) : null;
  const idemKey = randomUUID();
  const loyalty = canSeeMoney ? await loadLoyaltyConfig(db) : null;
  const loyaltyBalance = loyalty?.enabled ? await getBalance(db, wo.customerId) : 0;
  const redemption = loyalty?.enabled ? await getActiveRedemption(db, wo.id) : null;
  const consumption = wo.status === "ENTREGUE" && hasPermission(user.role, "estoque:gerir") ? await listConsumptionForWorkOrder(db, wo.id) : [];
  const sent = canSeeCustomer ? await listNotificationsFor(db, { workOrderId: wo.id }, 5) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-navy-950">
          {formatOsNumber(wo.number)} · {wo.vehicleModel}
        </h1>
        <div className="flex items-center gap-3">
          {canSeeMoney && (
            <a href={`/admin/os/${wo.id}/recibo`} target="_blank" rel="noopener" className="text-sm underline">
              Recibo
            </a>
          )}
          <Badge tone={wo.status === "CANCELADO" ? "danger" : wo.status === "ENTREGUE" ? "success" : "info"}>
            {WORK_ORDER_STATUS_LABEL[wo.status]}
          </Badge>
        </div>
      </div>
      <Flash ok={ok} erro={erro} />

      <Card className="space-y-2 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted">Serviço</dt>
          <dd>
            {wo.serviceName}
            {wo.addons.length > 0 && <span className="block text-xs text-muted">+ {wo.addons.map((x) => x.name).join(", ")}</span>}
          </dd>
          <dt className="text-muted">Veículo</dt>
          <dd>
            {CATEGORY_LABEL[wo.category]} — {wo.vehicleModel}
            {wo.vehiclePlate ? ` (${wo.vehiclePlate})` : ""}
          </dd>
          {canSeeCustomer && (
            <>
              <dt className="text-muted">Cliente</dt>
              <dd>
                {detail.customerName} · {detail.customerPhone}
              </dd>
            </>
          )}
          <dt className="text-muted">Responsável</dt>
          <dd>{detail.assigneeName ?? "não atribuído"}</dd>
          <dt className="text-muted">Entrada</dt>
          <dd>{formatDateTimeBR(wo.receivedAt)}</dd>
          {wo.startedAt && (
            <>
              <dt className="text-muted">Início</dt>
              <dd>{formatDateTimeBR(wo.startedAt)}</dd>
            </>
          )}
          {wo.deliveredAt && (
            <>
              <dt className="text-muted">Entrega</dt>
              <dd>{formatDateTimeBR(wo.deliveredAt)}</dd>
            </>
          )}
          {canDiscount || hasPermission(user.role, "financeiro:ver") ? (
            <>
              <dt className="text-muted">Valor</dt>
              <dd>
                {formatBRL(wo.priceCents)}
                {wo.discountCents > 0 ? ` − ${formatBRL(wo.discountCents)} = ` : ""}
                <strong>{wo.discountCents > 0 ? formatBRL(finalCents) : ""}</strong>
              </dd>
            </>
          ) : null}
        </dl>
      </Card>

      {canUpdate && !closed && (
        <Card className="space-y-3">
          <h2 className="font-bold">Avançar</h2>
          <div className="flex flex-wrap gap-2">
            {nextStatuses(wo.status).map((s) => (
              <form key={s} action={changeStatusAction}>
                <input type="hidden" name="workOrderId" value={wo.id} />
                <input type="hidden" name="from" value="detail" />
                <input type="hidden" name="to" value={s} />
                <Button type="submit" variant={s === "CANCELADO" ? "danger" : "primary"}>
                  {ACTION_LABEL[s] ?? WORK_ORDER_STATUS_LABEL[s]}
                </Button>
              </form>
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-bold">
          Checklist <span className="text-sm font-normal text-muted">({done}/{checklist.length})</span>
        </h2>
        {checklist.length === 0 && <p className="text-sm text-muted">Este serviço não tem checklist cadastrado.</p>}
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.id}>
              <form action={toggleChecklistAction} className="flex items-center gap-3">
                <input type="hidden" name="workOrderId" value={wo.id} />
                <input type="hidden" name="itemId" value={c.id} />
                <input type="hidden" name="done" value={String(!c.done)} />
                <Button
                  type="submit"
                  variant={c.done ? "secondary" : "outline"}
                  disabled={!canUpdate || closed}
                  aria-pressed={c.done}
                  className="min-h-11 w-full justify-start"
                >
                  <span aria-hidden>{c.done ? "✔" : "○"}</span>
                  <span className={c.done ? "line-through opacity-80" : ""}>{c.label}</span>
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Fotos</h2>
        {photos.length === 0 && <p className="text-sm text-muted">Nenhuma foto registrada.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <figure key={p.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/os/fotos/${p.id}`} alt={`Foto ${KIND_LABEL[p.kind]}`} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
              <figcaption className="text-xs text-muted">{KIND_LABEL[p.kind]}</figcaption>
            </figure>
          ))}
        </div>
        {canUpdate && !closed && (
          <form action={`/api/os/${wo.id}/fotos`} method="post" encType="multipart/form-data" className="space-y-3 border-t border-line pt-3">
            <div className="space-y-1.5">
              <label htmlFor="photo-kind" className="block text-sm font-medium">
                Tipo
              </label>
              <select id="photo-kind" name="kind" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
                {PHOTO_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="photo-file" className="block text-sm font-medium">
                Foto (JPEG, PNG ou WebP, até 10 MB)
              </label>
              <input id="photo-file" name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required className="block w-full text-sm" />
            </div>
            <Button type="submit">Enviar foto</Button>
          </form>
        )}
      </Card>

      {canAssign && !closed && (
        <Card className="space-y-3">
          <h2 className="font-bold">Responsável</h2>
          <form action={assignAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="workOrderId" value={wo.id} />
            <select name="assigneeId" defaultValue={wo.assignedTo ?? ""} aria-label="Responsável" className="min-h-11 rounded-lg border border-line bg-surface px-3">
              <option value="">Sem responsável</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Salvar
            </Button>
          </form>
        </Card>
      )}

      {canSeeMoney && pay && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">Pagamento</h2>
            <Badge tone={wo.financialStatus === "PAGO" ? "success" : wo.financialStatus === "CANCELADO" ? "danger" : "warning"}>
              {FINANCIAL_STATUS_LABEL[wo.financialStatus]}
            </Badge>
          </div>
          <p className="text-sm">
            Total {formatBRL(amountDue(wo))} · pago {formatBRL(pay.paidCents)} · <strong>saldo {formatBRL(pay.remainingCents)}</strong>
          </p>
          {paymentRows.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {paymentRows.map((p) => (
                <li key={p.id} className="space-y-1 py-1.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      <span className="text-muted">{formatDateTimeBR(p.createdAt)}</span> · {PAYMENT_METHOD_LABEL[p.method]}
                      {p.methodLabel ? ` (${p.methodLabel})` : ""}
                      {p.status === "ESTORNADO" ? " · estornado" : ""}
                    </span>
                    <span className={p.status === "ESTORNADO" ? "text-muted line-through" : ""}>{formatBRL(p.amountCents)}</span>
                  </div>
                  {p.refundReason && <p className="text-xs text-muted">Estorno: {p.refundReason}</p>}
                  {canRefund && p.status === "PAGO" && (
                    <form action={refundPaymentAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="paymentId" value={p.id} />
                      <input type="hidden" name="workOrderId" value={wo.id} />
                      <Input name="reason" placeholder="Motivo do estorno" required minLength={3} maxLength={300} aria-label="Motivo do estorno" className="max-w-xs" />
                      <Button type="submit" variant="danger">
                        Estornar
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canDiscount && wo.status !== "CANCELADO" && pay.remainingCents > 0 && (
            <form action={receivePaymentAction} className="space-y-3 border-t border-line pt-3">
              <input type="hidden" name="workOrderId" value={wo.id} />
              <input type="hidden" name="idempotencyKey" value={idemKey} />
              <p className="text-sm text-muted">Para pagamento dividido, preencha mais de uma linha. Dinheiro exige caixa aberto.</p>
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[10rem_8rem_1fr]">
                  <select name={`method${i}`} aria-label={`Meio de pagamento ${i + 1}`} defaultValue={i === 0 ? "PIX" : "DINHEIRO"} className="min-h-11 rounded-lg border border-line bg-surface px-3">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  <Input name={`amount${i}`} inputMode="decimal" placeholder={i === 0 ? (pay.remainingCents / 100).toFixed(2).replace(".", ",") : "0,00"} aria-label={`Valor ${i + 1}`} />
                  <Input name={`ref${i}`} placeholder="Referência / descrição (opcional)" maxLength={80} aria-label={`Referência ${i + 1}`} />
                </div>
              ))}
              <Button type="submit">Registrar pagamento</Button>
            </form>
          )}
        </Card>
      )}

      {loyalty?.enabled && wo.status !== "CANCELADO" && (
        <Card className="space-y-2">
          <h2 className="font-bold">Fidelidade</h2>
          <p className="text-sm">
            Saldo do cliente: <strong>{loyaltyBalance}</strong> de {loyalty.visitsRequired} pontos
            {redemption ? ` · resgate aplicado nesta OS (${formatBRL(redemption.discountCents)} de desconto)` : ""}
          </p>
          {canDiscount && !closed && !redemption && loyaltyBalance >= loyalty.visitsRequired && (
            <form action={redeemAction}>
              <input type="hidden" name="workOrderId" value={wo.id} />
              <Button type="submit">Usar prêmio ({loyalty.rewardPercent}% de desconto)</Button>
            </form>
          )}
          {canDiscount && !closed && redemption && (
            <form action={undoRedeemAction}>
              <input type="hidden" name="workOrderId" value={wo.id} />
              <Button type="submit" variant="outline">
                Desfazer resgate
              </Button>
            </form>
          )}
        </Card>
      )}

      {canSeeCustomer && wo.status !== "CANCELADO" && (
        <Card className="space-y-2">
          <h2 className="font-bold">Avisar o cliente</h2>
          <div className="flex flex-wrap gap-2">
            {!closed && <WhatsAppButton kind="os" id={wo.id} template="OS_RECEBIDA" label="Veículo recebido" />}
            {!closed && <WhatsAppButton kind="os" id={wo.id} template="OS_PRONTA" label="Pronto para retirada" />}
            {wo.status === "ENTREGUE" && <WhatsAppButton kind="os" id={wo.id} template="OS_AGRADECIMENTO" label="Agradecer" />}
          </div>
          {sent.length > 0 && (
            <ul className="text-xs text-muted">
              {sent.map((n) => (
                <li key={n.id}>
                  {formatDateTimeBR(n.createdAt)} · {TEMPLATE_LABEL[n.template as keyof typeof TEMPLATE_LABEL] ?? n.template}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {consumption.length > 0 && (
        <Card className="space-y-2">
          <h2 className="font-bold">Produtos consumidos</h2>
          <ul className="text-sm">
            {consumption.map((c) => (
              <li key={c.name}>
                {c.name}: {(-c.delta).toLocaleString("pt-BR")} {c.unit}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canDiscount && !closed && (
        <Card className="space-y-3">
          <h2 className="font-bold">Desconto autorizado</h2>
          <form action={discountAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="workOrderId" value={wo.id} />
            <Input name="discount" inputMode="decimal" placeholder="0,00" defaultValue={wo.discountCents ? (wo.discountCents / 100).toFixed(2).replace(".", ",") : ""} className="w-32" aria-label="Desconto em reais" />
            <Button type="submit" variant="outline">
              Aplicar
            </Button>
          </form>
        </Card>
      )}

      {canUpdate && (
        <Card className="space-y-3">
          <h2 className="font-bold">Observações</h2>
          <form action={notesAction} className="space-y-2">
            <input type="hidden" name="workOrderId" value={wo.id} />
            <textarea name="notes" defaultValue={wo.notes ?? ""} maxLength={1000} rows={3} className="w-full rounded-lg border border-line bg-surface p-3" aria-label="Observações" />
            <Button type="submit" variant="outline">
              Salvar observações
            </Button>
          </form>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-bold">Histórico</h2>
        <ol className="space-y-1 text-sm">
          {history.map(({ h, userName }) => (
            <li key={h.id}>
              <span className="text-muted">{formatDateTimeBR(h.createdAt)}</span> — {WORK_ORDER_STATUS_LABEL[h.toStatus]}
              {userName ? ` (${userName})` : ""}
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
