# Briefing do produto

> Especificação completa da adaptação do app. Texto fornecido pelo dono do produto
> (outubro de 2026), reproduzido sem alterações de conteúdo. A ordem de execução e as
> paradas seguem `docs/roteiro-fases.md`, que prevalece sobre as seções 2 e 18 nesses
> pontos.

Atue como um time sênior de produto, UX/UI e engenharia React Native/Expo. Sua missão é adaptar este app de finanças pessoais com base no briefing abaixo, entregando código funcional, uma experiência visual consistente e regras financeiras confiáveis.

Este briefing consolida uma pesquisa de produto e mercado realizada em outubro de 2026. As propostas de design e funcionalidades são hipóteses de produto a validar; não são resultados comprovados de testes com usuários.

Trabalhe com autonomia. Quando faltar uma informação de baixo risco, registre a suposição e siga. Respeite as instruções do repositório, preserve os dados existentes e informe bloqueios reais. Sua entrega deve incluir implementação e verificação, além do planejamento.

## 1. Contexto e objetivo

O app está funcional, em fase de uso pessoal, com dados locais e lançamentos manuais. Futuramente será comercializado no Brasil.

Plataforma:

* React Native / Expo.
* Mobile-first, com prioridade para iPhone e compatibilidade com Android.
* Desktop/web no futuro.

Telas existentes:

* Resumo: despesas, receitas, resultado, saldo das contas e alertas de orçamento com projeção.
* Lançamentos: lista mensal com categoria, conta e forma de pagamento.
* Assistente: IA.
* Categorias.
* Ajustes.

Contas típicas: banco tradicional, cartão de crédito, carteira digital e corretora.

Objetivo: transformar o app em uma experiência bonita, intuitiva, fluida, confiável e pessoal. Deve ajudar o usuário a entender sua situação e tomar pequenas decisões com segurança. A sensação desejada é de uma interface orgânica e quase viva, com personalidade discreta.

Preserve o nome do app e funcionalidades úteis já existentes. A adaptação deve respeitar a arquitetura encontrada sempre que ela atender ao objetivo.

## 2. Comece inspecionando o projeto

Antes de alterar código:

1. Leia as instruções do repositório e identifique navegação, dependências, armazenamento, modelo financeiro, integração de IA, componentes, estilos e testes.
2. Identifique alterações locais do usuário e preserve-as.
3. Entenda como os dados atuais representam contas, cartões, categorias, parcelas, transferências, receitas e despesas.
4. Localize possíveis duplicações de cálculos financeiros e inconsistências entre telas.
5. Apresente um plano breve e execute-o em etapas pequenas.
6. Registre decisões relevantes em um documento curto no padrão do projeto.

Evite reescrever o app inteiro quando uma refatoração incremental resolver. Adicione dependências apenas quando houver benefício concreto e compatibilidade com a versão instalada do Expo.

Migrações devem preservar dados, permitir recuperação e ser idempotentes quando aplicável. Não limpe o banco para facilitar o desenvolvimento.

## 3. Síntese do benchmark que deve orientar as decisões

Use estas referências como princípios, sem copiar layouts, identidade ou textos:

* Pierre: assistência financeira próxima e insights contextualizados. Evitar a promessa de uma IA que “faz tudo” sem evidências.
* Organizze: clareza, organização e familiaridade com a realidade brasileira. Preservar a facilidade de compreender e conferir os lançamentos.
* Mobills e Minhas Economias: categorias, orçamento e variedade de contas. Evitar excesso de opções na primeira experiência e inconsistências entre entradas manuais e dados importados.
* YNAB e Actual Budget: planejamento intencional, dinheiro com propósito e controle do usuário. Apresentar os conceitos progressivamente.
* Monarch Money: visão integrada, planejamento flexível e separação entre gastos fixos, variáveis e despesas não mensais.
* Copilot Money: apresentação visual cuidadosa, revisão de transações e categorização que melhora com correções.
* Rocket Money e Emma: recorrências, assinaturas e identificação de oportunidades concretas de economia.
* Cleo: linguagem acessível e conversacional. Evitar humor constrangedor, pressão, promessas exageradas e mecanismos comerciais difíceis de cancelar.
* Revolut: boa hierarquia, navegação e feedback. Evitar a densidade de um superapp bancário.
* Wallet, Spendee e Lunch Money: filtros, múltiplas contas e flexibilidade de organização.
* Olivia e Guiabolso: referências históricas de assistência e agregação no Brasil, não concorrentes independentes atuais.

