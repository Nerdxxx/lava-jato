import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { rateLimit } from "@/lib/rate-limit";
import { isValidDateStr, formatTimeBR } from "@/lib/time";
import { getAvailableSlots } from "@/modules/scheduling/availability";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";
import { lookupAppointment } from "@/modules/scheduling/booking";
import { resolveDuration } from "@/modules/scheduling/catalog";
import { addonsDuration, loadAddons, resolveAddons, type AppliedAddon } from "@/modules/scheduling/addons";

export const dynamic = "force-dynamic";

const query = z.object({
  serviceId: z.string().uuid(),
  category: z.enum(VEHICLE_CATEGORIES),
  date: z.string().refine(isValidDateStr, "Data inválida"),
  excludeCode: z.string().max(12).optional(),
  phone: z.string().max(32).optional(),
  addons: z.array(z.string().max(40)).max(10).default([]),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`slots:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  const parsed = query.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const db = await getDb();
  const excluded = parsed.data.excludeCode
    ? parsed.data.phone ? await lookupAppointment(db, parsed.data.excludeCode, parsed.data.phone) : null
    : null;
  if (parsed.data.excludeCode && !excluded) return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  if (excluded && (excluded.serviceId !== parsed.data.serviceId || excluded.category !== parsed.data.category)) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }
  const duration = await resolveDuration(db, parsed.data.serviceId, parsed.data.category);
  if (!duration) return NextResponse.json({ error: "Serviço indisponível para este veículo." }, { status: 404 });
  let selected: AppliedAddon[];
  if (excluded) {
    selected = excluded.addons.map((a) => ({ ...a, durationMinutes: a.durationMinutes ?? 10 }));
  } else {
    const chosen = resolveAddons(await loadAddons(db), parsed.data.category, parsed.data.addons);
    if (!chosen.ok) return NextResponse.json({ error: chosen.message }, { status: 400 });
    selected = chosen.value;
  }

  const slots = await getAvailableSlots(db, {
    date: parsed.data.date,
    durationMinutes: duration + addonsDuration(selected),
    excludeAppointmentId: excluded?.id,
  });
  return NextResponse.json({
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: formatTimeBR(s.startsAt) })),
  });
}
