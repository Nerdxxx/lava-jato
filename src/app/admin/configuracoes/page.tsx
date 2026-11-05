import { asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { holidays, operatingHours, resources, scheduleBlocks, servicePrices, services } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { requirePermission } from "@/lib/auth";
import { formatDateTimeBR, localDateOf } from "@/lib/time";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/modules/scheduling/labels";
import { loadSettings } from "@/modules/scheduling/settings";
import {
  addBlockAction,
  addHolidayAction,
  addResourceAction,
  removeBlockAction,
  removeHolidayAction,
  saveHoursAction,
  saveServiceAction,
  saveSettingsAction,
  toggleResourceAction,
} from "./actions";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hhmm = (t: string | undefined) => (t ? t.slice(0, 5) : "");
const centsToInput = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function SmallInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} className={"min-h-10 " + (props.className ?? "")} />;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requirePermission("configuracoes:gerir");
  const { ok, erro } = await searchParams;
  const db = await getDb();
  const today = localDateOf(new Date());

  const [settings, hours, resourceRows, holidayRows, blockRows, serviceRows, priceRows] = await Promise.all([
    loadSettings(db),
    db.select().from(operatingHours).orderBy(asc(operatingHours.opensAt)),
    db.select().from(resources).orderBy(asc(resources.name)),
    db.select().from(holidays).where(gte(holidays.day, today)).orderBy(asc(holidays.day)),
    db.select().from(scheduleBlocks).where(gte(scheduleBlocks.endsAt, new Date())).orderBy(asc(scheduleBlocks.startsAt)),
    db.select().from(services).orderBy(asc(services.displayOrder)),
    db.select().from(servicePrices).where(eq(servicePrices.active, true)),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-extrabold text-navy-950">Configurações da agenda</h1>
      {ok && (
        <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">
          {ok}
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {erro}
        </p>
      )}

      <Section title="Regras de agendamento" hint="Valem para novos agendamentos. Os já criados não mudam.">
        <form action={saveSettingsAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Intervalo entre horários (min)" htmlFor="slotStepMinutes">
            <Input id="slotStepMinutes" name="slotStepMinutes" type="number" min={5} defaultValue={settings.slotStepMinutes} required />
          </Field>
          <Field label="Preparação entre atendimentos (min)" htmlFor="prepMinutes">
            <Input id="prepMinutes" name="prepMinutes" type="number" min={0} defaultValue={settings.prepMinutes} required />
          </Field>
          <Field label="Antecedência mínima para agendar (min)" htmlFor="minAdvanceMinutes">
            <Input id="minAdvanceMinutes" name="minAdvanceMinutes" type="number" min={0} defaultValue={settings.minAdvanceMinutes} required />
          </Field>
          <Field label="Antecedência máxima (dias)" htmlFor="maxAdvanceDays">
            <Input id="maxAdvanceDays" name="maxAdvanceDays" type="number" min={1} defaultValue={settings.maxAdvanceDays} required />
          </Field>
          <Field label="Prazo para cancelar/reagendar (horas antes)" htmlFor="cancelDeadlineHours">
            <Input id="cancelDeadlineHours" name="cancelDeadlineHours" type="number" min={0} defaultValue={settings.cancelDeadlineHours} required />
          </Field>
          <div className="flex items-end">
            <Button type="submit">Salvar regras</Button>
          </div>
        </form>
      </Section>

      <Section title="Horário de funcionamento" hint="Deixe em branco para fechar o dia. Use a 2ª janela para pausa (ex.: 08–12 e 14–18).">
        <div className="space-y-3">
          {WEEKDAYS.map((name, weekday) => {
            const w = hours.filter((h) => h.weekday === weekday);
            return (
              <form key={weekday} action={saveHoursAction} className="flex flex-wrap items-end gap-2 border-t border-line pt-3 first:border-0 first:pt-0">
                <input type="hidden" name="weekday" value={weekday} />
                <p className="w-20 pb-2 text-sm font-semibold">{name}</p>
                <SmallInput aria-label={`${name} abre`} name="opens1" type="time" defaultValue={hhmm(w[0]?.opensAt)} className="w-28" />
                <SmallInput aria-label={`${name} fecha`} name="closes1" type="time" defaultValue={hhmm(w[0]?.closesAt)} className="w-28" />
                <span className="pb-2 text-xs text-muted">e</span>
                <SmallInput aria-label={`${name} abre (2ª janela)`} name="opens2" type="time" defaultValue={hhmm(w[1]?.opensAt)} className="w-28" />
                <SmallInput aria-label={`${name} fecha (2ª janela)`} name="closes2" type="time" defaultValue={hhmm(w[1]?.closesAt)} className="w-28" />
                <Button type="submit" variant="outline" className="min-h-10 px-3">
                  Salvar
                </Button>
              </form>
            );
          })}
        </div>
      </Section>

      <Section title="Vagas de lavagem" hint="Cada vaga atende um carro por vez. Mais vagas = mais agendamentos no mesmo horário.">
        <ul className="space-y-2">
          {resourceRows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className={r.active ? "font-semibold" : "text-muted line-through"}>{r.name}</span>
              <form action={toggleResourceAction}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="active" value={String(!r.active)} />
                <Button type="submit" variant="outline" className="min-h-9 px-3">
                  {r.active ? "Desativar" : "Ativar"}
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addResourceAction} className="flex items-end gap-2">
          <Field label="Nova vaga" htmlFor="resource-name">
            <Input id="resource-name" name="name" required maxLength={60} placeholder="Vaga 2" />
          </Field>
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section title="Feriados" hint="Nos feriados cadastrados não há horários disponíveis.">
        <ul className="space-y-2">
          {holidayRows.length === 0 && <li className="text-sm text-muted">Nenhum feriado futuro cadastrado.</li>}
          {holidayRows.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-semibold">{h.day.split("-").reverse().join("/")}</span> — {h.name}
              </span>
              <form action={removeHolidayAction}>
                <input type="hidden" name="id" value={h.id} />
                <Button type="submit" variant="outline" className="min-h-9 px-3">
                  Remover
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addHolidayAction} className="flex flex-wrap items-end gap-2">
          <Field label="Data" htmlFor="holiday-day">
            <Input id="holiday-day" name="day" type="date" required min={today} />
          </Field>
          <Field label="Nome" htmlFor="holiday-name">
            <Input id="holiday-name" name="name" required maxLength={100} />
          </Field>
          <Button type="submit">Adicionar</Button>
        </form>
      </Section>

      <Section title="Bloqueios" hint="Fecha um intervalo específico (manutenção, evento). Pode valer para todas as vagas ou só uma.">
        <ul className="space-y-2">
          {blockRows.length === 0 && <li className="text-sm text-muted">Nenhum bloqueio futuro.</li>}
          {blockRows.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {formatDateTimeBR(b.startsAt)} → {formatDateTimeBR(b.endsAt)} ·{" "}
                {b.resourceId ? (resourceRows.find((r) => r.id === b.resourceId)?.name ?? "vaga") : "todas as vagas"}
                {b.reason ? ` · ${b.reason}` : ""}
              </span>
              <form action={removeBlockAction}>
                <input type="hidden" name="id" value={b.id} />
                <Button type="submit" variant="outline" className="min-h-9 px-3">
                  Remover
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addBlockAction} className="grid gap-3 sm:grid-cols-2">
          <Field label="Data" htmlFor="block-date">
            <Input id="block-date" name="date" type="date" required min={today} />
          </Field>
          <Field label="Vaga" htmlFor="block-resource">
            <select id="block-resource" name="resourceId" className="min-h-11 w-full rounded-lg border border-line bg-surface px-3">
              <option value="">Todas as vagas</option>
              {resourceRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Das" htmlFor="block-start">
            <Input id="block-start" name="startTime" type="time" required />
          </Field>
          <Field label="Até" htmlFor="block-end">
            <Input id="block-end" name="endTime" type="time" required />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Motivo (opcional)" htmlFor="block-reason">
              <Input id="block-reason" name="reason" maxLength={160} />
            </Field>
          </div>
          <div>
            <Button type="submit">Criar bloqueio</Button>
          </div>
        </form>
      </Section>

      <Section
        title="Serviços e preços"
        hint="Preço em branco = serviço indisponível para a categoria. Alterações valem só para novos agendamentos."
      >
        <div className="space-y-6">
          {serviceRows.map((s) => (
            <form key={s.id} action={saveServiceAction} className="space-y-3 border-t border-line pt-4 first:border-0 first:pt-0">
              <input type="hidden" name="serviceId" value={s.id} />
              <div className="flex flex-wrap items-end gap-3">
                <p className="text-base font-bold">{s.name}</p>
                <Field label="Duração (min)" htmlFor={`dur-${s.id}`}>
                  <SmallInput id={`dur-${s.id}`} name="durationMinutes" type="number" min={5} defaultValue={s.durationMinutes} className="w-28" required />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={s.active} className="size-5" /> Ativo no site
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-2">Veículo</th>
                      <th className="px-1">Preço (R$)</th>
                      <th className="px-1">Promoção (R$)</th>
                      <th className="px-1">Promoção até</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORY_ORDER.map((c) => {
                      const p = priceRows.find((x) => x.serviceId === s.id && x.category === c);
                      return (
                        <tr key={c}>
                          <th className="py-1 pr-2 font-medium">{CATEGORY_LABEL[c]}</th>
                          <td className="px-1 py-1">
                            <SmallInput aria-label={`${s.name} ${CATEGORY_LABEL[c]} preço`} name={`price_${c}`} inputMode="decimal" defaultValue={centsToInput(p?.priceCents)} className="w-28" />
                          </td>
                          <td className="px-1 py-1">
                            <SmallInput aria-label={`${s.name} ${CATEGORY_LABEL[c]} promoção`} name={`promo_${c}`} inputMode="decimal" defaultValue={centsToInput(p?.promoPriceCents)} className="w-28" />
                          </td>
                          <td className="px-1 py-1">
                            <SmallInput aria-label={`${s.name} ${CATEGORY_LABEL[c]} validade`} name={`until_${c}`} type="date" defaultValue={p?.promoUntil ? localDateOf(p.promoUntil) : ""} className="w-40" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button type="submit">Salvar {s.name}</Button>
            </form>
          ))}
        </div>
      </Section>
    </div>
  );
}
