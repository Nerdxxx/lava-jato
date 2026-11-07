"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bike, Car, CarFront, Check, Clock, LoaderCircle, Plus, Truck } from "lucide-react";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import type { Addon } from "@/modules/scheduling/addons";
import type { CatalogService } from "@/modules/scheduling/catalog";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { formatBRL, cn } from "@/lib/utils";
import { createBookingAction, type BookingState } from "./actions";

type StepKey = "veiculo" | "servico" | "adicionais" | "horario" | "dados" | "revisao";
const STEP_LABEL: Record<StepKey, string> = {
  veiculo: "Veículo",
  servico: "Serviço",
  adicionais: "Adicionais",
  horario: "Data e horário",
  dados: "Seus dados",
  revisao: "Revisão",
};
const CATEGORY_ICON: Record<string, typeof Car> = { MOTO: Bike, CARRO_PEQUENO: Car, CARRO_MEDIO: Car, SUV: CarFront, PICAPE: Truck };

const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Maceio", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

function OptionCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative w-full rounded-2xl border-2 bg-surface p-4 text-left transition hover:border-ocean-600/60 hover:shadow-md active:scale-[0.99]",
        selected ? "border-navy-950 shadow-md" : "border-line",
        className,
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-navy-950 text-white">
          <Check className="size-4" strokeWidth={3} aria-hidden />
        </span>
      )}
      {children}
    </button>
  );
}

