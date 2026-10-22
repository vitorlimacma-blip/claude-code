# IA financeira independente — auditoria e arquitetura

Contrato: `docs/ai/spec/PROMPT_UNICO_CLAUDE_V2.md` (versão 2.2, recebida em 22/10/2026). Ele é a Fase 6 do
roteiro (decisão do dono do produto: D-066). Este documento registra a auditoria (P0), o que já existe, as decisões
e os bloqueios reais. Atualizado a cada etapa.

## 1. Auditoria do repositório (P0) — 22/10/2026

### Plataforma

| Item | Estado verificado | Consequência |
| --- | --- | --- |
| Expo SDK | 57.0.30 (voltou do 58 em 20/10 porque o Expo Go da App Store não abria o 58, D-056) | Não atualizar de novo sem necessidade (§6 do contrato). |
| React Native / React | 0.86.3 / 19.2.3 | — |
| New Architecture | `newArchEnabled: true` em `app.json` | Requisito do `llama.rn` ≥ 0.10 atendido no papel; compatibilidade com RN 0.86 **não comprovada** (sem build). |
| Testes no celular | Só Expo Go | `llama.rn` é módulo nativo: **não roda no Expo Go**. A prova móvel exige development build (P2), hoje indisponível: sem conta Apple Developer e sem Android (resposta do dono em 22/10). |
| Web (PC) | `npx expo start --web`, saída `single` | O protótipo no PC (P1) pode falar com um runtime local (Ollama em `localhost`) sem mudar o núcleo. |
| Banco | expo-sqlite (web: wa-sqlite/OPFS), Drizzle, migrações 0000–0003, backup automático antes de migrar | Novas tabelas via `npm run db:generate` e migração transacional (D-067). |
| Testes | Jest (jest-expo), 327 testes; SQLite de teste em `node:sqlite` | Domínio testável sem runtime nativo. |

### Runtime candidato no celular

- `llama.rn` 0.12.9 (estável no npm; o `latest` está em 0.13.0-rc.8). Exige New Architecture; tem instruções
  para Expo com `expo-build-properties`. Versão do llama.cpp embutida e suporte à família Qwen3.5 **não
  verificados** (o GitHub de releases está bloqueado nesta sessão).
- Ainda não é dependência do app: adicionar um módulo nativo quebra o Expo Go, que é como o app é testado hoje.
  A entrada será isolada atrás da interface `ModelEngine` e só será carregada num development build (etapa 6.3).

### Rede desta sessão (bloqueio real)

Negado pela política de rede do ambiente: `huggingface.co`, `ollama.com`, `registry.ollama.ai` e downloads de
releases do GitHub. Permitido: registro do npm e PyPI. Consequência: **nenhum peso de modelo pôde ser baixado
aqui**, então P1 (prova com modelo real) não foi executada nesta sessão. Caminhos: liberar esses domínios no
ambiente, ou executar a prova no PC do dono com Ollama (instruções na etapa 6.3). Nenhum resultado de modelo é
simulado nos relatórios.

### O que já existe e é reaproveitado

| Contrato (§6) | Existente | Situação |
| --- | --- | --- |
| FinancialTools | `src/ai/assistant/tools.ts`: 11 ferramentas sobre o mesmo domínio do Resumo (`computeFinancialPicture`), sem escrita | Ampliado na 6.1 com as ferramentas do §4 e regimes explícitos. |
| AnswerValidator | `src/ai/assistant/validate.ts` (`checkAnswer`): valores do texto precisam vir das ferramentas; referências conferidas | Ampliado na 6.2 com o contrato de resposta (facts, evidence, evidenceStatus, mode). |
| Evidência | `AnswerContext` com período, critérios e ids dos lançamentos | Já atende "IDs, período, premissas"; falta "completude" e chunkIds (6.2). |
| Respostas sem modelo | `localAnswers.ts` (modo determinístico) | Base do modo `deterministic`. |
| Provedores externos | Claude e OpenAI com a chave do usuário (`src/ai/providers`) | Mantidos, mas passam para trás da `PermissionPolicy` (6.2): chave salva não autoriza chamada. |
| Categorização | Aprendizado local (regras + Naive Bayes) a partir das correções | Vira fonte de `MemoryItem` do tipo correção/proposta de regra (6.2). |
| ModelEngine / ModelManager | — | Novo (6.3). |
| KnowledgeRepository | — | Novo (6.2): 23 fichas (anexo A + J.3), busca FTS local. |
| MemoryRepository | — | Novo (6.2). |
| PermissionPolicy | Ajustes de IA: provedor, busca na web, categorização com IA | Novo contrato (6.2) com permissões separadas por finalidade, todas desligadas por padrão. |

### Lacunas no domínio financeiro frente ao contrato (§4)

