import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { workOrders } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateSession } from "@/lib/session-core";
import { canAccessWorkOrder } from "@/lib/work-order-access";
import { loadPhoto, resolveStorageDir } from "@/modules/operations/photos";

export const runtime = "nodejs";

/** Foto privada: só entrega a quem está logado, tem permissão e pode acessar a OS. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return new NextResponse(null, { status: 404 });

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const user = token ? await validateSession(db, token) : null;
  if (!user || !hasPermission(user.role, "os:ver")) return new NextResponse(null, { status: 401 });

  const photo = await loadPhoto(db, photoId, resolveStorageDir());
  if (!photo) return new NextResponse(null, { status: 404 });
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, photo.row.workOrderId)).limit(1);
  if (!wo || !canAccessWorkOrder(user, wo)) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.row.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
