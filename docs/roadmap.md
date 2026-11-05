# Roadmap e status

| Fase | Status |
|---|---|
| 0 Arquitetura e docs | concluída |
| 1 Fundação | concluída |
| 2 Agendamento | concluída (restam pendências de ambiente e agendamento pelo balcão) |
| 3 Operação | concluída (pendências abaixo) |
| 4 Financeiro | concluída (pendências abaixo) |
| 5 Estoque | próxima |
| 6–7 | não iniciadas |

## Fase 4 — entregue
- **Pagamentos** na OS (`/admin/os/[id]`): Dinheiro, Pix, débito, crédito e Outro; **pagamento dividido** (até 3 linhas por envio, tudo-ou-nada). Soma nunca ultrapassa o saldo; a linha da OS é travada (`FOR UPDATE`) contra recebimentos simultâneos; chave de idempotência contra reenvio.
- **Status financeiro** da OS (PENDENTE/PARCIAL/PAGO/ESTORNADO/CANCELADO) derivado dos pagamentos na mesma transação. **Entrega exige pagamento integral.** Cancelar OS com pagamento exige estorno antes; desconto não pode ficar abaixo do já pago.
- **Estorno** (só ADMINISTRADOR, com motivo): o pagamento nunca é apagado, fica ESTORNADO.
- **Caixa** (`/admin/caixa`, ADMINISTRADOR e ATENDENTE): abertura, suprimento, sangria, estorno em dinheiro, fechamento com esperado × contado × diferença (observação obrigatória se houver diferença). Um único caixa aberto (índice único parcial). Dinheiro só entra com caixa aberto; Pix/cartão não passam pelo caixa. Caixa fechado é imutável.
- **Despesas** (`/admin/despesas`) por categoria, pendente/paga/cancelada (cancelamento com motivo, nunca exclui).
- **Financeiro** (`/admin/financeiro`): recebido (regime de caixa), por meio, estornos, despesas por categoria, resultado, OS entregues, ticket médio e a receber. **Painel** (`/admin`) com indicadores do dia/mês conforme permissão.
- **Exportação** CSV (`;`, vírgula decimal, BOM) e XLSX de pagamentos e despesas por período, com neutralização de injeção de fórmula; registrada na auditoria.
- Permissões novas: `financeiro:estornar` (admin), `caixa:operar` e `financeiro:receber` (atendente também). `financeiro:ver` (relatórios, despesas, exportação) só admin.
- 19 testes novos (total 101).

## Pendências da Fase 4
- Recibo/comprovante imprimível e conciliação de cartão/Pix (taxas das operadoras não são modeladas).
- Despesas recorrentes e anexos de comprovante.
- Pagamento online (Pix/cartão por gateway) — fora do escopo até haver conta no provedor.
- Corrida real de recebimentos e abertura de caixa contra PostgreSQL (hoje só PGlite; ver `PENDENTE INSTALAÇÃO.md`).
- Troco: o valor em dinheiro registrado é o aplicado à OS (o troco é manual).

## Fase 3 — entregue
- **Check-in** de agendamento confirmado → OS (idempotente; agendamento vira CONVERTIDO_EM_OS e, na entrega, CONCLUIDO). Preço contratado é snapshot.
- **Atendimento sem agendamento** (`/admin/os/nova`): cria cliente (por telefone), veículo e OS com a tabela vigente.
- **OS** (`/admin/os`, `/admin/os/[id]`): número sequencial (OS-00001), status com máquina de estados validada no servidor, histórico com usuário e hora, responsável, desconto autorizado (só ADMINISTRADOR), observações.
- **Checklist** gerado a partir do modelo do serviço; não deixa ir para inspeção/pronto com itens pendentes.
- **Fotos** privadas (fora de `/public`): só JPEG/PNG/WebP validados pelo conteúdo, até 10 MB, máx. 30 por OS, redimensionadas (1600 px), recomprimidas em WebP e sem EXIF/GPS. Entrega só a quem tem permissão e acesso à OS. Upload exige mesma origem (CSRF).
- **Fila Kanban** (`/admin/fila`): Agendados hoje, Recebidos, Aguardando, Em lavagem, Finalização, Prontos, Entregues hoje. Placa mascarada; nome do cliente só para quem tem `clientes:ver`. Atualiza sozinha a cada 10 s (polling).
- **Clientes** (`/admin/clientes`): busca por nome/telefone/placa/modelo, perfil 360° (dados, veículos, agendamentos, OS), edição, consentimento de marketing separado, cadastro de veículos.
- Visibilidade: FUNCIONARIO só vê OS atribuídas a ele ou sem responsável.
- **Funcionários** (`/admin/funcionarios`, só ADMINISTRADOR): cadastro, perfil, ativar/desativar, redefinir senha. Não deixa ficar sem administrador ativo nem o admin se desativar/rebaixar; mudar perfil, desativar ou redefinir senha encerra as sessões do usuário. **Minha conta** (`/admin/conta`): troca da própria senha (exige a atual; encerra as outras sessões).
- 44 testes novos (total 82).

## Pendências da Fase 3
- Arrastar e soltar na fila (opcional no prompt; hoje são botões).
- Sincronização por polling; evoluir para SSE/WebSocket se necessário.
- Câmera: o campo usa `capture` do celular; não testado em aparelho real.
- Tela de edição de checklist por serviço (modelos só via seed).
- Estoque: baixa automática por OS é da Fase 5.
- Fotos autorizadas no perfil do cliente (Fase 6).

## Pendências da Fase 2
- Agendamento criado pela equipe (por telefone) no painel — hoje só atendimento sem agendamento (OS direta).
- Concorrência real contra PostgreSQL (precisa Docker — ver `PENDENTE INSTALAÇÃO.md`).
- E2E com Playwright (depende do navegador do Playwright).
- Rate limit em memória (1 instância).
- Valores provisórios a confirmar: expediente seg–sáb 8–18h, duração 40/70 min, 1 vaga, preparação 10 min, passo 30 min, cancelamento até 2h antes (todos editáveis em Configurações).

## Pendências da Fase 1
Recuperação de senha, login/cadastro de cliente, CI, PWA, tema escuro.
