# PENDENTE INSTALAÇÃO

Itens que precisam ser instalados por você (exigem administrador). O restante do projeto segue sem eles, usando PGlite (Postgres em WASM) no lugar do Docker.

## 1. WSL2 — PENDENTE
PowerShell **como Administrador**:
```
wsl --install --no-distribution
```
Depois **reinicie o Windows**.

## 2. Docker Desktop — PENDENTE
Depois do reinício, no PowerShell:
```
winget install -e --id Docker.DockerDesktop
```
Abra o Docker Desktop, aceite os termos e aguarde "Engine running". Confirme com `docker --version` e `docker compose version`.

## 3. Navegador do Playwright (testes E2E) — CONCLUÍDO (2026-11-05)
Na pasta do projeto (já instalado):
```
npx playwright install chromium
```

## O que eu faço depois que você instalar
1. `docker compose up -d` (PostgreSQL 17).
2. Trocar `DATABASE_URL` no `.env` para `postgres://ljc:ljc@localhost:5432/ljc`.
3. `npm run db:migrate` e `npm run db:seed`.
4. Rodar os testes de concorrência de agendamento contra o Postgres real (PGlite usa uma conexão só, então não prova concorrência de verdade).
5. Rodar os testes E2E.

## Já verificado neste computador
| Item | Situação |
|---|---|
| Node.js | v24.19.0 — OK |
| npm | 11.17.0 — OK |
| Git | 2.55.0 — OK |
| winget | 1.29 — OK |
| WSL | não instalado |
| Docker / Docker Compose | não instalado |
