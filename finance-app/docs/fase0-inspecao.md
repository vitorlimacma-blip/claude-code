# Fase 0 — Inspeção e plano

Data: 2026-10-19. Base: branch `claude/finance-ai-app-e6keyb`, commit `01b4153`.
Referências: `docs/briefing-produto.md` (especificação) e `docs/roteiro-fases.md`
(ordem e paradas). Decisões ficam em `docs/decisoes.md`.

## 1. Inventário (briefing §2.1)

| Área | Situação atual |
|---|---|
| Instruções do repositório | `CLAUDE.md` → `AGENTS.md`, com convenções. `docs/ARQUITETURA.md` traz o histórico das etapas 0 e 1. |
| Plataforma | Expo SDK 58, React Native 0.88, React 19.3, TypeScript. Roda no navegador (prioridade de uso atual) e no Expo Go. |
| Navegação | expo-router. Abas: Resumo, Lançamentos, Assistente, Categorias e Ajustes. A tela Previsões está oculta das abas. Modais: lançamento, categoria e conta. Telas empilhadas: Contas e Configuração da IA. Menu lateral em telas largas. |
| Armazenamento | SQLite local (expo-sqlite) via Drizzle em modo assíncrono, com migrações versionadas (`drizzle/`) e importação do esquema anterior. UUIDs, `created_at`/`updated_at` e exclusão lógica. Escritas serializadas (`ctx.write`) e barramento de mudanças. |
| Segredos | Chaves de IA no Keychain/Keystore (expo-secure-store). Na web, ficam no `localStorage`, como limitação documentada. |
| Modelo financeiro | `src/domain/types.ts`: Account, Category (2 níveis), Budget e Transaction. Valores em centavos inteiros. Detalhes na seção 3. |
| IA | `src/ai/`: contrato `AIProvider`, adaptadores Claude e OpenAI pelos SDKs oficiais, categorizador local (regras + Naive Bayes) com fallback para LLM, e assistente com 6 ferramentas locais somente leitura. Sem backend. O usuário fornece a chave. |
| Componentes e estilos | `src/ui/components.tsx` (Screen, Card, Chip, Button, Fab, TextField, SegmentedControl, IconBubble, RemovableChip…), `src/ui/filters/` (painel de filtros), `src/ui/theme.ts` (tokens próprios, primária azul) e `RichText`. Ícones Ionicons. Fonte do sistema. Sem Reanimated em uso. |
| Testes | Jest com 17 suítes e 108 testes: domínio, repositórios contra SQLite real (`node:sqlite`), provedores de IA com HTTP simulado, categorizador e ferramentas do assistente. Não há testes de UI no repositório; testes de navegador (Playwright) foram rodados só fora dele, de forma pontual. |
| Verificação de base | Executados nesta fase: `npx jest` (108 testes passando), `npx tsc --noEmit` (sem erros) e `npx expo lint` (sem erros). |

## 2. Alterações locais do usuário (briefing §2.2)

- `git status` sem alterações locais. O branch remoto não tem commits além dos locais.
- Os dados do usuário existem apenas nos aparelhos/navegadores (SQLite local). Não há
  cópia no repositório. Toda migração precisa ser segura para esses bancos (ver Fase 1).

## 3. Como os dados representam cada conceito hoje (briefing §2.3)