Lição central: confiabilidade dos dados, rapidez de registro e explicação clara dos números sustentam o valor do produto. A personalidade visual deve reforçar essas qualidades.

## 4. Direção visual escolhida: Maré Clara

Adote “Maré Clara” como direção principal.

Conceito: uma interface calma, tátil e humana, inspirada em água, luz e superfícies minerais. A vida vem de transições contínuas, feedback e respostas sutis aos dados.

Características:

* Fundo claro levemente mineral.
* Superfícies limpas, hierarquia forte e bom espaço em branco.
* Verde profundo como cor principal.
* Curvas suaves e pequenos detalhes orgânicos.
* Tipografia legível, valores financeiros bem alinhados e gráficos contidos.
* Personalidade concentrada no Resumo, estados vazios e feedbacks.
* Lançamentos e formulários com máxima clareza.

Motivo visual próprio: uma curva ou faixa suave pode representar a evolução do período. Ela precisa corresponder a uma informação compreensível ou ser claramente decorativa. Não invente um “índice de saúde financeira” para alimentar animações.

As alternativas consideradas foram:

* Órbita: mais tecnológica, escura, com lavanda e azul.
* Caderno Vivo: mais calorosa e editorial, com creme e terracota.

Mantenha essas alternativas apenas como referência de raciocínio. Implemente uma linguagem visual coerente com Maré Clara.

Evite:

* Vidro e transparência atrás de números essenciais.
* Gradientes em todos os componentes.
* Gráficos decorativos.
* Ícones genéricos de robô em toda função de IA.
* Animações contínuas sem propósito.
* Cores que julgam o usuário.
* Interfaces densas de planilha.
* Cartões para cada pequena informação, criando fragmentação excessiva.

## 5. Design system implementável

Centralize tokens e componentes. Adapte os nomes à estrutura do projeto.

Cores — tema claro:

* background: #F6F8F5
* surface: #FFFFFF
* textPrimary: #132A26
* textSecondary: #53645D
* primary: #176B5B
* onPrimary: #FFFFFF
* primarySoft: #DDEEE5
* info: #365BB5
* warning: #8A5200
* warningSurface: #FFF1DB
* danger: #B42332
* dangerSurface: #FDE9EC

Cores — tema escuro:

* background: #101A18
* surface: #192824
* textPrimary: #F0F6F2
* textSecondary: #B3C5BC
* primary: #8BD8BD
* onPrimary: #10251E
* warning: #FFD08A
* warningSurface: #382B18
* danger: #FFB0B9
* dangerSurface: #3A2026

Defina tokens complementares para bordas, foco, estados pressionados e gráficos. Valide o contraste das combinações efetivamente usadas, incluindo opacidade.

Tipografia:

* Preferência: Manrope nos títulos e Inter no corpo e valores.
* Preserve as licenças comerciais das fontes.
* Use arquivos e pesos necessários, evitando carregamento excessivo.
* Valores com numerais tabulares, quando suportados.
* Se houver impedimento técnico, use uma fonte de sistema coerente e documente a decisão.

Escala inicial, ajustável à acessibilidade:

* Valor de destaque: 36/42, peso 600.
* Título de tela: 28/34, peso 700.
* Título de seção: 20/26, peso 600.
* Corpo: 16/24, peso 400.
* Rótulo: 14/20, peso 500.
* Informação auxiliar: 12/16, peso 400, sem usar esse tamanho para informação financeira essencial.

Espaçamentos: 4, 8, 12, 16, 20, 24, 32, 40 e 48.
Padding horizontal inicial: 20.
Distância entre seções: 24.
Raios: 8, 12, 20, 28 e 999, com funções consistentes.
Controles principais: área de toque mínima de aproximadamente 48 unidades lógicas.
Linhas de transações: altura mínima de 64, expansível com texto maior.
Sombras: discretas, reservadas à elevação real. No escuro, priorize contraste de superfície e bordas.

Ícones:

* Use uma família consistente, como Lucide, respeitando sua licença.
* Ícones de 20–24 em controles comuns.
* Evite misturar preenchidos, traços e estilos arbitrariamente.
* Acompanhe ações ambíguas com texto.

