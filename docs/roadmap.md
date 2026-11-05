# Roadmap e status

| Fase | Status |
|---|---|
| 0 Arquitetura e docs | concluída |
| 1 Fundação | concluída |
| 2 Agendamento | núcleo e telas concluídos; faltam telas de configuração (ver abaixo) |
| 3–7 | não iniciadas |

## Fase 2 — entregue
- Motor de disponibilidade no servidor (função pura `computeSlots` + carregamento do banco): expediente com pausas, feriados, bloqueios, vagas, duração + preparação, antecedência mínima/máxima.
- Reserva transacional com constraint `appointments_no_overlap` (garantia final contra corrida); tenta a próxima vaga livre.
- Máquina de estados do agendamento + histórico (`appointment_history`).
- Cancelamento e reagendamento pelo cliente (código + WhatsApp, prazo configurável); reagendar cria novo registro vinculado e preserva preço e histórico.
- Site: `/agendar` (assistente em 5 etapas), `/agendar/confirmado`, `/agendamento` (consulta/cancelar/reagendar), `/api/disponibilidade`.
- Admin: `/admin/agenda` (dia, confirmar, não compareceu, cancelar; exige permissão `agenda:gerir`, auditado).
- Limite de requisições nos endpoints públicos (em memória).
- 30 testes de agendamento (inclui disputa pelo último horário).

## Pendências da Fase 2
- Telas de **configuração** (horários, pausas, feriados, bloqueios, preços, regras de agendamento): hoje esses dados só mudam via banco/seed. Os dados e o motor já suportam.
- Agendamento criado pela equipe (balcão/telefone) no painel.
- Concorrência real contra PostgreSQL (precisa Docker — ver `PENDENTE INSTALAÇÃO.md`). Em PGlite a conexão é única, então o teste atual não prova paralelismo verdadeiro.
- E2E com Playwright (depende do navegador do Playwright).
- Rate limit é em memória (1 instância); trocar por armazenamento compartilhado em produção.
- Valores provisórios a confirmar com o negócio: expediente seg–sáb 8–18h, duração 40/70 min, 1 vaga, preparação 10 min, passo 30 min, cancelamento até 2h antes.

## Pendências da Fase 1
Recuperação de senha, cadastro de cliente/login do cliente, CI, PWA, tema escuro.