1. **Metas e reservas** não existem. Hoje todo saldo de conta corrente, poupança e carteira conta como
   disponível, o que contraria a semântica 6 ("dinheiro reservado a metas ou emergência não é automaticamente
   livre"). → 6.1: tabelas de metas e reservas.
2. **Piso operacional** (saldo mínimo escolhido pela pessoa) não existe. → 6.1.
3. **Regimes**: o app usa a visão de consumo (compra no cartão conta na data da compra; pagamento de fatura é
   transferência neutra) e parcelas por competência (uma linha por parcela). A visão de caixa bancário não era
   exposta. → 6.1: regime explícito nas ferramentas.
4. **Projeção só com confirmados**: a margem do Resumo soma o gasto variável de um mês típico (estimativa). O
   contrato pede também a projeção apenas com compromissos confirmados (E07). → 6.1: as duas, identificadas.
5. **Saldo de abertura com data**: o app guarda o saldo antes do primeiro lançamento, sem data de abertura. O
   adaptador do cenário sintético converte (D-069); o app não muda.
6. **Moedas**: as somas já agrupam por moeda; as ferramentas novas recusam somar moedas diferentes (E38).
7. **Usuário**: o app é de uma pessoa, local. O escopo vem da sessão (`LOCAL_USER_SCOPE`), nunca de um argumento
   do modelo; as ferramentas não aceitam `user_id` (E21).

## 2. Plano da Fase 6

| Etapa | Conteúdo | Casos |
| --- | --- | --- |
| 6.1 | Auditoria; especificação e anexos no repositório; metas, reservas e piso; regimes; ferramentas do §4 com schema estrito; cenário sintético em base de teste comparado ao gabarito; placar E01–E93 | Domínio: E01–E14, E18, E32, E33, E38, E39 |
| 6.2 | Base de conhecimento (23 fichas, FTS, citações), memória revisável e apagável, permissões por finalidade, perfil de voz (L.1), classificação de intenção/capacidade, contrato de resposta | E15–E26, E31, E35–E37, E40–E81 de política |
| 6.3 | `ModelEngine`/`ModelManager` (Ollama no PC; `llama.rn` em development build), estados de instalação, cancelamento, planejamento de viagens (anexo M), relatório de avaliação com modelo real quando houver acesso | E27–E30, E34, E82–E93 |

## 3. Regras de separação

- Gabaritos e casos (`src/ai/eval/`) só são importados por testes; um teste garante que nenhum código do app os
  importa. Nunca entram no corpus, no prompt de produção nem em treino.
- O corpus aprovado (`src/ai/knowledge/seed/`) é texto original do projeto. O catálogo bibliográfico
  (`docs/ai/sources.json`) é só metadado: `auto_ingest=false`, nenhum livro foi baixado.
- `docs/ai/model-manifest.json` e `docs/ai/device-benchmark.json` estão com `null` onde nada foi verificado.

## 4. Situação ao fim da etapa 6.1

- Especificação e anexos no repositório (D-067); auditoria acima.
- Domínio: metas e reservas (migração 0004), visões de consumo e caixa, projeção só com confirmados, simulação
  contra o saldo mínimo, plano de metas, juros compostos e percentuais em aritmética exata
  (`src/domain/financeQueries.ts`). A margem do Resumo passou a descontar reservas.
- Ferramentas do §4 (6 de 9; `search_knowledge`, `get_user_memory` e `propose_memory_update` ficam para a 6.2) com
  validação estrita e um reparo no máximo (`src/ai/finance/`).
- Avaliação: `docs/ai/evaluation-report.json`. Casos de domínio executados sem modelo; todos os que exigem modelo,
  memória, base de conhecimento ou aparelho estão `not_run`, com o motivo.

## 5. Situação ao fim da etapa 6.2

- Permissões por finalidade e roteamento de modo (D-074, D-075): `src/ai/config.ts`, `src/ai/engine/answer.ts`.
- Base de conhecimento (D-076): `src/ai/knowledge/` (fichas, catálogo só de referência, SHA-256, busca BM25).
  Recuperação abaixo da meta na coleção cega: ver `docs/ai/evaluation-report.json` › `metrics.retrieval`.
- Memória (D-077): `memory_items` (migração 0005), `src/data/repositories/memory.ts`, tela `app/memory.tsx`.
- Classificação e capacidades (D-078): `src/ai/engine/intent.ts`. Voz (D-079): `src/ai/engine/voice.ts`.
- Motor sem modelo com o contrato de resposta (facts, evidence, assumptions, missingData, evidenceStatus, mode):
  `src/ai/engine/deterministic.ts`. Ferramentas do §4 completas (9 + `lookup_reference`):
  `src/ai/finance/contractTools.ts`.
- Telas: Assistente (modo de cada resposta, cancelar, útil/incorreto, confirmar memória, apagar memória), Memória do
  assistente, Metas, reservas e saldo mínimo, e "Apagar todos os meus dados" (D-080).
- Ainda não implementado ao fim da 6.2: motor e gerenciador do modelo local e planejamento de viagens (feitos na
  6.3, §6), avaliação com modelo real (bloqueada pela rede desta sessão).

## 6. Situação ao fim da etapa 6.3

- Planejamento de viagens e metas (anexo M, D-082): `src/domain/goalFeasibility.ts`, ferramentas
  `assess_goal_feasibility` e `estimate_travel_cost` em `src/ai/finance/contractTools.ts`, intenção `trip_plan`.
  Sem busca autorizada, o custo da viagem é declarado como dado faltante (nunca estimado).
- Motores locais atrás de `ModelEngine` (D-083): `src/ai/local/ollama.ts` (PC, só loopback, streaming, cancelamento) e
  `src/ai/local/llamaRn.ts` (aparelho; o módulo é registrado só por um development build, sem import no Expo Go).
- `ModelManager` (D-084): consentimento, espaço livre, download retomável, SHA-256 em blocos antes da ativação
  atômica; arquivo parcial ou com hash diferente nunca é carregado. Manifesto ainda com campos nulos: instalação
  bloqueada. Armazenamento real em `src/ai/local/expoFileStore.ts`, ainda não testado em aparelho.
- Resposta com modelo local (D-085): `src/ai/engine/localModel.ts`; o modelo recebe só os fatos calculados e trechos
  aprovados, e o texto passa por `checkAnswer` antes de aparecer. Telas: Ajustes › Inteligência artificial › Modelo
  local; Assistente mostra o modo e o cancelar interrompe a geração.
- Não executado: modelo real (rede desta sessão bloqueia os pesos), prova em aparelho (sem development build) e
  benchmark. Casos E27, E29, E34 e E93 seguem `not_run` com testes parciais; instruções em `docs/ai/user-setup.md`.