| Conceito | Representação atual |
|---|---|
| Instituição | `accounts.institution`: slug de um catálogo fixo (`src/domain/institutions.ts`). |
| Conta/carteira | Tabela `accounts`: `type` ∈ corrente, poupança, carteira, cartão de crédito, investimento e outra; `initial_balance`. |
| Cartão | Conta com `type = credit_card`, `credit_limit`, `closing_day` e `due_day`. Sem vínculo com a conta que paga a fatura. |
| Natureza | `transactions.type` ∈ expense, income, transfer_out e transfer_in. Não há natureza para estorno, aporte, resgate, rendimento, pagamento de fatura ou ajuste. |
| Forma de pagamento | `payment_method` ∈ pix, boleto, débito, crédito, dinheiro, TED e outro. Independente da conta e sem validação cruzada: é possível "crédito" numa conta corrente. |
| Categoria | `categories` com 2 níveis e `kind` despesa/receita. 14 categorias principais de despesa e cerca de 70 no total. Exclusão lógica, sem arquivar, reordenar ou consolidar. |
| Situação | `status` cleared/pending, **sem uso em nenhum cálculo**. |
| Datas | Só `date`. `invoice_month` existe, mas não é preenchido nem usado. Não há competência, vencimento ou liquidação. |
| Parcelas | Colunas `installment_group_id/number/total`, **sem fluxo de criação nem cálculo**. |
| Transferência | Par de linhas `transfer_out`/`transfer_in` ligadas por `transfer_pair_id`. Fica fora de receita e despesa. |
| Pagamento de fatura | Hoje é uma transferência comum da conta corrente para o cartão. No resultado, não duplica a despesa, mas não é identificado como "pagamento de fatura". |
| Receitas/despesas | `type` income/expense. Rendimentos de investimento e reembolsos entram como **receita comum**. |
| Moeda | Não existe campo de moeda. Tudo é tratado como BRL implicitamente. |

## 4. Duplicações de cálculo e inconsistências entre telas (briefing §2.4)

Somatórios de dinheiro aparecem em cinco lugares diferentes, cada um com seu critério:

1. `src/domain/overview.ts` e `forecast.ts`: Resumo, Previsões e alertas de orçamento.
2. `src/domain/transactionFilters.ts` (`summarizeTransactions`): total da lista filtrada.
3. `src/ai/assistant/tools.ts`: o assistente refaz somas próprias em `resumo_periodo`, `gastos_por_mes`, `buscar_lancamentos` e `orcamentos_do_mes`.
4. `src/data/repositories/accounts.ts` (`balances`): saldo calculado em SQL.
5. `app/(tabs)/index.tsx`: "Saldo nas contas" soma na tela os saldos de todas as contas.

Inconsistências encontradas:

- **"Saldo nas contas"** soma corrente, carteira, **investimentos** e a **dívida do cartão**
  num número só. Não é saldo disponível e mistura patrimônio com liquidez.
- **Saldo das contas** inclui lançamentos `pending` e ignora `status`.
- **Receitas do mês** incluem rendimento de investimento e reembolsos. O resultado do mês
  fica inflado (§9: valorização não é receita disponível; estorno precisa de tratamento
  explícito).
- **Projeção** é linear ("run-rate") sobre o gasto até o dia. Com despesas concentradas
  (aluguel no dia 5), ela superestima o mês. A projeção anual pode ficar menor que a mensal.
  Isso contradiz o §10.
- **Alertas de orçamento** usam a mesma extrapolação linear.
- **Comparações** não existem ainda. A proposta de Resumo com gráficos (ainda não aprovada)
  previa comparar períodos equivalentes, o que é compatível com o §10.
- **Conversão de valor digitado** usa `Number()` com ponto flutuante antes de arredondar
  para centavos. Funciona para 2 casas, mas viola a orientação de evitar ponto flutuante.
- **Logs:** `DataProvider` faz `console.error(err)` de erros do banco. Erros do Drizzle
  podem conter a consulta e os parâmetros, com descrições e valores. Isso contradiz o §12
  (dados sensíveis em logs).
- **Assistente:** as ferramentas devolvem totais e linhas **sem identificadores** dos
  lançamentos e sem as premissas. As descrições dos lançamentos vão ao modelo sem
  delimitação como dado (risco de instrução embutida, §11).

## 5. Comparação com o briefing

### Já atende (preservar)
- Centavos inteiros em todo o armazenamento e nos cálculos de domínio.
- Transferência própria fora de receita e despesa. Compra no cartão + pagamento da fatura
  (como transferência) sem despesa duplicada.
- Limite do cartão não usado como saldo.
- Saldo inicial guardado na conta, sem virar receita.
- Migrações versionadas, idempotentes e testadas, com importação dos dados da 1ª versão
  preservando registros.
- Camada de domínio pura e testada. Repositórios como único acesso aos dados.
- IA desacoplada por contrato. Funciona sem IA (categorização local). O assistente calcula
  por ferramentas determinísticas somente leitura e não executa SQL do modelo. Os segredos
  ficam fora do banco.
