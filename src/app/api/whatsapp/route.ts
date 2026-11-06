import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { SESSION_COOKIE } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateSession } from "@/lib/session-core";
import { isSameOrigin } from "@/lib/work-order-access";
import { loadProfile } from "@/modules/business/profile";
import {
  APPT_TEMPLATES,
  buildAppointmentMessage,
  buildWorkOrderMessage,
  logNotification,
  waLink,
  WO_TEMPLATES,
} from "@/modules/notifications/whatsapp";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("os"), id: z.string().uuid(), template: z.enum(WO_TEMPLATES) }),
  z.object({ kind: z.literal("agendamento"), id: z.string().uuid(), template: z.enum(APPT_TEMPLATES) }),
]);

/**
 * Gera a mensagem padrão, registra no histórico de notificações e redireciona para o WhatsApp
 * (link wa.me: a equipe confere e envia pelo próprio celular). Formulário HTML com target=_blank.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const user = token ? await validateSession(db, token) : null;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!hasPermission(user.role, "clientes:ver")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const parsed = bodySchema.safeParse({ kind: form?.get("kind"), id: form?.get("id"), template: form?.get("template") });
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const profile = await loadProfile(db);
  const appUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const msg =
    parsed.data.kind === "os"
      ? await buildWorkOrderMessage(db, parsed.data.id, parsed.data.template, profile.name, appUrl)
      : await buildAppointmentMessage(db, parsed.data.id, parsed.data.template, profile.name, appUrl);
  if (!msg) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

  await logNotification(db, { ...msg, template: parsed.data.template, message: msg.text, userId: user.id });
  return NextResponse.redirect(waLink(msg.phone, msg.text), 303);
}
