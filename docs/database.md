# Banco de dados

Implementado (Fases 1–2) em `src/db/schema/`:
`users`, `sessions`, `customers`, `vehicles`, `services`, `service_prices`, `business_settings`, `operating_hours`, `resources`, `schedule_blocks`, `appointments`, `appointment_history`, `audit_logs`, `login_attempts`.

Fases 3–4: `work_orders` (com `financial_status`), `work_order_status_history`, `work_order_checklist_items`, `service_checklist_templates`, `work_order_photos`, `payments`, `cash_registers`, `cash_movements`, `expense_categories`, `expenses`.

Fases 5–7: `inventory_items`, `inventory_movements`, `service_consumption_rules`, `loyalty_transactions`, `notifications`, `password_reset_tokens` (migration `0005_growth`). Configurações de fidelidade e dados do negócio ficam em `business_settings` (chaves `loyalty` e `business_profile`).

## Integridade
- `cash_registers`: índice único parcial `cash_registers_one_open` — só um caixa com `closed_at IS NULL`. `payments.idempotency_key` único; `amount_cents > 0`.
- Dinheiro em centavos, `CHECK (>= 0)`.
- `appointments`: `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('PENDENTE','CONFIRMADO'))` — impede sobreposição na mesma vaga.
- `users.email` único (lowercase); `customers.phone` único normalizado (E.164 sem símbolos).
- Históricos (`appointment_history`, auditoria) são append-only; registros financeiros nunca são apagados por desativação de usuário (`users.active=false`).
- Preço contratado copiado em `appointments.price_cents`.
- `inventory_movements`: índice único parcial (item, OS) para `CONSUMO_OS` — baixa automática nunca duplica. Saldo do item = soma dos deltas.
- `service_consumption_rules`: uma regra por (serviço, produto, categoria) e uma regra geral (categoria nula) por (serviço, produto).
- `loyalty_transactions`: append-only; índice único parcial por OS para `GANHO`. Saldo = soma de `points`.
- `password_reset_tokens`: só o hash SHA-256 do token; uso único (`used_at`) e expiração.