Componentes compartilhados:

* Screen e Section.
* FinancialAmount.
* Button e IconButton.
* Surface/Card.
* TransactionRow.
* AccountSelector.
* CategoryChip.
* BudgetProgress.
* InsightCard.
* ProjectionCard.
* EmptyState e ErrorState.
* BottomSheet, Toast e Skeleton.
* Campo monetário com comportamento adequado ao teclado e ao locale.

## 6. Movimento, acessibilidade e sensação de interface viva

Use movimento para explicar relações, reconhecer ações e preservar continuidade.

Referências iniciais:

* Pressão: 100 ms.
* Feedback: 160 ms.
* Transição: 220 ms.
* Bottom sheet: aproximadamente 300 ms.
* Molas com resposta rápida e pouca oscilação.

Caso use Reanimated e a versão seja compatível, uma configuração inicial a ajustar é: mass 1, stiffness 380, damping 32, overshootClamping true. Respeite Reduce Motion e evite misturar parâmetros incompatíveis.

Comportamentos desejados:

* Botão responde discretamente à pressão.
* Salvar um lançamento produz confirmação breve.
* A lista atualiza mantendo contexto e posição.
* Cards expandem de forma contínua para explicar os números.
* Projeções mudam com transição curta após alterações relevantes.
* Háptica leve em ações importantes, com fallback silencioso.

Não dependa de animação ou háptica para comunicar sucesso ou erro. Evite contadores que dificultem ler o saldo.

Acessibilidade:

* Contraste mínimo de referência: 4,5:1 para texto normal e 3:1 para texto grande e elementos gráficos essenciais.
* Suporte a ampliação de texto sem ocultar valores.
* VoiceOver e TalkBack com nomes, estados e ordem de leitura úteis.
* Nunca use somente vermelho/verde para distinguir situações.
* Gráficos com rótulos, legenda clara e alternativa textual.
* Respeite preferências de movimento e transparência.
* Teste temas claro e escuro, teclado, safe areas e telas pequenas.

## 7. Adaptação das telas

Resumo:

* Uma informação principal por vez.
* Destaque para “Margem estimada até o próximo recebimento” quando os dados necessários estiverem disponíveis.
* Se estiverem incompletos, mostre o saldo conhecido e explique o que falta para calcular a margem.
* Diferencie saldo atual, resultado do período, compromissos futuros e projeção.
* Mostre a data da última atualização quando relevante.
* Inclua um gráfico pequeno e legível de evolução ou realizado versus previsto.
* Apresente poucos insights acionáveis.
* Resuma os orçamentos que precisam de atenção.
* Ofereça acesso rápido ao novo lançamento.
* Permita abrir a memória de cálculo de qualquer projeção importante.

Lançamentos:

* Lista agrupada por dia, com leitura rápida de descrição, valor, categoria, conta e situação.
* Filtros úteis por período, conta, categoria e natureza.
* Busca sem dominar a interface.
* Transferências, estornos, parcelas e pagamentos de fatura devem ser reconhecíveis.
* Ações por gesto precisam de alternativa visível e acessível.
* Edição simples e exclusão com recuperação ou confirmação proporcional ao risco.

Assistente:

* Combine chat com cards e sugestões contextuais.
* Sugestões úteis: “O que mudou neste mês?”, “Quais gastos estão pesando?” e “Como esta compra afetaria minha margem?”.
* Respostas curtas inicialmente, com detalhamento disponível.
* Números importantes devem abrir as transações e critérios usados.
* Diferencie fato, estimativa e sugestão.
* Uma proposta de alteração deve mostrar uma prévia antes de ser aplicada.
* Não invente respostas, histórico ou insights para preencher a tela.

Categorias:

* Estrutura inicial enxuta, aproximadamente 8–12 categorias de despesas.
* Receitas organizadas separadamente.
* Subcategorias opcionais, com no máximo dois níveis inicialmente.
* Permita criar, renomear, reordenar, arquivar e consolidar categorias com tratamento seguro do histórico.
* Correções de categorização podem ensinar preferências, com controle do usuário.

Ajustes:

* Contas e cartões.
* Preferências visuais e de acessibilidade.
* Privacidade e comportamento da IA.
* Exportação, backup e restauração quando implementados.
* Notificações.
* Gerenciamento seguro dos dados.

