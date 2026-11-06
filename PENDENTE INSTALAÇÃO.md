# PENDENTE INSTALAÇÃO

## 1. WSL2 — CONCLUÍDO
Ubuntu instalado no WSL2.

## 2. PostgreSQL local — CONCLUÍDO (via WSL, sem Docker)
PostgreSQL 18 instalado dentro do Ubuntu do WSL, com usuário `ljc` (senha `ljc`) e os bancos `ljc` e `ljc_test`.
Se o Windows reiniciar, o serviço para. Para ligar de novo:
```
wsl -d Ubuntu -u root -- service postgresql start
```
Testes de concorrência real (PowerShell):
```
$env:TEST_POSTGRES_URL="postgres://ljc:ljc@localhost:5432/ljc_test"; npx vitest run tests/postgres-concurrency.test.ts
```
O app em desenvolvimento continua usando PGlite (não depende do WSL ligado). Para usar o Postgres local, troque no `.env`:
`DATABASE_URL=postgres://ljc:ljc@localhost:5432/ljc` e rode `npm run db:migrate` e `npm run db:seed`.

## 3. Docker Desktop — PENDENTE (opcional no computador)
Só é necessário para testar a imagem de produção localmente (o servidor de produção usa Docker — ver `docs/deploy.md`).
A instalação automática falhou na etapa de administrador. PowerShell **como Administrador**:
```
winget install -e --id Docker.DockerDesktop
```

## 4. Navegador do Playwright (testes E2E) — CONCLUÍDO (2026-11-05)

## Verificado neste computador
| Item | Situação |
|---|---|
| Node.js | v24.18 — OK |
| npm | 11.16 — OK |
| Git | OK |
| WSL2 + Ubuntu | OK |
| PostgreSQL (WSL) | 18.6 — OK |
| Docker | não instalado (opcional) |
