# Banco de dados

Implementado (Fases 1–2) em `src/db/schema/`:
`users`, `sessions`, `customers`, `vehicles`, `services`, `service_prices`, `business_settings`, `operating_hours`, `resources`, `schedule_blocks`, `appointments`, `appointment_history`, `audit_logs`, `login_attempts`.

Fases 3–4: `work_orders` (com `financial_status`), `work_order_status_history`, `work_order_checklist_items`, `service_checklist_templates`, `work_order_photos`, `payments`, `cash_registers`, `cash_movements`, `expense_categories`, `expenses`.

Planejado (Fases 5–7): `inventory_items`, `inventory_movements`, `service_consumption_rules`, `loyalty_programs`, `loyalty_transactions`, `loyalty_redemptions`, `notifications`, `notification_attempts`, `customer_consents`.

## Integridade
- `cash_registers`: índice único parcial `cash_registers_one_open` — só um caixa com `closed_at IS NULL`. `payments.idempotency_key` único; `amount_cents > 0`.
- Dinheiro em centavos, `CHECK (>= 0)`.
- `appointments`: `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('PENDENTE','CONFIRMADO'))` — impede sobreposição na mesma vaga.
- `users.email` único (lowercase); `customers.phone` único normalizado (E.164 sem símbolos).
- Históricos (`appointment_history`, auditoria) são append-only; registros financeiros nunca são apagados por desativação de usuário (`users.active=false`).
- Preço contratado copiado em `appointments.price_cents`.
