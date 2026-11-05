"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { changeStatus } from "@/modules/scheduling/booking";
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
