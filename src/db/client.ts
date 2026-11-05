import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Database;
  migrate: (migrationsFolder: string) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Cria a conexão a partir de uma URL.
 * - `postgres://...` → PostgreSQL (produção / Docker)
 * - `pglite://memory` ou `pglite://./caminho` → PGlite (dev/testes sem Docker)
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    const target = url.slice("pglite://".length);
    const dataDir = target === "memory" || target === "" ? undefined : target;
    if (dataDir) {
      const { mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(dataDir), { recursive: true });
    }
    const client = new PGlite({ ...(dataDir ? { dataDir } : {}), extensions: { btree_gist } });
    await client.waitReady;
    const db = drizzlePglite(client, { schema }) as unknown as Database;
    return {
      db,
      migrate: (folder) => migratePglite(drizzlePglite(client, { schema }), { migrationsFolder: folder }),
      close: () => client.close(),
    };
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzlePg(pool, { schema }) as unknown as Database;
  return {
    db,
    migrate: (folder) => migratePg(drizzlePg(pool, { schema }), { migrationsFolder: folder }),
    close: () => pool.end(),
  };
}

const globalForDb = globalThis as unknown as { __ljcDb?: Promise<DbHandle> };

/** Singleton para o app (sobrevive ao hot reload em dev). */
export function getDb(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  globalForDb.__ljcDb ??= (async () => {
    const handle = await createDb(url);
    if (url.startsWith("pglite://")) await handle.migrate("./drizzle");
    return handle;
  })();
  return globalForDb.__ljcDb.then((h) => h.db);
}
