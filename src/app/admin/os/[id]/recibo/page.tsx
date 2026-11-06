import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { payments } from "@/db/schema";
import { Brand } from "@/components/layout/brand";
import { requirePermission } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatDateTimeBR } from "@/lib/time";
import { formatBRL } from "@/lib/utils";
import { canAccessWorkOrder } from "@/lib/work-order-access";
import { formatPhoneBR, loadProfile } from "@/modules/business/profile";
import { amountDue, FINANCIAL_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/modules/finance/payments";
import { getWorkOrderDetail } from "@/modules/operations/queries";
import { formatOsNumber, WORK_ORDER_STATUS_LABEL } from "@/modules/operations/state-machine";
import { CATEGORY_LABEL } from "@/modules/scheduling/labels";
import { PrintButton } from "./print-button";

export const metadata = { title: "Recibo" };
export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("os:ver");
  if (!hasPermission(user.role, "financeiro:receber") && !hasPermission(user.role, "financeiro:ver")) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const detail = await getWorkOrderDetail(db, id);
  if (!detail || !canAccessWorkOrder(user, detail.wo)) notFound();
  const { wo } = detail;
  const [profile, rows] = await Promise.all([
    loadProfile(db),
    db.select().from(payments).where(eq(payments.workOrderId, wo.id)).orderBy(payments.createdAt),
  ]);
  const paid = rows.filter((p) => p.status === "PAGO");
  const paidCents = paid.reduce((s, p) => s + p.amountCents, 0);
  const due = amountDue(wo);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex justify-end gap-2" data-print-hide>
        <PrintButton />
      </div>
      <article className="space-y-4 rounded-lg border border-line bg-white p-6 text-sm text-black print:border-0 print:p-0">
        <header className="space-y-1 text-center">
          <div className="flex justify-center">
            <Brand size={48} />
          </div>
          <p className="font-bold">{profile.name}</p>
          {profile.address && <p>{profile.address}</p>}
          {profile.whatsapp && <p>WhatsApp {formatPhoneBR(profile.whatsapp)}</p>}
        </header>
        <hr className="border-dashed" />
        <div className="space-y-0.5">
          <p className="text-base font-bold">
            Recibo · {formatOsNumber(wo.number)}
          </p>
          <p>Emitido em {formatDateTimeBR(new Date())}</p>
          <p>Situação: {WORK_ORDER_STATUS_LABEL[wo.status]} · {FINANCIAL_STATUS_LABEL[wo.financialStatus]}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt>Cliente</dt>
          <dd>{detail.customerName}</dd>
          <dt>Veículo</dt>
          <dd>
            {CATEGORY_LABEL[wo.category]} — {wo.vehicleModel}
            {wo.vehiclePlate ? ` (${wo.vehiclePlate})` : ""}
          </dd>
          <dt>Entrada</dt>
          <dd>{formatDateTimeBR(wo.receivedAt)}</dd>
          {wo.deliveredAt && (
            <>
              <dt>Entrega</dt>
              <dd>{formatDateTimeBR(wo.deliveredAt)}</dd>
            </>
          )}
        </dl>
        <hr className="border-dashed" />
        <table className="w-full">
          <tbody>
            <tr>
              <td>{wo.serviceName}</td>
              <td className="text-right">{formatBRL(wo.priceCents)}</td>
            </tr>
            {wo.discountCents > 0 && (
              <tr>
                <td>Desconto</td>
                <td className="text-right">− {formatBRL(wo.discountCents)}</td>
              </tr>
            )}
            <tr className="font-bold">
              <td>Total</td>
              <td className="text-right">{formatBRL(due)}</td>
            </tr>
          </tbody>
        </table>
        {paid.length > 0 && (
          <>
            <hr className="border-dashed" />
            <table className="w-full">
              <tbody>
                {paid.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {PAYMENT_METHOD_LABEL[p.method]} · {formatDateTimeBR(p.createdAt)}
                    </td>
                    <td className="text-right">{formatBRL(p.amountCents)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td>Pago</td>
                  <td className="text-right">{formatBRL(paidCents)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
        {due - paidCents > 0 && (
          <p className="font-bold">
            Saldo a pagar: {formatBRL(due - paidCents)}
            {profile.pixKey ? ` · Pix: ${profile.pixKey}` : ""}
          </p>
        )}
        <hr className="border-dashed" />
        <p className="text-center text-xs">Obrigado pela preferência! Este recibo não é documento fiscal.</p>
      </article>
    </div>
  );
}
