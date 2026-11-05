"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { rateLimit } from "@/lib/rate-limit";
import { createAppointment } from "@/modules/scheduling/booking";
import { BOOKING_COOKIE } from "./cookie";

export interface BookingState {
  error?: string;
}


export async function createBookingAction(_prev: BookingState, formData: FormData): Promise<BookingState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`book:${ip}`, 10, 10 * 60_000)) {
    return { error: "Muitas solicitações. Aguarde alguns minutos e tente novamente." };
  }

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };

  const result = await createAppointment(await getDb(), {
    category: get("category") as never,
    serviceId: get("serviceId") as never,
    startsAt: get("startsAt") as never,
    name: get("name") ?? "",
    phone: get("phone") ?? "",
    vehicleModel: get("vehicleModel") ?? "",
    plate: get("plate"),
    notes: get("notes"),
  });
  if (!result.ok) return { error: result.message };

  // O código é a "prova" de posse na página de confirmação; fica em cookie httpOnly, não na URL.
  (await cookies()).set(BOOKING_COOKIE, result.value.code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/agendar",
    maxAge: 60 * 60,
  });
  redirect("/agendar/confirmado");
}
