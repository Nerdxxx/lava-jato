import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { auditLogs, workOrders } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateSession } from "@/lib/session-core";
import { canAccessWorkOrder, isSameOrigin } from "@/lib/work-order-access";
import { MAX_UPLOAD_BYTES, resolveStorageDir, storePhoto } from "@/modules/operations/photos";

export const runtime = "nodejs";

function redirectBack(request: NextRequest, id: string, kind: "ok" | "erro", message: string) {
  const url = new URL(`/admin/os/${id}`, request.url);
  url.searchParams.set(kind, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSameOrigin(request.headers)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const user = token ? await validateSession(db, token) : null;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!hasPermission(user.role, "fila:atualizar")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "OS inválida." }, { status: 404 });
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
  if (!wo || !canAccessWorkOrder(user, wo)) return NextResponse.json({ error: "OS não encontrada." }, { status: 404 });
  if (wo.status === "ENTREGUE" || wo.status === "CANCELADO") return redirectBack(request, id, "erro", "A OS já foi encerrada.");

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return redirectBack(request, id, "erro", "A foto excede o limite de 10 MB.");

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  const kind = form?.get("kind");
  if (!(file instanceof File) || typeof kind !== "string") return redirectBack(request, id, "erro", "Envie uma foto.");

  const result = await storePhoto(db, {
    workOrderId: wo.id,
    kind,
    bytes: Buffer.from(await file.arrayBuffer()),
    userId: user.id,
    storageDir: resolveStorageDir(),
  });
  if (!result.ok) return redirectBack(request, id, "erro", result.message);
  await db.insert(auditLogs).values({ userId: user.id, action: "work_order.photo", entity: "work_order", entityId: wo.id, details: kind });
  return redirectBack(request, id, "ok", "Foto enviada.");
}