Revise a navegação conforme a frequência de uso. Categorias pode ficar em uma área secundária se isso simplificar o fluxo principal. Não remova sua acessibilidade.

## 8. Entrada manual com o mínimo de fricção

O fluxo principal de despesa deve priorizar:

1. Valor.
2. Descrição ou estabelecimento.
3. Conta/forma de pagamento com sugestões.
4. Categoria sugerida e fácil de corrigir.
5. Salvar.

Requisitos:

* Data atual como padrão, editável.
* Teclado numérico apropriado.
* Sugestão da última conta utilizada, sem transformar isso em escolha silenciosa perigosa.
* Autocomplete de descrições e estabelecimentos.
* Favoritos e duplicação de lançamentos quando úteis.
* Detalhes avançados progressivos.
* Prevenção de envio duplicado.
* Feedback de sucesso e ação de desfazer quando tecnicamente segura.
* Preservação dos dados digitados em erros recuperáveis.

Separe receita, despesa e transferência de maneira compreensível.

Entrada por texto, como “mercado 87,40 no débito”, pode gerar um rascunho estruturado quando houver suporte real. Campos ambíguos devem ficar explícitos antes da gravação.

## 9. Regras financeiras obrigatórias

A correção dos números tem prioridade sobre a apresentação.

Modele separadamente:

* Instituição.
* Conta ou carteira.
* Instrumento de crédito/cartão.
* Natureza do lançamento.
* Forma de pagamento.
* Categoria.
* Situação.
* Datas relevantes.

Regras:

* Transferência entre contas próprias não é receita nem despesa.
* Compra no cartão e pagamento da fatura não podem contar como duas despesas.
* Pagamento da fatura é liquidação de uma obrigação.
* Limite do cartão não é saldo disponível.
* Aporte em investimento não é consumo nem renda.
* Valorização patrimonial não é automaticamente receita disponível.
* Estornos e reembolsos devem ter tratamento explícito, preferencialmente vinculados à origem.
* Saldo inicial e ajuste de saldo não devem virar renda por acidente.
* Não some moedas diferentes sem conversão explícita e identificada.

Diferencie data da compra, competência, vencimento e liquidação quando aplicável.

Para parcelas:

* Mostre valor total, parcela atual, quantidade de parcelas e compromissos futuros.
* Preserve vínculo entre as parcelas.
* Defina uma política consistente de reconhecimento no orçamento.
* A hipótese inicial recomendada é acompanhar o orçamento por parcela, mantendo o total contratado visível.
* Não misture políticas entre gráficos e telas.

Precisão:

* Use centavos inteiros ou uma estratégia decimal apropriada.
* Evite ponto flutuante comum em cálculos monetários.
* Trate arredondamento de parcelas preservando o total.
* Use pt-BR e BRL como padrões iniciais, com datas e fuso tratados explicitamente.

Centralize os cálculos em uma camada de domínio compartilhada.

## 10. Orçamento e projeções sem ansiedade

Use orçamento por categoria como entrada simples, com possibilidade de limite geral flexível.

Apresente envelope, base zero e 50/30/20 como métodos opcionais. Não imponha percentuais universais nem classifique o usuário como irresponsável.

Diferencie:

* Realizado.
* Comprometido.
* Estimado.
* Disponível.

Uma projeção deve considerar:

* Despesas realizadas.
* Compromissos conhecidos ainda não reconhecidos.
* Estimativa variável para o restante do período.

Evite contar o mesmo compromisso duas vezes.

Uma margem de caixa deve considerar:

* Saldo elegível.
* Entradas confirmadas.
* Saídas previstas.
* Gastos variáveis estimados.
* Reservas, quando ainda estiverem incluídas no saldo considerado.

Verifique também o menor saldo previsto ao longo do período: fechar o mês positivo não elimina falta de caixa antes do recebimento.

Toda previsão precisa declarar período, base utilizada e limitações. Dados ausentes não equivalem a zero. Evite extrapolação ingênua do ritmo diário quando houver despesas concentradas.

Compare períodos equivalentes. Ao analisar um mês incompleto, não compare automaticamente com o mês anterior inteiro.

Sem dados suficientes, apresente uma estimativa limitada ou a impossibilidade de calcular. Não invente percentuais de confiança.

