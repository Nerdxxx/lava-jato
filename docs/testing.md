# Testes
- `npm test` — Vitest (unidade/integração; banco PGlite em memória, migrations reais aplicadas).
- `npm run test:e2e` — Playwright (requer `npx playwright install chromium`). Sobe `npm run dev` sozinho; o login do admin usa `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` do `.env`.
- `npm run lint`, `npm run typecheck`, `npm run build` compõem o CI.
- Concorrência real (reservas simultâneas) deve rodar contra PostgreSQL via Docker (pendência P-01).
