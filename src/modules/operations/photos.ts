import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { count, eq } from "drizzle-orm";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { workOrderPhotos, workOrders } from "@/db/schema";
import type { OpResult } from "./work-orders";

export const PHOTO_KINDS = ["ANTES", "DURANTE", "DEPOIS", "AVARIA"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_ORDER = 30;
const MAX_DIMENSION = 1600;

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** Confere o conteúdo real do arquivo (não confia na extensão nem no Content-Type enviado). */
export function detectImageType(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export function resolveStorageDir(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

/** Valida, remove metadados (EXIF/GPS), redimensiona, comprime em WebP e grava em armazenamento privado. */
export async function storePhoto(
  db: Database,
  input: { workOrderId: string; kind: string; bytes: Buffer; userId: string; storageDir: string },
): Promise<OpResult<{ id: string }>> {
  if (!(PHOTO_KINDS as readonly string[]).includes(input.kind)) return fail("Tipo de foto inválido.");
  if (input.bytes.length === 0) return fail("Arquivo vazio.");
  if (input.bytes.length > MAX_UPLOAD_BYTES) return fail("A foto excede o limite de 10 MB.");
  if (!detectImageType(input.bytes)) return fail("Formato não permitido. Envie JPEG, PNG ou WebP.");

  const [wo] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, input.workOrderId)).limit(1);
  if (!wo) return fail("Ordem de serviço não encontrada.");
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(workOrderPhotos).where(eq(workOrderPhotos.workOrderId, wo.id));
  if (n >= MAX_PHOTOS_PER_ORDER) return fail(`Limite de ${MAX_PHOTOS_PER_ORDER} fotos por OS atingido.`);

  let output: Buffer;
  try {
    output = await sharp(input.bytes, { limitInputPixels: 80_000_000 })
      .rotate() // aplica a orientação do EXIF antes de remover os metadados
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return fail("Não foi possível processar a imagem.");
  }

  const photoId = randomUUID();
  const relative = path.posix.join("os", wo.id, `${photoId}.webp`);
  const absolute = path.join(input.storageDir, ...relative.split("/"));
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, output);
  await db.insert(workOrderPhotos).values({
    id: photoId,
    workOrderId: wo.id,
    kind: input.kind as PhotoKind,
    storagePath: relative,
    mimeType: "image/webp",
    sizeBytes: output.length,
    uploadedBy: input.userId,
  });
  return { ok: true, value: { id: photoId } };
}

/** Lê uma foto do armazenamento privado. A autorização é responsabilidade de quem chama. */
export async function loadPhoto(db: Database, photoId: string, storageDir: string) {
  const [row] = await db.select().from(workOrderPhotos).where(eq(workOrderPhotos.id, photoId)).limit(1);
  if (!row) return null;
  const absolute = path.resolve(storageDir, ...row.storagePath.split("/"));
  if (!absolute.startsWith(path.resolve(storageDir) + path.sep)) return null; // anti path traversal
  try {
    return { row, bytes: await readFile(absolute) };
  } catch {
    return null;
  }
}
