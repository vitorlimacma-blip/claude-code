# Registro de decisões

Decisões e suposições tomadas durante a adaptação descrita em `docs/briefing-produto.md`,
na ordem de `docs/roteiro-fases.md`.

Situação: **confirmada** (aprovada pelo dono do produto), **suposição** (baixo risco,
registrada e seguida) ou **proposta** (aguarda aprovação).

| ID | Fase | Decisão | Motivo | Situação |
|---|---|---|---|---|
| D-001 | 0 | Os documentos ficam em `finance-app/docs/`, a pasta do app dentro do repositório. | É onde o app e a documentação existente vivem; o repositório raiz é outro projeto. | suposição |
| D-002 | 0 | Não existe `docs/pesquisa-produto.md`. O briefing é a única especificação. | Arquivo não encontrado no repositório nem nos anexos. | suposição |
| D-003 | 0 | Em caso de conflito, o briefing prevalece sobre `docs/ARQUITETURA.md`. Este fica como histórico das etapas anteriores. | O briefing é a especificação desta adaptação. | suposição |
| D-004 | 0 | O plano de "Resumo com 4 gráficos", proposto antes do briefing e ainda não aprovado, é substituído pela Fase 4. Dele se aproveitam o seletor de período, os filtros e a comparação de períodos equivalentes. | O briefing pede "uma informação principal por vez" e "um gráfico pequeno". | confirmada |
| D-005 | 0 | O nome do app é preservado como está (`finance-app` em `app.json`). | O briefing pede preservar o nome e não há outro definido. | suposição |
| D-006 | 1 | Natureza do lançamento em coluna própria (`nature`), mantendo `type` como direção do dinheiro. A natureza dos dados existentes é inferida por regras conservadoras, e o `type` original continua guardado. | Separar natureza de direção cumpre o §9 sem reescrever o modelo e permite reverter. | confirmada |
| D-007 | 1 | Backup antes de migrar num arquivo SQLite separado (`finance-backup.db`), com a mesma API em iOS, Android e web. | Protege contra erro de migração em todas as plataformas sem dependência nova. | confirmada |
| D-008 | 1 | Parcelas: orçamento reconhecido por parcela, com o total contratado sempre visível. Na divisão, o resto em centavos vai para a 1ª parcela. | É a hipótese recomendada no §9, e o total fica preservado. | confirmada |
| D-009 | 1 | Fuso padrão America/Sao_Paulo. Datas de lançamento continuam como data local `AAAA-MM-DD`. | O §9 pede datas e fuso explícitos; datas sem hora evitam erros de virada de dia. | suposição |
| D-010 | 3 | O conjunto enxuto de categorias (8–12 de despesa) vale para instalações novas. Os dados existentes mantêm as categorias atuais e ganham ferramentas para arquivar e consolidar. | Preserva o histórico e evita mudar categorias usadas sem consentimento. | confirmada |
| D-011 | 2 | Manrope + Inter (SIL OFL) e Lucide (ISC), condicionados à verificação de compatibilidade com Expo Go e web. Se falharem, fonte do sistema, documentada. | As licenças permitem uso comercial; o briefing prefere essas escolhas. | confirmada |
| D-012 | 1 | Na web, a chave de IA continua no `localStorage` do navegador. É limitação documentada da fase pessoal; na versão comercial, as chaves ficam num servidor. | O navegador não tem cofre equivalente ao Keychain. | suposição |
| D-013 | 1 | Fatura: compra feita no dia do fechamento ou depois vai para a fatura seguinte. A fatura é identificada pelo mês do vencimento (`invoiceMonth`). Dias além do fim do mês são ajustados para o último dia. | É a regra mais comum nos bancos brasileiros e mantém a fatura ligada à data em que é paga. | suposição |
| D-014 | 1 | Estorno: lançamento próprio com natureza `refund`, vinculado à origem (`refundOfId`), na mesma categoria e na direção oposta. Reduz a despesa no período da data do estorno e nunca conta como receita. A soma dos estornos não passa do valor original. Estornos não treinam o categorizador. | Cumpre o §9 (tratamento explícito e vinculado) e o §16 (estorno não duplica a correção). | suposição |
| D-015 | 1 | Rendimento (`investment_return`) e ajuste de saldo (`adjustment`) ficam fora do resultado (receitas − despesas). São mostrados à parte e alteram só o saldo da conta. | §9: valorização não é renda disponível; saldo inicial e ajuste não viram renda. | suposição |
| D-016 | 1 | O número de "Saldo nas contas" no Resumo continua o mesmo (contas + investimentos + saldo dos cartões), agora calculado pelo `ledger`, que já separa disponível, investimentos e cartões. A separação aparece na tela na Fase 4. | A Fase 1 não muda a tela; limite de cartão nunca entra no cálculo. | suposição |
| D-017 | 1 | Saldos continuam somando lançamentos com data até hoje, inclusive os pendentes (comportamento atual). A separação entre realizado, comprometido e estimado vem na Fase 4. | Evita mudar números na tela antes do redesenho do Resumo. | suposição |
| D-018 | 1 | Exportação em JSON versionado (`finance-app-data`, versão 1), com o mesmo formato dos backups automáticos: todas as linhas de todas as tabelas, inclusive as excluídas. O arquivo não é criptografado (aviso na tela) e não contém chaves de IA. | Um só caminho de restauração, testado, para backup e exportação. Criptografia fica para a versão comercial. | suposição |
| D-019 | 1 | Backups automáticos antes de migrar e antes de restaurar, guardados em `finance-backup.db`. Ficam os 10 mais recentes. Se o backup falhar, a migração não roda. No navegador, os backups ficam no armazenamento do próprio site: limpar os dados do site apaga ambos (aviso em Ajustes). | §12: recuperação garantida. A limitação da web fica documentada. | suposição |
| D-020 | 1 | Dependências novas: `expo-document-picker` e `expo-sharing`. O `expo-file-system` virou dependência explícita. Os três fazem parte do Expo Go (SDK 58). | Necessárias para exportar e importar arquivos no celular. | suposição |
| D-021 | 1 | `competenceMonth`, `dueDate` e `settledDate` passam a ser guardados, mas os totais por período continuam usando a data do lançamento. Competência e vencimento entram nos cálculos na Fase 4 (compromissos e projeções), por uma única regra no `ledger`. | Diferencia as datas (§9) sem misturar políticas entre telas. | suposição |
| D-022 | 1 | O preenchimento de dados novos (natureza dos lançamentos existentes, mês da fatura das compras no cartão) é uma "migração de dados" versionada em `settings` (`migration.dataVersion`). Ao restaurar um backup anterior, ela roda de novo sobre os dados restaurados. | Idempotente e reexecutável; o `type` original é mantido. | suposição |
| D-023 | 1 | Correção: `dayOfYear` passa a contar em UTC. Em fusos com horário de verão, a projeção anual perdia um dia. | Encontrado ao rodar os testes em outros fusos (§16: datas e fuso). | suposição |
