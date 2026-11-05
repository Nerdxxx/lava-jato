# Regras de negócio

## Agendamento
- Duração do bloco = duração do serviço + tempo de preparação (configurável).
- Slot válido: dentro do expediente do dia, fora de pausas/feriados/bloqueios, respeitando antecedência mínima/máxima, e com recurso (vaga) livre.
- Slots são gerados em intervalos configuráveis (`slot_step_minutes`).
- Reserva ocorre em transação; a constraint de exclusão rejeita a segunda reserva simultânea.
- Datas passadas e fora do expediente são rejeitadas no servidor.
- Cancelamento/reagendamento só até o prazo configurado (horas antes). Reagendar = novo registro vinculado + antigo `REAGENDADO`; histórico preservado.

### Máquina de estados do agendamento
```
PENDENTE   -> CONFIRMADO | CANCELADO | REAGENDADO
CONFIRMADO -> CANCELADO | REAGENDADO | NAO_COMPARECEU | CONVERTIDO_EM_OS
CONVERTIDO_EM_OS -> CONCLUIDO
(terminais: CANCELADO, REAGENDADO, NAO_COMPARECEU, CONCLUIDO)
```
Status que ocupam vaga: PENDENTE, CONFIRMADO, CONVERTIDO_EM_OS.

## Catálogo
Tabela inicial (editável, em centavos): Moto externa 2000; Pequeno 4000/6000; Médio 4000/7000; SUV 6000/9000; Picape 6000/10000. Moto não tem lavagem completa. Serviços não anunciados (polimento, vitrificação etc.) não são cadastrados.

## OS, financeiro, estoque, fidelidade
Definidos no PROMPT MESTRE; detalhados aqui ao serem implementados (Fases 3–5, 6).

## Perfis
ADMINISTRADOR (tudo), FUNCIONARIO (agenda, fila, OS atribuídas, checklist, fotos), ATENDENTE (agenda, clientes, veículos, check-in, recebimentos se autorizado), CLIENTE (somente próprios dados).
