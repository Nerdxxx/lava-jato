import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { rateLimit } from "@/lib/rate-limit";
import { isValidDateStr, formatTimeBR } from "@/lib/time";
import { getAvailableSlots } from "@/modules/scheduling/availability";
import { VEHICLE_CATEGORIES } from "@/modules/scheduling/booking";
import { resolveDuration } from "@/modules/scheduling/catalog";

export const dynamic = "force-dynamic";

const query = z.object({
  serviceId: z.string().uuid(),
  category: z.enum(VEHICLE_CATEGORIES),
  date: z.string().refine(isValidDateStr, "Data inválida"),
  excludeCode: z.string().max(12).optional(),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`slots:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: "Muitas requisições. Aguarde um instante." }, { status: 429 });
  }
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const db = await getDb();
  const duration = await resolveDuration(db, parsed.data.serviceId, parsed.data.category);
  if (!duration) return NextResponse.json({ error: "Serviço indisponível para este veículo." }, { status: 404 });

  const slots = await getAvailableSlots(db, { date: parsed.data.date, durationMinutes: duration });
  return NextResponse.json({
    slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: formatTimeBR(s.startsAt) })),
  });
}
