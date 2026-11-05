# Arquitetura — LJC SYSTEM

## Visão
Aplicação Next.js (App Router) única, organizada em módulos de domínio. Três "ambientes" por grupo de rotas:

| Grupo de rotas | Caminho | Acesso |
|---|---|---|
| `(public)` | `/`, `/servicos`, `/precos`, `/agendar`, `/contato`... | anônimo |
| `(cliente)` | `/cliente/*` | perfil CLIENTE |
| `(admin)` | `/admin/*` | ADMINISTRADOR, FUNCIONARIO, ATENDENTE (conforme permissão) |

## Camadas
```
src/app/            rotas, layouts, Server Actions e Route Handlers (finos)
src/modules/<dom>/  regras de negócio (serviços de domínio, schemas Zod, queries)
src/db/             schema Drizzle, cliente, migrations
src/lib/            utilitários transversais (auth, permissões, datas, logger, env)
src/components/     ui/ (design system) e componentes de composição
```
Regra: componentes e rotas **não** contêm regra de negócio; chamam serviços em `src/modules`. Toda operação protegida chama `requirePermission()` no servidor.

## Decisões (ADR resumido)
1. **Auth própria com sessões em banco** (padrão recomendado após a descontinuação do Lucia): token aleatório de 32 bytes no cookie `httpOnly`/`SameSite=Lax`/`Secure` (prod); no banco só o **hash SHA-256** do token. Senhas com **Argon2id** (`@node-rs/argon2`). Evita dependência pesada e dá controle total de permissões. Rate limit de login por e-mail+IP.
2. **Proteção CSRF**: Server Actions do Next já verificam Origin; Route Handlers mutáveis usam `assertSameOrigin()`.
3. **Banco**: PostgreSQL em produção/Docker. Em máquinas sem Docker, `DATABASE_URL=pglite://...` usa **PGlite** (Postgres real em WASM) para dev e testes. Limitação: PGlite é mono-conexão — testes de concorrência real exigem Postgres (pendência P-01).
4. **Dinheiro** em centavos (`integer`), nunca float. **Datas** em `timestamptz` (UTC) e exibidas em `America/Maceio`.
5. **Disponibilidade calculada no servidor**; o cliente só renderiza slots devolvidos pela API.
6. **Anti-conflito de agenda**: constraint de exclusão do Postgres (`EXCLUDE USING gist` com `tstzrange` por recurso, apenas para status ativos) + transação. É a garantia final, independente da aplicação.
7. **Snapshot de preço** na OS/agendamento (`price_cents` copiado).
8. **Auditoria** em `audit_logs` para operações sensíveis.
9. **PWA** na Fase 6 (sem offline para escrita).

## Permissões
Matriz central em `src/lib/permissions.ts` (perfil → permissões granulares `recurso:ação`). Cliente só acessa recursos próprios (verificação por `customerId` da sessão).

## Notas de desenvolvimento
- Em dev sem Docker, `DATABASE_URL=pglite://<caminho>` deve apontar para **fora** da pasta do projeto (ex.: `%LOCALAPPDATA%/ljc-system/pglite/dev`). Dentro do projeto, o Next.js detecta as gravações do PGlite e recarrega a página em loop.