- Origem da categorização registrada (`category_source`), base para aprender com correções.
- Filtros combináveis (categoria, forma de pagamento, conta) reutilizáveis.
- Dados fictícios claramente identificados e removíveis.

### Contradiz o §9 (ou §10–§12)
1. Natureza insuficiente: aporte, resgate, rendimento, estorno, pagamento de fatura e
   ajuste de saldo não têm natureza própria. Rendimento e reembolso viram receita.
2. Estornos não vinculados à origem.
3. Datas: só data da compra. Sem competência, vencimento ou liquidação. `invoice_month`
   não é usado.
4. Situação (`status`) ignorada nos saldos.
5. "Saldo nas contas" mistura liquidez, investimento e dívida.
6. Sem moeda explícita.
7. Instrumento de cartão sem vínculo com a conta pagadora. Forma de pagamento sem
   coerência com o tipo de conta.
8. Parcelas sem criação nem arredondamento que preserve o total.
9. Cálculos espalhados (cinco lugares), sem uma camada central única.
10. Projeção ingênua (§10). Logs com possíveis dados sensíveis (§12). Assistente sem
    rastreabilidade (§11).

### Falta
- Backup automático antes de migrar, exportação e restauração (§12, roteiro da Fase 1).
- Design system Maré Clara: tokens, tipografia Manrope/Inter, Lucide, movimento,
  acessibilidade validada e componentes (§4–6).
- Lançamentos agrupados por dia, busca, filtro por natureza e período, desfazer,
  autocomplete e prevenção de envio duplicado (§7–8).
- Categorias enxutas, com arquivar, reordenar e consolidar (§7).
- Recorrências, compromissos, margem até o próximo recebimento, menor saldo previsto e
  memória de cálculo (§10).
- Pipeline do assistente com validação, identificadores, prévia e desfazer (§11).
- Preferências visuais e de acessibilidade, privacidade da IA e notificações em Ajustes (§7).
- Onboarding curto (§13). Interfaces preparadas para Open Finance (§14).

## 6. Plano das fases seguintes

Tamanhos: **P** (até ~5 arquivos), **M** (~5–15 arquivos), **G** (15+ arquivos ou migração
de dados). Cada fase termina com testes, commit, resumo no formato do §18 e parada.

### Fase 1 — Domínio financeiro (sem mudança visual) · G
1. **Backup antes de migrar.** Antes de aplicar qualquer migração pendente, gravar um
   instantâneo completo (todas as tabelas, inclusive excluídas logicamente) num **arquivo
   SQLite separado** (`finance-backup.db`). A mesma API do expo-sqlite funciona no iPhone,
   no Android e na web. Restauração a partir do instantâneo, testada.
2. **Migração 0001**, aditiva e idempotente:
   - `transactions.nature`: despesa, receita, transferência, pagamento de fatura, aporte,
     resgate, rendimento, estorno e ajuste;
   - datas de competência, vencimento e liquidação;
   - `refund_of_id`, para vincular o estorno à origem;
   - `currency` (padrão BRL) em contas e lançamentos;
   - `payment_account_id` no cartão.

   A natureza dos registros existentes é inferida por regras conservadoras e
   documentadas. Exemplos: transferência para cartão vira pagamento de fatura;
   transferência para conta de investimento vira aporte. O `type` original é mantido, o
   que permite reverter.
3. **`src/domain/ledger.ts`**, ponto único de classificação e somatórios: realizado,
   receitas, despesas, saldo por conta (elegível × investimento × dívida de cartão) e total
   filtrado. Resumo, filtros, alertas, assistente e saldos passam a usá-lo, sem mudar o
   visual.
4. **Cartão:** fatura calculada por fechamento e vencimento, com competência da compra.
   **Parcelas:** divisão com resto distribuído preservando o total, linhas vinculadas e
   política de orçamento por parcela.
5. **Precisão:** conversão de valor digitado por string, sem ponto flutuante. Datas e fuso
   explícitos (America/Sao_Paulo como padrão).
