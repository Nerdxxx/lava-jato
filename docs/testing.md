# Testes
- `npm test` — Vitest (unidade/integração; banco PGlite em memória, migrations reais aplicadas).
- `npm run test:e2e` — Playwright (requer `npx playwright install chromium`). Sobe `npm run dev` sozinho; o login do admin usa `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` do `.env`.
- `npm run lint`, `npm run typecheck`, `npm run build` compõem o CI.
- Concorrência real: `tests/postgres-concurrency.test.ts` roda quando `TEST_POSTGRES_URL` aponta para um banco PostgreSQL **descartável** (o schema é recriado). No CI ele roda sempre. Local sem Docker: PostgreSQL no WSL (ver `PENDENTE INSTALAÇÃO.md`).