export function BookingWizard({
  catalog,
  addons = [],
  minDate,
  maxDate,
  prepMinutes = 0,
  action: submitAction = createBookingAction,
  staff = false,
  initialCategory,
  initialServiceId,
}: {
  catalog: CatalogService[];
  /** Adicionais ATIVOS; o servidor revalida e recalcula o total ao enviar. */
  addons?: Addon[];
  minDate: string;
  maxDate: string;
  prepMinutes?: number;
  /** Ação de envio (o painel usa uma ação própria que já confirma o agendamento). */
  action?: (prev: BookingState, fd: FormData) => Promise<BookingState>;
  staff?: boolean;
  initialCategory?: string;
  initialServiceId?: string;
}) {
  const validCategory = initialCategory && catalog.some((s) => s.prices[initialCategory] !== undefined) ? initialCategory : null;
  const suggestedServiceId = initialServiceId && catalog.some((s) => s.id === initialServiceId) ? initialServiceId : null;
  const validService =
    validCategory && initialServiceId && catalog.find((s) => s.id === initialServiceId)?.prices[validCategory] !== undefined ? initialServiceId : null;

  const [category, setCategory] = useState<string | null>(validCategory);
  const [serviceId, setServiceId] = useState<string | null>(validService);
  const [chosenAddons, setChosenAddons] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [data, setData] = useState({ name: "", phone: "", vehicleModel: "", plate: "", notes: "" });
  const [state, action, pending] = useActionState<BookingState, FormData>(submitAction, {});

  const availableAddons = category ? addons.filter((a) => a.active && a.categories.includes(category)) : [];
  const steps: StepKey[] = ["veiculo", "servico", ...(availableAddons.length ? (["adicionais"] as const) : []), "horario", "dados", "revisao"];
  const [step, setStep] = useState<StepKey>(validService ? (availableAddons.length ? "adicionais" : "horario") : validCategory ? "servico" : "veiculo");
  const index = Math.max(0, steps.indexOf(step));
  const go = (offset: number) => setStep(steps[Math.min(steps.length - 1, Math.max(0, index + offset))]!);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);

  const service = catalog.find((s) => s.id === serviceId);
  const available = category ? catalog.filter((s) => s.prices[category] !== undefined) : [];
  const basePrice = service && category ? service.prices[category] : undefined;
  const addonList = availableAddons.filter((a) => chosenAddons.includes(a.slug));
  const total = basePrice === undefined ? undefined : basePrice + addonList.reduce((s, a) => s + a.priceCents, 0);
  const phoneDigits = data.phone.replace(/\D/g, "");
  const errors = {
    name: data.name.trim().length > 0 && data.name.trim().length < 2 ? "Informe o nome completo." : undefined,
    phone: phoneDigits.length > 0 && phoneDigits.length < 10 ? "Informe o WhatsApp com DDD." : undefined,
  };
  const dataOk = data.name.trim().length >= 2 && phoneDigits.length >= 10 && data.vehicleModel.trim().length >= 2;

  const set = (k: keyof typeof data) => (e: React.ChangeEvent<HTMLInputElement>) => setData((d) => ({ ...d, [k]: e.target.value }));
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
    const masked = digits.length <= 2 ? digits : digits.length <= 7 ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    setData((d) => ({ ...d, phone: masked }));
  };
  const toggleAddon = (slug: string) => {
    setStartsAt(null);
    setChosenAddons((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));
  };
  const serviceMinutes = service && category ? service.durations[category] ?? service.durationMinutes : 0;
  const bookedMinutes = serviceMinutes + addonList.reduce((n, a) => n + a.durationMinutes, 0) + prepMinutes;

  const heading = (children: React.ReactNode) => (
    <h2 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold tracking-tight text-navy-950 outline-none sm:text-2xl">
      {children}
    </h2>
  );
  const backButton = (
    <Button variant="ghost" type="button" onClick={() => go(-1)} className="gap-1.5 px-3">
      <ArrowLeft className="size-4" aria-hidden />
      Voltar
    </Button>
  );

  const summary = (
    <aside aria-label="Resumo do agendamento" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Resumo</h3>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Veículo</dt>
          <dd className="text-right font-semibold">{category ? CATEGORY_LABEL[category] : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Serviço</dt>
          <dd className="text-right font-semibold">
            {service ? service.name : "—"}
            {basePrice !== undefined && <span className="block text-xs font-normal text-muted">{formatBRL(basePrice)}</span>}
          </dd>
        </div>
        {addonList.map((a) => (
          <div key={a.slug} className="flex justify-between gap-3">
            <dt className="text-muted">+ {a.name}</dt>
            <dd className="shrink-0 font-semibold">{formatBRL(a.priceCents)}</dd>
          </div>
        ))}
        {startsAt && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Quando</dt>
            <dd className="text-right font-semibold first-letter:uppercase">{fmtWhen(startsAt)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-sm font-semibold">Total estimado</span>
        <span className="text-2xl font-extrabold tracking-tight text-navy-950">{total === undefined ? "—" : formatBRL(total)}</span>
      </div>
      <p className="mt-2 text-xs text-muted">Duração estimada: {service ? serviceMinutes + addonList.reduce((n, a) => n + a.durationMinutes, 0) : 0} min{service ? ` + ${prepMinutes} min de intervalo operacional` : ""}.</p>
      <p className="mt-2 text-xs text-muted">{staff ? "Valor confirmado pelo sistema ao salvar." : "Pago no local. O valor final é confirmado pelo sistema ao enviar."}</p>
    </aside>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {/* progresso */}
        <div>
          <div className="flex items-center justify-between text-sm">
            <p className="font-semibold text-navy-950">
              Etapa {index + 1} de {steps.length} · <span className="text-ocean-600">{STEP_LABEL[step]}</span>
            </p>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Progresso do agendamento"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={index + 1}
          >
            <div className="h-full rounded-full bg-gradient-to-r from-ocean-600 to-aqua-400 transition-[width] duration-500" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-3 hidden gap-1 text-xs font-medium text-muted sm:flex" aria-label="Etapas">
            {steps.map((k, i) => (
              <li key={k} aria-current={k === step ? "step" : undefined} className={cn("flex items-center gap-1", i < index && "text-ocean-600", k === step && "font-bold text-navy-950")}>
                {i > 0 && <span aria-hidden className="mx-1 text-line">/</span>}
                {i < index && <Check className="size-3" strokeWidth={3} aria-hidden />}
                {STEP_LABEL[k]}
              </li>
            ))}
          </ol>
        </div>

        <details className="sticky top-[4.5rem] z-20 rounded-xl border border-line bg-surface/95 shadow-sm backdrop-blur lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-navy-950">
            <span className="truncate">Resumo do agendamento{service ? ` · ${service.name}` : ""}</span>
            <span className="shrink-0 text-base font-extrabold">{total === undefined ? "—" : formatBRL(total)}</span>
          </summary>
          <div className="border-t border-line p-3">{summary}</div>
        </details>

        {step === "veiculo" && (
          <section className="space-y-4">
            {heading(<>{staff ? "Qual é o veículo do cliente?" : "Qual é o seu veículo?"}</>)}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CATEGORY_ORDER.filter((c) => catalog.some((s) => s.prices[c] !== undefined)).map((c) => {
                const Icon = CATEGORY_ICON[c] ?? Car;
                const prices = catalog.map((s) => s.prices[c]).filter((v): v is number => v !== undefined);
                return (
                  <OptionCard
                    key={c}
                    selected={category === c}
                    onClick={() => {
                      const suggested = catalog.find((s) => s.id === suggestedServiceId && s.prices[c] !== undefined);
                      if (category !== c) {
                        setChosenAddons([]);
                        setStartsAt(null);
                      }
                      setServiceId(suggested?.id ?? null);
                      setCategory(c);
                      const hasExtras = addons.some((a) => a.active && a.categories.includes(c));
                      setStep(suggested ? (hasExtras ? "adicionais" : "horario") : "servico");
                    }}
                    className="flex min-h-20 items-center gap-3"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ocean-600/10 text-ocean-600">
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-bold text-navy-950">{CATEGORY_LABEL[c]}</span>
                      {prices.length > 0 && <span className="block text-xs text-muted">a partir de {formatBRL(Math.min(...prices))}</span>}
                    </span>
                  </OptionCard>
                );
              })}
            </div>
          </section>
        )}

        {step === "servico" && category && (
          <section className="space-y-4">
            {heading(<>Escolha o serviço</>)}
            <p className="-mt-2 text-sm text-muted">Valores para {CATEGORY_LABEL[category]?.toLowerCase()}.</p>
            {available.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">Nenhum serviço disponível para este veículo no momento.</p>
            ) : (
              <div className="space-y-3">
                {available.map((s) => (
                  <OptionCard
                    key={s.id}
                    selected={serviceId === s.id}
                    onClick={() => {
                      if (serviceId !== s.id) setStartsAt(null);
                      setServiceId(s.id);
                      setStep(availableAddons.length ? "adicionais" : "horario");
                    }}
                    className="p-5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pr-8">
                      <span className="text-lg font-bold text-navy-950">{s.name}</span>
                      <span className="text-2xl font-extrabold tracking-tight text-navy-950">{formatBRL(s.prices[category]!)}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="size-3.5" aria-hidden /> Duração estimada: {s.durations[category] ?? s.durationMinutes} min
                    </p>
                    <p className="mt-2 text-sm text-muted">{s.includes.slice(0, 2).join(" · ")}{s.includes.length > 2 ? ` · +${s.includes.length - 2} itens` : ""}</p>
                    <details className="mt-3 text-sm">
                      <summary className="w-fit cursor-pointer font-semibold text-ocean-600">Ver todos os itens incluídos</summary>
                      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {(s.includesByCategory[category] ?? s.includes).map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-ocean-600" strokeWidth={3} aria-hidden />{i}</li>)}
                      </ul>
                    </details>
                    {s.excludes.length > 0 && <p className="mt-3 text-xs font-medium text-muted">Não inclui: {s.excludes.join(", ").toLowerCase()}.</p>}
                  </OptionCard>
                ))}
              </div>
            )}
            {backButton}
          </section>
        )}

        {step === "adicionais" && category && service && (
          <section className="space-y-4">
            {heading(<>Quer dar um cuidado extra ao seu carro?</>)}
            <p className="-mt-2 text-sm text-muted">Opcional. Marque quantos quiser — o valor é somado ao total.</p>
            <div className="space-y-3">
              {availableAddons.map((a) => {
                const on = chosenAddons.includes(a.slug);
                return (
                  <label
                    key={a.slug}
                    className={cn(
                      "flex cursor-pointer items-start gap-4 rounded-2xl border-2 bg-surface p-4 transition hover:border-ocean-600/60",
                      on ? "border-navy-950 shadow-md" : "border-line",
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleAddon(a.slug)} className="mt-1 size-5 shrink-0 accent-navy-950" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-bold text-navy-950">{a.name}</span>
                        <span className="flex items-center font-extrabold text-navy-950">
                          <Plus className="size-3.5" strokeWidth={3} aria-hidden />
                          {formatBRL(a.priceCents)}
                        </span>
                      </span>
                      {a.description && <span className="mt-1 block text-sm text-muted">{a.description}</span>}
                      <span className="mt-1 block text-xs font-medium text-muted">Acrescenta {a.durationMinutes} min ao atendimento.</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              {backButton}
              <Button type="button" onClick={() => go(1)} className="flex-1 sm:flex-none">
                {chosenAddons.length ? "Continuar" : "Continuar sem adicionais"}
              </Button>
            </div>
          </section>
        )}

        {step === "horario" && category && serviceId && (
          <section className="space-y-4">
            {heading(<>Escolha a data e o horário</>)}
            <p className="-mt-2 text-sm text-muted">Mostramos apenas horários realmente livres.</p>
            <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <SlotPicker serviceId={serviceId} category={category} addonSlugs={chosenAddons} minDate={minDate} maxDate={maxDate} value={startsAt} onChange={setStartsAt} />
            </div>
            <div className="flex gap-2">
              {backButton}
              <Button type="button" disabled={!startsAt} onClick={() => go(1)} className="flex-1 sm:flex-none">
                Continuar
              </Button>
            </div>
          </section>
        )}

        {step === "dados" && (
          <section className="space-y-4">
            {heading(<>{staff ? "Dados do cliente" : "Seus dados"}</>)}
            <div className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 sm:p-5">
              <Field label="Nome" htmlFor="name" error={errors.name}>
                <Input id="name" value={data.name} onChange={set("name")} autoComplete="name" maxLength={120} enterKeyHint="next" />
              </Field>
              <Field label="WhatsApp (com DDD)" htmlFor="phone" error={errors.phone}>
                <Input id="phone" type="tel" value={data.phone} onChange={setPhone} inputMode="tel" autoComplete="tel" placeholder="(79) 99999-9999" enterKeyHint="next" />
              </Field>
              <Field label="Modelo do veículo" htmlFor="vehicleModel">
                <Input id="vehicleModel" value={data.vehicleModel} onChange={set("vehicleModel")} maxLength={80} placeholder="Ex.: Onix, HB20, CG 160" enterKeyHint="next" />
              </Field>
              <Field label="Placa (opcional)" htmlFor="plate">
                <Input id="plate" value={data.plate} onChange={set("plate")} maxLength={10} autoCapitalize="characters" enterKeyHint="next" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Observações (opcional)" htmlFor="notes">
                  <Input id="notes" value={data.notes} onChange={set("notes")} maxLength={500} enterKeyHint="done" />
                </Field>
              </div>
            </div>
            <div className="flex gap-2">
              {backButton}
              <Button type="button" disabled={!dataOk} onClick={() => go(1)} className="flex-1 sm:flex-none">
                Revisar agendamento
              </Button>
            </div>
          </section>
        )}

        {step === "revisao" && service && category && startsAt && total !== undefined && (
          <form action={action} className="space-y-4">
            {heading(<>Confira e confirme</>)}
            <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-5 text-sm">
              {[
                ["Veículo", `${CATEGORY_LABEL[category]} — ${data.vehicleModel}${data.plate ? ` (${data.plate.toUpperCase()})` : ""}`],
                ["Serviço", service.name],
                ...(addonList.length ? [["Adicionais", addonList.map((a) => a.name).join(", ")]] : []),
                ["Quando", fmtWhen(startsAt)],
                ["Duração reservada", `${bookedMinutes} min (inclui o intervalo operacional)`],
                [staff ? "Cliente" : "Seus dados", `${data.name} · ${data.phone}`],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold first-letter:uppercase sm:text-right">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className="font-semibold">Total</dt>
                <dd className="text-2xl font-extrabold tracking-tight text-navy-950">{formatBRL(total)}</dd>
              </div>
            </dl>
            <dl className="space-y-2 rounded-2xl border border-line bg-surface p-4 text-sm">
              <div className="flex justify-between gap-3"><dt>{service.name}</dt><dd className="font-semibold">{formatBRL(basePrice!)}</dd></div>
              {addonList.map((a) => <div key={a.slug} className="flex justify-between gap-3"><dt>{a.name}</dt><dd className="font-semibold">{formatBRL(a.priceCents)}</dd></div>)}
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatBRL(total)}</dd></div>
            </dl>
            <p className="text-xs text-muted">
              {staff ? "O agendamento será criado já confirmado." : "O valor é pago no local. Seu pedido fica aguardando confirmação do lava jato."}
            </p>
            {Object.entries({ category, serviceId: service.id, startsAt, ...data }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v ?? ""} />
            ))}
            {addonList.map((a) => (
              <input key={a.slug} type="hidden" name="addons" value={a.slug} />
            ))}
            {state.error && (
              <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm font-medium text-danger">
                {state.error}
              </p>
            )}
            <div className="flex gap-2">
              {backButton}
              <Button type="submit" disabled={pending} className="min-h-12 flex-1 text-base sm:flex-none sm:px-8">
                {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                {pending ? "Enviando..." : staff ? "Agendar e confirmar" : "Solicitar agendamento"}
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="hidden lg:sticky lg:top-24 lg:block">{summary}</div>
    </div>
  );
}
