-- Apenas um caixa aberto por vez (garantia no banco, além da validação na aplicação).
CREATE UNIQUE INDEX "cash_registers_one_open" ON "cash_registers" ((1)) WHERE "closed_at" IS NULL;
