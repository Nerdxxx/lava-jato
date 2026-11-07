# Regras de negócio

## Agendamento
- Duração do bloco = duração do serviço para a categoria + duração dos adicionais contratados + intervalo operacional (configurável).
- Durações propostas por veículo são parâmetros de referência; a configuração ativa é a cadastrada no banco e pode ser auditada separadamente antes de qualquer atualização.
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
Tabela de referência (editável, em centavos): Moto externa 3000; Pequeno 4000/6000; Médio 4000/7000; SUV 6000/9000; Picape 6000/10000. Moto não tem lavagem completa. O site mostra a moto em card próprio; o "a partir de" dos serviços de carro ignora o preço da moto.

### Adicionais
- Cera R$ 20 e remoção de manchas de chuva ácida dos vidros R$ 40 (padrão: ativos, só para carros); preço e duração ficam em `business_settings.addons` e são congelados na reserva.
- O cliente envia só os identificadores; o servidor recusa adicional inexistente, inativo ou de outra categoria e soma o preço vigente. Preço do agendamento = serviço + adicionais, congelado (reagendar e check-in preservam).
- Não há promessa de remoção total de manchas. Serviços não anunciados (polimento, vitrificação etc.) não são cadastrados.

## Financeiro (Fase 4)
- Valor a cobrar = preço contratado (snapshot) − desconto autorizado. Valores em centavos.
- Pagamento: valor > 0 e ≤ saldo. Dinheiro exige caixa aberto. Estorno só por administrador, com motivo; nada é apagado.
- A OS só é entregue com status financeiro PAGO. OS com pagamento não é cancelada sem estorno.
- Caixa: esperado = abertura + dinheiro recebido + suprimentos − sangrias − estornos em dinheiro. Sangria não excede o saldo. Fechamento é imutável.
- Resultado = recebido (regime de caixa) − despesas do período (pagas e pendentes, exceto canceladas).

## Estoque (Fase 5)
- Quantidades inteiras na menor unidade controlada (ml, g, un). Saída manual exige motivo e não deixa saldo negativo; ajuste informa a quantidade contada e exige motivo.
- Na entrega da OS, o estoque baixa conforme as regras do serviço (regra da categoria substitui a geral). OS cancelada não consome.
- Nível: OK, Baixo (≤ mínimo), Zerado, Negativo (consumo automático acima do saldo — conferir cadastro).

## Fidelidade (Fase 6)
- Desativada por padrão. Cada OS entregue com valor > 0 e sem resgate gera 1 ponto.
- Resgate: exige saldo ≥ pontos necessários; desconto = % do preço do serviço, limitado ao valor restante; não pode deixar o valor abaixo do já pago. Um resgate ativo por OS.
- Desfazer resgate (OS aberta) devolve pontos e remove o desconto; cancelar a OS devolve os pontos.

## Portal do cliente (Fase 6)
- Cliente só vê os próprios dados (filtro pelo cliente vinculado à sessão), inclusive fotos.
- Vincular conta a um cadastro existente exige o código de um agendamento desse cliente, ou link gerado pela equipe.

## Perfis
ADMINISTRADOR (tudo), FUNCIONARIO (agenda, fila, OS atribuídas, checklist, fotos), ATENDENTE (agenda, clientes, veículos, check-in, recebimentos se autorizado), CLIENTE (somente próprios dados).
