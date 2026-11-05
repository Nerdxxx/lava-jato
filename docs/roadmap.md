# Roadmap e status

| Fase | Status |
|---|---|
| 0 Arquitetura e docs | concluída |
| 1 Fundação | concluída |
| 2 Agendamento | concluída (restam pendências de ambiente e agendamento pelo balcão) |
| 3 Operação | concluída (pendências abaixo) |
| 4 Financeiro | próxima |
| 5–7 | não iniciadas |

## Fase 3 — entregue
- **Check-in** de agendamento confirmado → OS (idempotente; agendamento vira CONVERTIDO_EM_OS e, na entrega, CONCLUIDO). Preço contratado é snapshot.
- **Atendimento sem agendamento** (`/admin/os/nova`): cria cliente (por telefone), veículo e OS com a tabela vigente.
- **OS** (`/admin/os`, `/admin/os/[id]`): número sequencial (OS-00001), status com máquina de estados validada no servidor, histórico com usuário e hora, responsável, desconto autorizado (só ADMINISTRADOR), observações.
- **Checklist** gerado a partir do modelo do serviço; não deixa ir para inspeção/pronto com itens pendentes.
- **Fotos** privadas (fora de `/public`): só JPEG/PNG/WebP validados pelo conteúdo, até 10 MB, máx. 30 por OS, redimensionadas (1600 px), recomprimidas em WebP e sem EXIF/GPS. Entrega só a quem tem permissão e acesso à OS. Upload exige mesma origem (CSRF).
- **Fila Kanban** (`/admin/fila`): Agendados hoje, Recebidos, Aguardando, Em lavagem, Finalização, Prontos, Entregues hoje. Placa mascarada; nome do cliente só para quem tem `clientes:ver`. Atualiza sozinha a cada 10 s (polling).
- **Clientes** (`/admin/clientes`): busca por nome/telefone/placa/modelo, perfil 360° (dados, veículos, agendamentos, OS), edição, consentimento de marketing separado, cadastro de veículos.
- Visibilidade: FUNCIONARIO só vê OS atribuídas a ele ou sem responsável.
- 35 testes novos (total 73).

## Pendências da Fase 3
- Arrastar e soltar na fila (opcional no prompt; hoje são botões).
- Sincronização por polling; evoluir para SSE/WebSocket se necessário.
- Câmera: o campo usa `capture` do celular; não testado em aparelho real.
- Cadastro de funcionários (usuários da equipe) ainda não tem tela: criar via seed/banco. Necessário antes de usar atribuição com mais de uma pessoa.
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
