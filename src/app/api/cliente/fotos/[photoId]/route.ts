import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { SESSION_COOKIE } from "@/lib/auth";
import { validateSession } from "@/lib/session-core";
import { customerOwnsPhoto, getCustomerForUser } from "@/modules/customers/portal";
import { loadPhoto, resolveStorageDir } from "@/modules/operations/photos";

export const runtime = "nodejs";

/** Foto da OS para o próprio cliente: exige sessão de CLIENTE dono da OS. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return new NextResponse(null, { status: 404 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const db = await getDb();
  const user = token ? await validateSession(db, token) : null;
  if (!user || user.role !== "CLIENTE") return new NextResponse(null, { status: 401 });
  const customer = await getCustomerForUser(db, user.id);
  if (!customer || !(await customerOwnsPhoto(db, customer.id, photoId))) return new NextResponse(null, { status: 404 });
  const photo = await loadPhoto(db, photoId, resolveStorageDir());
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.row.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
