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
| D-004 | 0 | O plano de "Resumo com 4 gráficos", proposto antes do briefing e ainda não aprovado, é substituído pela Fase 4. Dele se aproveitam o seletor de período, os filtros e a comparação de períodos equivalentes. | O briefing pede "uma informação principal por vez" e "um gráfico pequeno". | proposta |
| D-005 | 0 | O nome do app é preservado como está (`finance-app` em `app.json`). | O briefing pede preservar o nome e não há outro definido. | suposição |
| D-006 | 1 | Natureza do lançamento em coluna própria (`nature`), mantendo `type` como direção do dinheiro. A natureza dos dados existentes é inferida por regras conservadoras, e o `type` original continua guardado. | Separar natureza de direção cumpre o §9 sem reescrever o modelo e permite reverter. | proposta |
| D-007 | 1 | Backup antes de migrar num arquivo SQLite separado (`finance-backup.db`), com a mesma API em iOS, Android e web. | Protege contra erro de migração em todas as plataformas sem dependência nova. | proposta |
| D-008 | 1 | Parcelas: orçamento reconhecido por parcela, com o total contratado sempre visível. Na divisão, o resto em centavos vai para a 1ª parcela. | É a hipótese recomendada no §9, e o total fica preservado. | proposta |
| D-009 | 1 | Fuso padrão America/Sao_Paulo. Datas de lançamento continuam como data local `AAAA-MM-DD`. | O §9 pede datas e fuso explícitos; datas sem hora evitam erros de virada de dia. | suposição |
| D-010 | 3 | O conjunto enxuto de categorias (8–12 de despesa) vale para instalações novas. Os dados existentes mantêm as categorias atuais e ganham ferramentas para arquivar e consolidar. | Preserva o histórico e evita mudar categorias usadas sem consentimento. | proposta |
| D-011 | 2 | Manrope + Inter (SIL OFL) e Lucide (ISC), condicionados à verificação de compatibilidade com Expo Go e web. Se falharem, fonte do sistema, documentada. | As licenças permitem uso comercial; o briefing prefere essas escolhas. | proposta |
| D-012 | 1 | Na web, a chave de IA continua no `localStorage` do navegador. É limitação documentada da fase pessoal; na versão comercial, as chaves ficam num servidor. | O navegador não tem cofre equivalente ao Keychain. | suposição |
