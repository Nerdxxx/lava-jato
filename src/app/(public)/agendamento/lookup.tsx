"use client";

import { useActionState, useState, useTransition } from "react";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { formatBRL } from "@/lib/utils";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE } from "@/modules/scheduling/labels";
import { cancelAction, lookupAction, rescheduleAction, type LookupState } from "./actions";

export function LookupClient() {
  const [state, formAction, searching] = useActionState<LookupState, FormData>(lookupAction, {});
  const [override, setOverride] = useState<LookupState | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newSlot, setNewSlot] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const current = override ?? state;
  const appt = current.appointment;
  const phone = current.phone ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <form action={(fd) => { setOverride(null); setRescheduling(false); formAction(fd); }} className="space-y-4">
          <Field label="Código do agendamento" htmlFor="code">
            <Input id="code" name="code" required maxLength={12} autoCapitalize="characters" />
          </Field>
          <Field label="WhatsApp usado no agendamento" htmlFor="phone">
            <Input id="phone" name="phone" required inputMode="tel" placeholder="(79) 99999-9999" />
          </Field>
          <Button type="submit" disabled={searching}>
            {searching ? "Buscando..." : "Consultar"}
          </Button>
        </form>
      </Card>

      {current.error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {current.error}
        </p>
      )}
      {current.message && (
        <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">
          {current.message}
        </p>
      )}

      {appt && (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-extrabold tracking-widest">{appt.code}</p>
            <Badge tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Serviço</dt>
            <dd>{appt.serviceName}</dd>
            <dt className="text-muted">Veículo</dt>
            <dd>
              {CATEGORY_LABEL[appt.category]} — {appt.vehicleModel}
            </dd>
            <dt className="text-muted">Quando</dt>
            <dd>{appt.startsAtLabel}</dd>
            <dt className="text-muted">Valor</dt>
            <dd>{formatBRL(appt.priceCents)}</dd>
          </dl>

          {appt.canChange && !rescheduling && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" type="button" onClick={() => setRescheduling(true)}>
                Reagendar
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Cancelar este agendamento?")) return;
                  startTransition(async () => setOverride(await cancelAction(appt.code, phone)));
                }}
              >
                Cancelar agendamento
              </Button>
            </div>
          )}

          {appt.canChange && rescheduling && (
            <div className="space-y-4 border-t border-line pt-4">
              <SlotPicker
                serviceId={appt.serviceId}
                category={appt.category}
                minDate={appt.minDate}
                maxDate={appt.maxDate}
                value={newSlot}
                onChange={setNewSlot}
              />
              <div className="flex gap-2">
                <Button variant="ghost" type="button" onClick={() => setRescheduling(false)}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={!newSlot || busy}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await rescheduleAction(appt.code, phone, newSlot!);
                      setOverride(res);
                      if (!res.error) setRescheduling(false);
                    })
                  }
                >
                  Confirmar novo horário
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