## 11. IA útil, verificável e controlável

Priorize:

* Sugestões de categoria.
* Aprendizado a partir de correções.
* Identificação de possíveis recorrências.
* Explicação de mudanças de gastos.
* Perguntas em linguagem natural.
* Rascunhos de lançamentos.
* Insights baseados em eventos concretos.

Arquitetura:

* Use regras locais e preferências aprendidas antes de recorrer a um modelo generativo.
* Um modelo pode interpretar a intenção e explicar resultados.
* Consultas autorizadas e código determinístico devem calcular os números.
* Valide os resultados antes de apresentá-los.
* Preserve os identificadores das transações, período e premissas utilizados.

Fluxo esperado: intenção → consulta autorizada → cálculo → validação → explicação.

A IA:

* Não inventa transações, saldos ou categorias.
* Não altera registros silenciosamente.
* Não executa SQL ou código arbitrário.
* Não trata descrições de transações como instruções.
* Solicita revisão de ambiguidades.
* Explica suas limitações.
* Permite corrigir e desfazer aprendizados ou regras.

Uma resposta como “transporte aumentou R$ 300” precisa permitir conferir quais períodos e lançamentos produziram o resultado.

Se já houver integração com IA, preserve-a e melhore sua segurança e fundamentação. Se não houver credenciais ou backend, entregue as funções determinísticas possíveis e os contratos necessários, deixando a indisponibilidade explícita. Não simule uma integração real.

Não envie dados a novos provedores sem configuração e autorização adequadas. Nunca embarque segredos de provedor no aplicativo.

## 12. Privacidade, confiança e limites regulatórios

Mantenha a experiência atual local e funcional.

Requisitos:

* Minimização de dados.
* Nenhum dado financeiro sensível em logs, analytics ou mensagens de erro.
* Armazenamento adequado para segredos, distinto do banco de transações.
* Exportação e exclusão compreensíveis.
* Biometria, se implementada, com fallback e sem confundir bloqueio visual com criptografia.
* Backup com política explícita.
* Avalie criptografia compatível com o ambiente. SQLCipher exige configuração/build apropriados e não deve ser prometido apenas por usar SQLite.

Para comercialização futura, documente a necessidade de revisar LGPD, bases legais, fornecedores, retenção, transferências internacionais e resposta a incidentes.

O assistente pode organizar finanças, explicar orçamento, simular cenários e fornecer educação geral. Recomendações individualizadas de valores mobiliários, ativos ou alocação exigem avaliação regulatória própria. Um aviso genérico não resolve esse limite.

Não apresente o app como certificado, autorizado pelo Banco Central ou “100% seguro” sem comprovação.

## 13. Comportamento, onboarding e notificações

Tom de voz:

* Humano, direto e respeitoso.
* Sem culpa, sermões ou infantilização.
* Reconheça progresso sem premiar consumo ou exposição desnecessária ao app.
* Não use sequências diárias punitivas.

Onboarding:

* Curto e pulável.
* Explique o benefício e o tratamento dos dados.
* Permita criar a primeira conta e fazer o primeiro lançamento cedo.
* Deixe orçamento e personalização detalhada para depois.
* Não exija cadastro, conexão bancária ou permissões sem necessidade atual.
* Não exiba dados fictícios como se fossem do usuário. Uma demonstração deve ser claramente identificada.

Alertas:

* Priorize vencimentos relevantes, risco de caixa e desvios significativos.
* Deduplicate, permita dispensar e respeite preferências.
* Explique motivo e ação possível.
* Prefira resumo útil a notificações constantes.
* Solicite permissão de notificação no contexto do benefício.
* Conteúdo financeiro em notificações deve respeitar a privacidade da tela bloqueada.

## 14. Open Finance e comercialização: preparar a evolução

Não implemente agora integração bancária, cobrança, publicidade ou infraestrutura remota sem necessidade e acesso adequados.

Prepare interfaces e separações de responsabilidade para:

* Conectores como Pluggy, Belvo ou alternativas.
* Consentimento e revogação.
* Identificadores externos.
* Idempotência.
* Histórico de sincronização.
* Reconciliação entre entrada manual e importada.
* Estados de conexão e dados desatualizados.

Não presuma que uma agregadora oferece todas as instituições, atualização instantânea ou acesso irrestrito. Custos, contratos e requisitos precisam de verificação antes da implementação comercial.

