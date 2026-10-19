# Roteiro de execução por fases

> Instruções do dono do produto (outubro de 2026). O briefing (`docs/briefing-produto.md`)
> descreve o destino; este roteiro define a ordem e as paradas e prevalece sobre as
> seções 2 e 18 do briefing nesses pontos.

O briefing do produto está em docs/briefing-produto.md e é a especificação completa desta adaptação. Leia o documento inteiro antes de começar. Se existir docs/pesquisa-produto.md, use-o só como material de apoio; em caso de conflito, vale o briefing.

## Como executar
O briefing descreve o destino. A execução segue as fases abaixo, que prevalecem sobre as seções 2 e 18 do briefing no que diz respeito à ordem e às paradas.
- Decisões de baixo risco: registre a suposição e siga.
- Ao fim de cada fase: rode os testes, faça commit com mensagem clara, resuma no formato da seção 18 e PARE até eu aprovar.
- Nunca declare testes ou verificações que não executou.

## Fase 0 — Inspeção e plano (sem alterar código)
- Faça a inspeção da seção 2.
- Liste o que o app atual já atende, o que contradiz as regras da seção 9 e o que falta.
- Crie docs/decisoes.md para registrar decisões ao longo das fases.
- Atualize o CLAUDE.md para apontar para o briefing e o arquivo de decisões.
- Detalhe o plano das fases seguintes, com tamanho estimado.

## Fase 1 — Domínio financeiro (sem mudança visual)
- Seção 9 completa: camada de domínio central, centavos inteiros, separação de natureza, conta, cartão, forma de pagamento e categoria.
- Antes de migrar: backup automático dos dados atuais e procedimento de restauração testado.
- Migração idempotente, que preserva todos os registros.
- Testes automatizados para todos os casos da seção 16 que dependem do domínio.
- Exportação e restauração completas.

## Fase 2 — Design system Maré Clara
- Seções 4, 5 e 6: tokens claro e escuro, tipografia, espaçamentos, raios, movimento e componentes compartilhados.
- Tela interna de catálogo para eu revisar os componentes nos dois temas.
- Valide os contrastes efetivamente usados.

## Fase 3 — Lançamentos, Categorias e Ajustes
- Seções 7 e 8: entrada rápida, edição, desfazer, filtros por período, conta, categoria e natureza com total filtrado, busca discreta.
- Transferências, estornos, parcelas e pagamento de fatura reconhecíveis na lista.
- Categorias e Ajustes conforme a seção 7.

## Fase 4 — Resumo, orçamento e projeções
- Recorrências básicas (receitas e despesas previstas), necessárias para a margem até o próximo recebimento.
- Seções 7 (Resumo) e 10: realizado, comprometido, estimado e disponível; menor saldo previsto no período; memória de cálculo de cada projeção; fallback quando faltar dado.
- Orçamento por categoria com tom neutro (seção 13).

## Fase 5 — Assistente
- Seções 11 e 12: pipeline intenção → consulta → cálculo → validação → explicação.
- Preserve a integração de IA existente e torne-a mais segura e fundamentada.
- Respostas com período, base e acesso aos lançamentos; alterações só com prévia, confirmação e desfazer.
- O app continua funcionando com a IA desligada.

Itens da seção 14 (Open Finance, monetização) ficam só preparados nas interfaces, sem implementação.

Comece pela Fase 0.
