# Roadmap e status

| Fase | Status |
|---|---|
| 0 Arquitetura e docs | concluída |
| 1 Fundação | concluída |
| 2 Agendamento | concluída |
| 3 Operação | concluída |
| 4 Financeiro | concluída |
| 5 Estoque | concluída |
| 6 Cliente, fidelidade e PWA | concluída |
| 7 Notificações, site público e produção | concluída |
| 8 Redesign do site público e adicionais | concluída |

## Fase 8 — entregue (redesign)
- **Site público redesenhado** (`src/components/site/*`): cabeçalho fixo com menu lateral no celular (foco preso, Esc fecha), hero azul-marinho com a logo oficial, vantagens, cards de serviço com preço/duração do banco (moto em card próprio), seção de adicionais, tabela de preços (tabela no computador, cards no celular), "Como funciona" em 4 etapas, espaço de fotos reais (estado vazio até haver fotos), horários com **aberto agora** (fuso de Maceió e feriados), localização/contato e rodapé completo. Barra inferior de agendamento no celular.
- **Páginas novas**: `/privacidade` e `/termos`. Metadados de SEO local, imagem de compartilhamento `public/og.png` (`scripts/og-image.ts`) e dados estruturados `AutoWash`.
- **Adicionais** (cera R$ 20, chuva ácida nos vidros R$ 40): editáveis em Configurações → Serviços adicionais; etapa própria no agendamento; total somado **no servidor** e gravado como snapshot no agendamento e na OS (migration `0006_addons`). Aparecem na agenda, na OS e no recibo.
- **Agendamento**: barra de progresso, cards de seleção, resumo com total, carregamento em esqueleto, link com veículo/serviço pré-selecionados (`/agendar?categoria=...&servico=...`).
- **Preços**: moto externa passou a R$ 30. `scripts/precos.ts` compara o banco com a tabela de referência e só grava com `--aplicar` (fica na auditoria). Descrição curta do serviço agora é editável no painel.
- **Continuidade UX e agenda**: prévia compacta de preços logo após o hero; inclusos recolhidos; duração por serviço/categoria e por adicional editável no painel; duração total validada na disponibilidade e na reserva; duração do adicional preservada no snapshot; horários até o fechamento consideram todo o bloco reservado; itens de lavagem de moto são descritos separadamente.

## Pendências da Fase 8
- Galeria: sem cadastro de fotos pelo painel ainda; o componente `GallerySection` já aceita a lista de fotos.
- Mapa incorporado: não exibido porque não há coordenadas confirmadas; o botão "Como chegar" usa o link do Google Maps cadastrado.
- Os tempos atuais do banco continuam 40 min (externa) e 70 min (completa) em todas as categorias. A auditoria confirmou os preços, mas encontrou 9 tempos diferentes dos valores de referência; revise a operação antes de aplicar `--aplicar-duracoes`.

## Fase 7 — entregue
- **WhatsApp** (link `wa.me`, sem API paga): mensagens padrão geradas no servidor — veículo recebido, pronto para retirada, agradecimento (OS) e confirmação/lembrete (agenda). Cada envio fica registrado em `notifications`.
- **Dados do negócio** em Configurações (nome, WhatsApp, endereço, mapa, Instagram, chave Pix) usados no site, recibo e mensagens.
- **Site público**: início com serviços, "como funciona", horários e localização; página **Contato**; botão flutuante do WhatsApp; robots.txt e sitemap.xml.
- **Recibo imprimível** da OS (`/admin/os/[id]/recibo`, imprimir ou salvar PDF).
- **Agendamento pelo balcão** (`/admin/agenda/novo`): a equipe agenda por telefone e o horário já entra confirmado.
- **Produção**: `Dockerfile`, `docker-compose.yml` (perfil `prod` com app + Postgres), CI no GitHub Actions (lint, typecheck, testes, testes contra Postgres real, build e E2E). Guia em `docs/deploy.md`.
- **P-01 resolvida**: `tests/postgres-concurrency.test.ts` roda contra PostgreSQL real (reservas, caixa, recebimentos, estoque e resgate simultâneos). Encontrou e corrigiu uma corrida no resgate de fidelidade (agora trava o cliente).

## Fase 6 — entregue
- **Portal do cliente** (`/cliente`): andamento da lavagem em tempo real (etapas), fotos das próprias OS, próximos agendamentos, histórico, veículos e fidelidade. `/cliente/conta`: nome, consentimento de marketing e troca de senha.
- **Cadastro** (`/cadastro`): cliente novo cria conta; cliente já atendido só vincula o cadastro existente com o código de um agendamento dele (prova de posse). Sem o código, a equipe gera um **link de acesso** no perfil do cliente.
- **Redefinição de senha** por link de uso único (48 h, só o hash no banco, encerra as sessões). "Esqueci minha senha" orienta a pedir o link pelo WhatsApp (não há provedor de e-mail).
- **Fidelidade** (`/admin/fidelidade`): cada OS entregue e paga = 1 ponto; com N pontos o atendente aplica o prêmio (% do serviço, 100% = grátis) na OS. OS do resgate não pontua; cancelamento devolve os pontos; ajuste manual (admin) com motivo. Extrato append-only.
- **PWA**: manifesto, ícones, service worker (somente rede para dados; cache só de arquivos estáticos; página offline).

## Fase 5 — entregue
- **Estoque** (`/admin/estoque`, ADMINISTRADOR): produtos com unidade e estoque mínimo; entrada, saída (com motivo, nunca negativa) e ajuste por contagem; histórico append-only com saldo após cada movimento.
- **Consumo por serviço**: regras serviço × produto (geral ou por categoria; a específica vence). **Baixa automática na entrega da OS**, na mesma transação, idempotente (índice único item+OS). Consumo automático pode negativar o saldo, sinalizado como "Negativo — conferir".
- Alertas de reposição na tela de estoque e no painel inicial.

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
- Conciliação de cartão/Pix (taxas das operadoras não são modeladas).
- Despesas recorrentes e anexos de comprovante.
- Pagamento online (Pix/cartão por gateway) — fora do escopo até haver conta no provedor.
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
- Arrastar e soltar na fila (opcional; hoje são botões).
- Sincronização por polling; evoluir para SSE/WebSocket se necessário.
- Câmera: o campo usa `capture` do celular; testar em aparelho real.
- Tela de edição de checklist por serviço (modelos só via seed).

## Pendências da Fase 2
- Rate limit em memória (1 instância). Com várias instâncias, trocar por armazenamento compartilhado.
- Valores provisórios a confirmar: expediente seg–sáb 8–18h, duração 40/70 min, 1 vaga, preparação 10 min, passo 30 min, cancelamento até 2h antes (todos editáveis em Configurações).

## Fora do escopo / evolução
- Envio automático de WhatsApp/e-mail (exige conta na API oficial do WhatsApp Business ou provedor de e-mail). Hoje o envio é por link, conferido pela equipe.
- Tema escuro.
