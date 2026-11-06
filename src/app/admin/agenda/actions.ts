"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { redirect } from "next/navigation";
import { localDateOf } from "@/lib/time";
import { changeStatus, createAppointment } from "@/modules/scheduling/booking";
import { APPOINTMENT_STATUSES } from "@/modules/scheduling/state-machine";

const schema = z.object({ id: z.string().uuid(), to: z.enum(APPOINTMENT_STATUSES) });

export async function changeStatusAction(formData: FormData): Promise<void> {
  // Autorização sempre no servidor: esconder o botão na tela não basta.
  const user = await requirePermission("agenda:gerir");
  const parsed = schema.safeParse({ id: formData.get("id"), to: formData.get("to") });
  if (!parsed.success) return;
  const db = await getDb();
  const res = await changeStatus(db, parsed.data.id, parsed.data.to, user.id);
  if (res.ok) {
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "appointment.status",
      entity: "appointment",
      entityId: parsed.data.id,
      details: parsed.data.to,
    });
  }
  revalidatePath("/admin/agenda");
}

export interface CounterBookingState {
  error?: string;
}

/** Agendamento feito pela equipe (telefone/balcão): cria e já confirma. */
export async function createCounterBookingAction(_prev: CounterBookingState, fd: FormData): Promise<CounterBookingState> {
  const user = await requirePermission("agenda:gerir");
  const get = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const db = await getDb();
  const res = await createAppointment(
    db,
    {
      category: get("category") as never,
      serviceId: get("serviceId") as never,
      startsAt: get("startsAt") as never,
      name: get("name") ?? "",
      phone: get("phone") ?? "",
      vehicleModel: get("vehicleModel") ?? "",
      plate: get("plate"),
      notes: get("notes"),
    },
    { actorUserId: user.id },
  );
  if (!res.ok) return { error: res.message };
  await changeStatus(db, res.value.id, "CONFIRMADO", user.id);
  await db.insert(auditLogs).values({ userId: user.id, action: "appointment.create_staff", entity: "appointment", entityId: res.value.id });
  revalidatePath("/admin/agenda");
  const day = localDateOf(res.value.startsAt);
  redirect(`/admin/agenda?data=${day}&ok=${encodeURIComponent(`Agendamento ${res.value.code} criado e confirmado.`)}`);
}
