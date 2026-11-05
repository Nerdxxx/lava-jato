"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { services } from "@/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { cancelByCustomer, lookupAppointment, rescheduleByCustomer, type AppointmentRow } from "@/modules/scheduling/booking";
import { loadSettings } from "@/modules/scheduling/settings";
import { addDays, localDateOf } from "@/lib/time";

export interface AppointmentView {
  code: string;
  status: string;
  serviceId: string;
  serviceName: string;
  category: string;
  vehicleModel: string;
  startsAt: string;
  startsAtLabel: string;
  priceCents: number;
  canChange: boolean;
  minDate: string;
  maxDate: string;
}

export interface LookupState {
  error?: string;
  message?: string;
  appointment?: AppointmentView;
  phone?: string;
}

async function ip(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

async function toView(appt: AppointmentRow): Promise<AppointmentView> {
  const db = await getDb();
  const [svc] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId));
  const settings = await loadSettings(db);
  const today = localDateOf(new Date());
  return {
    code: appt.code,
    status: appt.status,
    serviceId: appt.serviceId,
    serviceName: svc?.name ?? "Serviço",
    category: appt.category,
    vehicleModel: appt.vehicleModel,
    startsAt: appt.startsAt.toISOString(),
    startsAtLabel: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Maceio",
      dateStyle: "full",
      timeStyle: "short",
    }).format(appt.startsAt),
    priceCents: appt.priceCents,
    canChange: appt.status === "PENDENTE" || appt.status === "CONFIRMADO",
    minDate: today,
    maxDate: addDays(today, settings.maxAdvanceDays),
  };
}

const NOT_FOUND = "Agendamento não encontrado. Confira o código e o WhatsApp.";

export async function lookupAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  if (!rateLimit(`lookup:${await ip()}`, 15, 10 * 60_000)) {
    return { error: "Muitas consultas. Aguarde alguns minutos." };
  }
  const code = String(formData.get("code") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const appt = await lookupAppointment(await getDb(), code, phone);
  if (!appt) return { error: NOT_FOUND };
  return { appointment: await toView(appt), phone };
}

export async function cancelAction(code: string, phone: string): Promise<LookupState> {
  if (!rateLimit(`cancel:${await ip()}`, 10, 10 * 60_000)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  const db = await getDb();
  const res = await cancelByCustomer(db, code, phone);
  if (!res.ok) return { error: res.message };
  return { appointment: await toView(res.value), phone, message: "Agendamento cancelado." };
}

export async function rescheduleAction(code: string, phone: string, startsAt: string): Promise<LookupState> {
  if (!rateLimit(`resched:${await ip()}`, 10, 10 * 60_000)) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) return { error: "Horário inválido." };
  const res = await rescheduleByCustomer(await getDb(), code, phone, when);
  if (!res.ok) return { error: res.message };
  return { appointment: await toView(res.value), phone, message: `Reagendado! Seu novo código é ${res.value.code}.` };
}
