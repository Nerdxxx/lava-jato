import { createDb } from "../src/db/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");
const handle = await createDb(url);
await handle.migrate("./drizzle");
await handle.close();
console.log("Migrations aplicadas.");
