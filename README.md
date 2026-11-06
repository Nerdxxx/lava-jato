# LJC System — Lava Jato Capuã

Site e sistema de gestão do Lava Jato Capuã (Barra dos Coqueiros, SE).

**Para o cliente:** site com serviços e preços, agendamento online, consulta/cancelamento do agendamento, conta com acompanhamento da lavagem em tempo real, fotos, histórico e pontos de fidelidade. Instalável no celular (PWA).

**Para a equipe:** agenda (inclusive agendamento por telefone), check-in, ordens de serviço com checklist e fotos, fila, caixa, pagamentos (dividido, estorno), despesas, relatórios e exportação, estoque com baixa automática, fidelidade, mensagens prontas de WhatsApp, recibo, clientes e funcionários com permissões por perfil.

## Rodar no computador
```bash
npm install
cp .env.example .env        # sem Docker: use DATABASE_URL=pglite://C:/caminho/fora/do/projeto
npm run db:migrate
npm run db:seed             # catálogo inicial + administrador (SEED_ADMIN_* no .env)
npm run dev                 # http://localhost:3000
```

## Verificações
```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e            # requer: npx playwright install chromium
```

## Documentação
- `docs/architecture.md` — arquitetura e decisões
- `docs/business-rules.md` — regras de negócio
- `docs/database.md` — banco de dados
- `docs/roadmap.md` — o que foi entregue e evoluções
- `docs/testing.md` — testes
- `docs/deploy.md` — **como colocar no ar**