Monetização futura:

* Assinatura com valor claramente demonstrável.
* Base gratuita útil.
* Possível separação entre uso manual e conectividade bancária.
* Recursos familiares apenas quando validados.
* Evitar venda de dados financeiros, anúncios intrusivos e planos vitalícios incompatíveis com custos recorrentes.

Não implemente paywalls nesta adaptação pessoal.

## 15. Prioridades de execução

P0 — concluir nesta adaptação:

* Auditoria e correção dos cálculos financeiros.
* Preservação dos dados.
* Design system e temas.
* Redesign coerente das telas existentes.
* Fluxo rápido de lançamento e edição.
* Clareza de contas, cartões, transferências e faturas.
* Orçamentos e projeções transparentes.
* Estados vazios, loading, erros e dados incompletos.
* Acessibilidade e movimentos essenciais.
* Melhoria do assistente existente, com respostas fundamentadas.

P1 — implementar quando viável na arquitetura local:

* Regras de categorização aprendidas.
* Favoritos e duplicação.
* Recorrências e parcelamentos completos.
* Exportação e recuperação de dados.
* Busca e filtros aprimorados.
* Revisão semanal.
* Rascunhos por linguagem natural e insights determinísticos.

Recursos P1 que já existem devem ser preservados e adaptados como parte do P0.

Futuro — registrar como evolução:

* Open Finance.
* Sincronização entre dispositivos.
* Uso familiar.
* Monetização.
* Expansão web/desktop.
* Entrada por voz e imagem.
* Análises avançadas de investimentos.
* Automações mais amplas de IA.

Não deixe trabalho local viável incompleto apenas porque outras partes dependem de serviços externos.

## 16. Validação e critérios de aceitação

Execute os comandos de verificação existentes e adicione testes relevantes para os riscos financeiros e de persistência.

Casos mínimos:

* Transferência própria não altera receitas/despesas.
* Compra no cartão seguida de pagamento da fatura não duplica despesa.
* Parcelamento preserva valor total e distribuição das parcelas.
* Estorno não duplica correção.
* Aporte não aparece como consumo.
* Alteração de categoria atualiza os totais corretamente.
* Projeção não conta duas vezes compromissos já registrados.
* Dados incompletos não geram falsa precisão.
* Datas funcionam em mudanças de mês e fuso.
* Migração preserva registros.
* Falha ao salvar não produz duplicação.
* Respostas da IA correspondem aos cálculos apresentados.

Verifique visualmente, quando as ferramentas permitirem:

* iPhone pequeno e grande.
* Android.
* Temas claro e escuro.
* Texto ampliado.
* Teclado aberto.
* Valores longos.
* Lista vazia e lista extensa.
* Meses com saldo negativo.
* Ausência de orçamento.
* Falhas e indisponibilidade da IA.

Não declare testes ou inspeções que não foram executados.

Critérios finais:

* Os valores podem ser conferidos até a origem.
* O usuário entende a diferença entre saldo, resultado, compromisso e estimativa.
* O lançamento comum exige poucas decisões e funciona com uma mão.
* A interface mantém personalidade e legibilidade.
* O app continua útil sem conexão.
* Não há perda de dados, serviços simulados ou credenciais expostas.
* As limitações restantes estão documentadas.

## 17. Princípios permanentes de design

1. Clareza antes de ornamentação.
2. Todo número importante deve ser explicável.
3. Saldo, resultado e margem precisam ser distintos.
4. Registrar um gasto deve exigir pouco esforço.
5. Movimento deve comunicar uma mudança.
6. A interface acolhe sem julgar.
7. A IA sugere e explica; o usuário mantém o controle.
8. Incerteza e dados ausentes devem aparecer.
9. Acessibilidade faz parte da identidade.
10. Confiabilidade vale mais que quantidade de recursos.

## 18. Entrega esperada

Ao concluir, apresente:

* O que foi implementado e o efeito para o usuário.
* Mudanças relevantes no modelo financeiro e nas migrações.
* Decisões visuais e componentes compartilhados.
* Testes e verificações efetivamente executados.
* Capturas, se disponíveis.
* Limitações, bloqueios e próximos passos priorizados.

Comece pela inspeção do repositório e avance até concluir a adaptação viável.