6. **Exportação e restauração** completas em JSON versionado, com validação e backup
   automático antes de restaurar.
7. **Logs** sem dados financeiros: mensagens de erro saneadas.
8. **Testes:** todos os casos do §16 que dependem do domínio:
   - transferência e pagamento de fatura;
   - parcelas;
   - estorno;
   - aporte;
   - troca de categoria;
   - datas e fuso;
   - migração que preserva registros;
   - falha ao salvar sem duplicação (gravação idempotente por id gerado no cliente).

### Fase 2 — Design system Maré Clara · M–G
- Tokens claro e escuro do §5, com complementares (borda, foco, pressionado, gráficos) e
  preferência de tema (sistema, claro ou escuro).
- Manrope e Inter via `expo-font` (licença SIL OFL, uso comercial permitido), só nos pesos
  necessários e com numerais tabulares. Lucide (`lucide-react-native`, licença ISC) no
  lugar de Ionicons. A compatibilidade com Expo Go e web será verificada antes de adotar.
- Escala tipográfica, espaçamentos, raios e tokens de movimento com Reanimated (já
  instalado), respeitando Reduce Motion. Háptica via `expo-haptics` (já instalado).
- Componentes do §5: Screen, Section, FinancialAmount, Button, IconButton, Surface,
  TransactionRow, AccountSelector, CategoryChip, BudgetProgress, InsightCard,
  ProjectionCard, EmptyState, ErrorState, BottomSheet, Toast, Skeleton e MoneyInput.
- Tela interna de catálogo (rota oculta), nos dois temas.
- Teste automático de contraste das combinações usadas, incluindo opacidade.

### Fase 3 — Lançamentos, Categorias e Ajustes · G
- **Lista agrupada por dia** com busca discreta e filtros por período, conta, categoria e
  natureza, com total filtrado. Reaproveita os filtros atuais.
- **Lançamentos especiais reconhecíveis na lista:** transferência, estorno, parcela "3/10"
  e pagamento de fatura.
- **Entrada rápida:**
  - ordem: valor, descrição com autocomplete, conta/forma sugerida, categoria sugerida,
    salvar;
  - despesa, receita e transferência separadas;
  - detalhes progressivos;
  - proteção contra duplo envio;
  - toast com desfazer.
- **Categorias:** conjunto enxuto (8–12 de despesa) para instalações novas. As existentes
  ficam preservadas, com ferramentas para arquivar, reordenar e consolidar sem perder
  histórico.
- **Ajustes:** tema, acessibilidade, privacidade e comportamento da IA,
  exportação/backup/restauração e gerenciamento seguro de dados.
- **Navegação:** Categorias passa a ficar dentro de Ajustes, ainda acessível.

### Fase 4 — Resumo, orçamento e projeções · G
- **Recorrências:** receitas e despesas previstas, com conciliação contra o realizado para
  não contar em dobro.
- **Projeção** (domínio, testada), separando realizado, comprometido, estimado e
  disponível:
  - margem até o próximo recebimento;
  - menor saldo previsto no período;
  - estimativa variável que não extrapola gastos concentrados;
  - memória de cálculo;
  - fallback quando faltar dado.
- **Resumo:** uma informação principal por vez, um gráfico pequeno (realizado × previsto)
  e poucos insights acionáveis.
- **Orçamentos:** os que pedem atenção, em tom neutro.
- **Períodos equivalentes** nas comparações.

### Fase 5 — Assistente · M
- **Pipeline:** intenção → consulta autorizada (ferramentas existentes, ampliadas) →
  cálculo pelo `ledger` → validação → explicação.
- **Rastreabilidade:** as ferramentas devolvem identificadores, período e premissas. Os
  números citados abrem a lista filtrada.
- **Fato, estimativa e sugestão** aparecem diferenciados nas respostas.
- **Proteção:** descrições vão ao modelo como dado delimitado.
- **Alterações** (por exemplo, recategorizar) só com prévia, confirmação e desfazer.
- **Sem IA:** insights determinísticos com a IA desligada.
- **Open Finance (§14):** apenas contratos (conector, consentimento, id externo,
  idempotência e reconciliação), sem implementação.
