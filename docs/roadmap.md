# Roadmap e status

| Fase | Status |
|---|---|
| 0 Arquitetura e docs | concluída |
| 1 Fundação | concluída (pendências de ambiente abaixo) |
| 2 Agendamento | próxima |
| 3–7 | não iniciadas |

## Fase 1 — entregue
Next.js 16 + TS estrito + Tailwind 4; schema Drizzle (identidade, catálogo, agenda) com migrations e constraint anti-sobreposição; auth com Argon2id, sessões em banco (token hasheado), rate limit de login, matriz de permissões; layouts público/cliente/admin; design system básico (Button, Input, Card, Badge, EmptyState); seed do catálogo; testes Vitest.

## Pendências
Ver `PENDENTE INSTALAÇÃO.md` (WSL, Docker, navegador do Playwright).
- Testes de concorrência real e E2E rodam depois dessas instalações.
- Horário de funcionamento do seed (seg–sáb 08–18h), duração dos serviços (40/70 min) e 1 vaga são **valores provisórios**: confirmar com o negócio.
- Fase 1 ainda não tem: CSRF explícito em Route Handlers (não há ainda), recuperação de senha, cadastro de cliente, CI (GitHub Actions), PWA, tema escuro opcional.
