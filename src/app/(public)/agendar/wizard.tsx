"use client";

import { useActionState, useState } from "react";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import type { CatalogService } from "@/modules/scheduling/catalog";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { formatBRL, cn } from "@/lib/utils";
import { createBookingAction, type BookingState } from "./actions";

const STEPS = ["Veículo", "Serviço", "Horário", "Seus dados", "Confirmar"] as const;

export function BookingWizard({
  catalog,
  minDate,
  maxDate,
}: {
  catalog: CatalogService[];
  minDate: string;
  maxDate: string;
}) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [data, setData] = useState({ name: "", phone: "", vehicleModel: "", plate: "", notes: "" });
  const [state, action, pending] = useActionState<BookingState, FormData>(createBookingAction, {});

  const service = catalog.find((s) => s.id === serviceId);
  const available = category ? catalog.filter((s) => s.prices[category] !== undefined) : [];
  const price = service && category ? service.prices[category] : undefined;
  const dataOk = data.name.trim().length >= 2 && data.phone.replace(/\D/g, "").length >= 10 && data.vehicleModel.trim().length >= 2;

  const set = (k: keyof typeof data) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setData((d) => ({ ...d, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 overflow-x-auto text-xs font-semibold" aria-label="Etapas">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5",
              i === step ? "bg-navy-950 text-white" : i < step ? "bg-aqua-400/20 text-ocean-600" : "bg-surface text-muted",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="space-y-3">
          <h2 className="font-bold">Qual é o seu veículo?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setServiceId(null);
                  setStartsAt(null);
                  setStep(1);
                }}
                className="min-h-14 rounded-lg border border-line bg-surface px-4 text-left font-semibold hover:border-navy-950"
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </Card>
      )}

      {step === 1 && category && (
        <Card className="space-y-3">
          <h2 className="font-bold">Escolha o serviço — {CATEGORY_LABEL[category]}</h2>
          {available.length === 0 ? (
            <p className="text-sm text-muted">Nenhum serviço disponível para este veículo no momento.</p>
          ) : (
            available.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setServiceId(s.id);
                  setStartsAt(null);
                  setStep(2);
                }}
                className="w-full rounded-lg border border-line bg-surface p-4 text-left hover:border-navy-950"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-bold">{s.name}</span>
                  <span className="font-extrabold">{formatBRL(s.prices[category]!)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">Duração estimada: {s.durationMinutes} min</p>
                <ul className="mt-2 list-inside list-disc text-sm text-muted">
                  {s.includes.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                {s.excludes.length > 0 && <p className="mt-2 text-xs font-medium">Não inclui: {s.excludes.join(", ")}.</p>}
              </button>
            ))
          )}
          <Button variant="ghost" type="button" onClick={() => setStep(0)}>
            Voltar
          </Button>
        </Card>
      )}

      {step === 2 && category && serviceId && (
        <Card className="space-y-4">
          <h2 className="font-bold">Escolha a data e o horário</h2>
          <SlotPicker
            serviceId={serviceId}
            category={category}
            minDate={minDate}
            maxDate={maxDate}
            value={startsAt}
            onChange={setStartsAt}
          />
          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button type="button" disabled={!startsAt} onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <h2 className="font-bold">Seus dados</h2>
          <Field label="Nome" htmlFor="name">
            <Input id="name" value={data.name} onChange={set("name")} autoComplete="name" maxLength={120} />
          </Field>
          <Field label="WhatsApp (com DDD)" htmlFor="phone">
            <Input id="phone" value={data.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="(79) 99999-9999" />
          </Field>
          <Field label="Modelo do veículo" htmlFor="vehicleModel">
            <Input id="vehicleModel" value={data.vehicleModel} onChange={set("vehicleModel")} maxLength={80} />
          </Field>
          <Field label="Placa (opcional)" htmlFor="plate">
            <Input id="plate" value={data.plate} onChange={set("plate")} maxLength={10} autoCapitalize="characters" />
          </Field>
          <Field label="Observações (opcional)" htmlFor="notes">
            <Input id="notes" value={data.notes} onChange={set("notes")} maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button type="button" disabled={!dataOk} onClick={() => setStep(4)}>
              Revisar
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && service && category && startsAt && price !== undefined && (
        <form action={action}>
          <Card className="space-y-4">
            <h2 className="font-bold">Confira e confirme</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Veículo</dt>
              <dd>
                {CATEGORY_LABEL[category]} — {data.vehicleModel}
              </dd>
              <dt className="text-muted">Serviço</dt>
              <dd>{service.name}</dd>
              <dt className="text-muted">Quando</dt>
              <dd>
                {new Intl.DateTimeFormat("pt-BR", {
                  timeZone: "America/Maceio",
                  dateStyle: "full",
                  timeStyle: "short",
                }).format(new Date(startsAt))}
              </dd>
              <dt className="text-muted">Valor</dt>
              <dd className="font-bold">{formatBRL(price)}</dd>
              <dt className="text-muted">Cliente</dt>
              <dd>
                {data.name} · {data.phone}
              </dd>
            </dl>
            <p className="text-xs text-muted">
              O valor é pago no local. Seu pedido fica aguardando confirmação do lava jato.
            </p>
            {Object.entries({ category, serviceId, startsAt, ...data }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v ?? ""} />
            ))}
            {state.error && (
              <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
                {state.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={() => setStep(3)}>
                Voltar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Enviando..." : "Solicitar agendamento"}
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
