"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { isValidDateStr, localToUtc } from "@/lib/time";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";
import {
  addBlock,
  addHoliday,
  addResource,
  parseMoneyToCents,
  removeBlock,
  removeHoliday,
  saveOperatingHours,
  saveSettings,
  setPrice,
  setResourceActive,
  updateService,
  type ConfigResult,
  type HoursWindow,
} from "@/modules/scheduling/config";

import { saveProfile } from "@/modules/business/profile";

const BASE = "/admin/configuracoes";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function finish(userId: string, action: string, details: string, result: ConfigResult<unknown>, okMessage: string): Promise<never> {
  if (!result.ok) redirect(`${BASE}?erro=${encodeURIComponent(result.message)}`);
  const db = await getDb();
  await db.insert(auditLogs).values({ userId, action, entity: "config", details });
  revalidatePath(BASE);
  redirect(`${BASE}?ok=${encodeURIComponent(okMessage)}`);
}

const idSchema = z.string().uuid();

export async function saveSettingsAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const num = (k: string) => Number(str(fd, k));
  const result = await saveSettings(await getDb(), {
    slotStepMinutes: num("slotStepMinutes"),
    prepMinutes: num("prepMinutes"),
    minAdvanceMinutes: num("minAdvanceMinutes"),
    maxAdvanceDays: num("maxAdvanceDays"),
    cancelDeadlineHours: num("cancelDeadlineHours"),
  });
  await finish(user.id, "config.settings", "regras de agendamento", result, "Regras de agendamento salvas.");
}

export async function saveHoursAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const weekday = Number(str(fd, "weekday"));
  const windows: HoursWindow[] = [];
  for (const n of ["1", "2"]) {
    const opensAt = str(fd, `opens${n}`);
    const closesAt = str(fd, `closes${n}`);
    if (opensAt || closesAt) windows.push({ opensAt, closesAt });
  }
  const result = await saveOperatingHours(await getDb(), weekday, windows);
  await finish(user.id, "config.hours", `dia ${weekday}`, result, "Horário salvo.");
}

export async function addResourceAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const result = await addResource(await getDb(), str(fd, "name"));
  await finish(user.id, "config.resource.add", str(fd, "name"), result, "Vaga adicionada.");
}

export async function toggleResourceAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const id = idSchema.safeParse(str(fd, "id"));
  if (!id.success) redirect(`${BASE}?erro=${encodeURIComponent("Vaga inválida.")}`);
  const result = await setResourceActive(await getDb(), id.data, str(fd, "active") === "true");
  await finish(user.id, "config.resource.toggle", id.data, result, "Vaga atualizada.");
}

export async function addHolidayAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const result = await addHoliday(await getDb(), str(fd, "day"), str(fd, "name"));
  await finish(user.id, "config.holiday.add", str(fd, "day"), result, "Feriado adicionado.");
}

export async function removeHolidayAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const id = idSchema.safeParse(str(fd, "id"));
  if (id.success) await removeHoliday(await getDb(), id.data);
  await finish(user.id, "config.holiday.remove", str(fd, "id"), { ok: true, value: undefined }, "Feriado removido.");
}

export async function addBlockAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const resource = str(fd, "resourceId");
  const result = await addBlock(
    await getDb(),
    {
      date: str(fd, "date"),
      startTime: str(fd, "startTime"),
      endTime: str(fd, "endTime"),
      resourceId: resource && idSchema.safeParse(resource).success ? resource : null,
      reason: str(fd, "reason"),
    },
    user.id,
  );
  const msg =
    result.ok && result.value.conflicts > 0
      ? `Bloqueio criado, mas ${result.value.conflicts} agendamento(s) já existente(s) caem nesse período. Revise na Agenda.`
      : "Bloqueio criado.";
  await finish(user.id, "config.block.add", str(fd, "date"), result, msg);
}

export async function removeBlockAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const id = idSchema.safeParse(str(fd, "id"));
  if (id.success) await removeBlock(await getDb(), id.data);
  await finish(user.id, "config.block.remove", str(fd, "id"), { ok: true, value: undefined }, "Bloqueio removido.");
}

export async function saveServiceAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const db = await getDb();
  const serviceId = str(fd, "serviceId");
  if (!idSchema.safeParse(serviceId).success) redirect(`${BASE}?erro=${encodeURIComponent("Serviço inválido.")}`);

  const svc = await updateService(db, serviceId, {
    durationMinutes: Number(str(fd, "durationMinutes")),
    active: fd.get("active") === "on",
  });
  if (!svc.ok) redirect(`${BASE}?erro=${encodeURIComponent(svc.message)}`);

  for (const category of VEHICLE_CATEGORIES) {
    const rawPrice = str(fd, `price_${category}`);
    const rawPromo = str(fd, `promo_${category}`);
    const rawUntil = str(fd, `until_${category}`);
    let priceCents: number | null = null;
    if (rawPrice !== "") {
      priceCents = parseMoneyToCents(rawPrice);
      if (priceCents === null) redirect(`${BASE}?erro=${encodeURIComponent(`Preço inválido para ${category}.`)}`);
    }
    let promoPriceCents: number | null = null;
    if (rawPromo !== "") {
      promoPriceCents = parseMoneyToCents(rawPromo);
      if (promoPriceCents === null) redirect(`${BASE}?erro=${encodeURIComponent(`Preço promocional inválido para ${category}.`)}`);
    }
    if (rawUntil !== "" && !isValidDateStr(rawUntil)) redirect(`${BASE}?erro=${encodeURIComponent("Data de validade da promoção inválida.")}`);
    const res = await setPrice(db, {
      serviceId,
      category,
      priceCents,
      promoPriceCents,
      promoUntil: rawUntil ? localToUtc(rawUntil, "23:59") : null,
    });
    if (!res.ok) redirect(`${BASE}?erro=${encodeURIComponent(res.message)}`);
  }
  await finish(user.id, "config.service", serviceId, { ok: true, value: undefined }, "Serviço e preços salvos.");
}

export async function saveProfileAction(fd: FormData): Promise<void> {
  const user = await requirePermission("configuracoes:gerir");
  const res = await saveProfile(await getDb(), {
    name: str(fd, "name"),
    whatsapp: str(fd, "whatsapp"),
    address: str(fd, "address"),
    mapsUrl: str(fd, "mapsUrl"),
    instagram: str(fd, "instagram"),
    pixKey: str(fd, "pixKey"),
  });
  revalidatePath("/", "layout");
  await finish(user.id, "config.profile", "business_profile", res.ok ? { ok: true, value: undefined } : res, "Dados do negócio salvos.");
}
