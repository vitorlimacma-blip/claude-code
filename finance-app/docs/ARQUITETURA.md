# Arquitetura e plano — App de finanças pessoais com IA

> Status: **aprovada**. Etapa 0 (Fundação) concluída — ver seção 9.
>
> Decisões do usuário:
> - Expo, evoluindo o `finance-app/` existente.
> - Fase pessoal sem custo (Expo Go). O Apple Developer Program será assinado
>   mais adiante.
> - IA com chave própria. Provedores: **Claude** e **ChatGPT (OpenAI)**, com
>   possibilidade de **consultar a internet**.
> - Bancos usados: **Itaú, Santander, XP Investimentos e Mercado Pago**.

---

## 1. Escolha da plataforma

### Comparativo

| Critério | **Expo (React Native + TS)** | Flutter | PWA (web instalável) |
|---|---|---|---|
| Testar no iPhone **sem Mac e sem pagar** | ✅ Expo Go (lê QR code) | ❌ precisa de Mac/Xcode ou build em nuvem + conta paga | ✅ Safari → "Adicionar à Tela de Início" (mas precisa estar hospedado) |
| App "de verdade" no iPhone, uso diário offline | ✅ EAS Build na nuvem (sem Mac) + conta Apple paga | ✅ com Mac ou Codemagic + conta paga | ⚠️ funciona, mas com as limitações abaixo |
| iOS + Android com a mesma base | ✅ | ✅ | ✅ |
| Desktop | ✅ via web (react-native-web); app nativo via Tauri/Electron ou RN Windows/macOS | ✅ desktop nativo maduro | ✅ nativo do conceito |
| SQLite local robusto | ✅ `expo-sqlite` | ✅ `sqflite`/`drift` | ⚠️ SQLite em WASM/OPFS; o iOS pode apagar dados do site se ficar sem espaço |
| Biometria, Keychain, arquivos, compartilhar | ✅ | ✅ | ⚠️ parcial no iOS |
| Atualizar o app sem reinstalar | ✅ EAS Update (OTA) | ⚠️ não tem oficial | ✅ |
| Caminho para lojas e comercialização | ✅ App Store / Play Store | ✅ | ⚠️ sem loja na Apple; monetizar é mais difícil |
| Ecossistema TypeScript (reaproveitar código num servidor futuro) | ✅ o mesmo TS roda no Node | ❌ Dart | ✅ |
| O que já existe no repositório | ✅ já é Expo | ❌ reescrever | ⚠️ parcial |

### Recomendação: **Expo + React Native + TypeScript**, evoluindo o `finance-app/`

- É o único dos três que dá para **testar no iPhone hoje, de graça e sem Mac**
  (Expo Go), e que depois vira um app nativo instalável **sem precisar de Mac**
  (EAS Build gera o `.ipa` na nuvem).
- A mesma base atende **iOS, Android e Web**. O desktop começa como versão web e,
  se fizer sentido, ganha um app nativo com Tauri/Electron.
- **TypeScript nas duas pontas:** a lógica de domínio e de IA (`src/domain`, `src/ai`)
  vai poder rodar num backend Node na Fase 2 sem reescrever nada.
- Os dados de finanças pessoais são sensíveis e não podem sumir. Num app nativo, o
  SQLite fica no sandbox do app e entra no backup do iPhone, o que é mais seguro que
  o armazenamento de uma PWA no Safari.

**Por que não Flutter:** é tecnicamente excelente (e melhor no desktop nativo), mas
não tem nada como o Expo Go para testar no iPhone sem Mac. Também obrigaria a
reescrever o que já existe e a usar Dart, que não serve para um servidor futuro.

**Por que não PWA:** precisa de hospedagem, o que vai contra a Fase 1. O iOS
também restringe armazenamento, notificações e acesso a arquivos, e não há loja da
Apple para vender depois. Ainda assim, a versão web do Expo nos dá uma "PWA de
brinde" para o desktop.

---

## 2. Como instalar e testar no seu iPhone

| Opção | Custo | Precisa de Mac? | Funciona sem o computador ligado? | Limitações |
|---|---|---|---|---|
| **A. Expo Go** (App Store) | Grátis | Não | ❌ O app é carregado do computador (mesma rede Wi-Fi ou túnel) | Só aceita bibliotecas incluídas no Expo Go, e o Expo Go da loja só roda a **versão de SDK mais recente** |
| **B. Development/Preview build via EAS + Apple Developer Program** | **US$ 99/ano** (+ plano gratuito do EAS, com cota mensal de builds) | **Não** (o build roda na nuvem da Expo) | ✅ App independente, offline | Instalação "ad hoc": o iPhone é registrado pelo UDID (o EAS guia o processo). Também pode ir pelo TestFlight. O certificado vale 1 ano |
| C. Conta Apple gratuita + Xcode | Grátis | **Sim** | ✅ | O app **expira em 7 dias** e precisa ser reinstalado pelo Mac. Limite de 3 apps |
| D. PWA | Grátis + hospedagem | Não | ✅ | Ver limitações acima |

**Caminho sugerido:**
1. **Etapas 0 a 2:** use o **Expo Go** (opção A). Custo zero e retorno imediato.
2. Quando quiser usar o app **no dia a dia**, sem computador por perto: assine o
   **Apple Developer Program** (US$ 99/ano) e gere o app pelo **EAS** (opção B).
   Essa conta é a mesma que você vai precisar para publicar na App Store na Fase 2,
   então não é um gasto perdido.
3. Correções de código chegam ao iPhone por **EAS Update** (OTA), sem reinstalar.

> ⚠️ **Ação necessária na Etapa 0:** o projeto atual está no **Expo SDK 53**, e o
> SDK mais recente hoje é o **58**. O Expo Go da App Store não abre projetos de SDKs
> antigos, então a primeira tarefa é atualizar o SDK.

---

## 3. Arquitetura

### Visão em camadas (portas e adaptadores)

```
┌──────────────────────────────────────────────────────────────┐
│ app/          UI (telas expo-router, componentes, gráficos)  │
├──────────────────────────────────────────────────────────────┤
│ src/features/ Casos de uso por funcionalidade                │
│               (lançar, importar, orçar, perguntar à IA…)     │
├───────────────┬───────────────────────┬──────────────────────┤
│ src/domain/   │ src/ai/               │ src/import/          │
│ TS puro:      │ AIProvider (porta)    │ Parsers CSV/OFX,     │
│ dinheiro,     │ + motor local de      │ presets por banco,   │
│ fatura,       │ categorização,        │ deduplicação         │
│ orçamento,    │ recorrência,          │                      │
│ previsão,     │ anomalias             │                      │
│ recorrência   │                       │                      │
├───────────────┴───────────────────────┴──────────────────────┤
│ src/data/     Repositórios (interfaces) ← adaptador SQLite   │
│               (Drizzle ORM + migrações versionadas)          │
├──────────────────────────────────────────────────────────────┤
│ src/platform/ Arquivos, compartilhar, SecureStore, biometria │
└──────────────────────────────────────────────────────────────┘
```

**Regra principal:** `domain/` e `ai/` não importam nada de React, Expo ou SQLite.
Eles recebem dados e devolvem dados. Isso permite:
- testar tudo com Jest, sem celular;
- reaproveitar o mesmo código num servidor Node (Fase 2) ou no desktop;
- trocar o banco (SQLite → Postgres no servidor) ou o provedor de IA sem mexer na UI.

### Stack

| Peça | Escolha | Prós | Contras / alternativa |
|---|---|---|---|
| Framework | Expo SDK 58, expo-router | Roteamento por arquivo, web incluso | — |
| Banco local | `expo-sqlite` | Nativo, rápido, funciona no Expo Go | No web, o SQLite é WASM (experimental) |
| Acesso a dados | **Drizzle ORM (modo assíncrono, driver `sqlite-proxy`)** | Tipado, migrações geradas, **o mesmo código roda com expo-sqlite (iOS/Android/web), better-sqlite3 (testes) e, no futuro, num servidor** | Mais uma dependência. O expo-sqlite é ligado ao Drizzle por um adaptador de ~20 linhas (`src/data/database.ts`) |
| Estado de UI | Hook `useQuery` + barramento de mudanças dos repositórios | Telas se atualizam sozinhas após qualquer gravação, sem biblioteca extra | Se o estado de UI crescer muito, entra Zustand |
| Gráficos | `react-native-gifted-charts` (usa `react-native-svg`) | Roda no Expo Go e no web | Victory Native/Skia é mais bonito e rápido, mas é mais pesado |
| Formulários | react-hook-form + zod | Validação compartilhável com o backend | — |
| Arquivos | expo-document-picker, expo-file-system, expo-sharing | Importar extrato e exportar backup pelo app Arquivos/iCloud | — |
| Segurança | expo-secure-store (chave de API), expo-local-authentication (Face ID) | Keychain do iOS | — |
| Testes | Jest (já configurado) | — | — |

> 📌 **Restrição consciente:** enquanto usarmos o Expo Go, só entram bibliotecas que
> ele já inclui. Tudo da tabela acima atende a isso.

### Modelo de dados (resumo)

Todas as tabelas têm `id` (UUID em texto), `created_at`, `updated_at` e `deleted_at`
(exclusão lógica). Essas colunas permitem **sincronização futura** sem migração
dolorosa. Valores ficam em **centavos inteiros** (já é assim hoje).

- `accounts`: nome, tipo (`corrente`, `poupanca`, `carteira`, `cartao_credito`,
  `investimento`), saldo inicial, cor. Para cartões: `dia_fechamento`, `dia_vencimento`,
  limite.
- `categories`: hierárquicas (`parent_id`), tipo (despesa/receita), ícone e cor.
  Vêm pré-cadastradas com categorias brasileiras (Alimentação › Mercado, Restaurante,
  iFood; Moradia; Transporte › Combustível, Uber/99…).
- `transactions`: conta, categoria (pode ser nula, ou seja "a classificar"), valor,
  data, descrição original, descrição normalizada/estabelecimento,
  `payment_method` (`pix`, `boleto`, `debito`, `credito`, `dinheiro`, `ted`,
  `outro`), `status` (`efetivada`/`prevista`), parcelamento (`installment_group_id`,
  `n`/`total`), `transfer_pair_id` para transferências entre contas,
  `invoice_month` para cartão, `import_batch_id` e `fingerprint` para não importar
  o mesmo lançamento duas vezes, além de `category_source` (`manual`, `regra`,
  `modelo_local`, `ia`) e `category_confidence`.
- **Faturas de cartão:** são calculadas a partir das compras, dos dias de fechamento e
  vencimento e dos pagamentos, e não guardadas como dado separado. Isso evita
  inconsistência.
- `budgets`: categoria, mês (ou recorrente), valor.
- `recurring_series`: despesas e receitas recorrentes detectadas ou confirmadas
  (assinaturas, aluguel, salário).
- **Memória da IA:** `categorization_rules` (padrão → categoria, criada a partir das
  suas correções), `ai_feedback` (cada sugestão aceita ou corrigida), `insights` (alertas
  gerados, lidos ou dispensados) e `ai_usage` (tokens e custo por chamada).
- `import_batches`, `settings`.

Na Fase 2, as tabelas ganham `owner_id`. O código já passa por repositórios, então
essa mudança fica concentrada em `src/data/`.

---

## 4. Camada de IA (o diferencial)

### Princípio: **local primeiro, LLM onde agrega**

| Recurso | Motor local (offline, grátis, instantâneo) | LLM (online, via `AIProvider`) |
|---|---|---|
| Categorização | 1º regras aprendidas com as suas correções; 2º classificador Naive Bayes sobre as palavras da descrição, treinado no seu histórico | Só para o que o local não resolve com confiança, com exemplos das suas correções no prompt (*few-shot*) |
| Recorrências | Detecção estatística (mesmo estabelecimento, valor parecido, intervalo de ~30 dias) | Dá nome e explica ("parece a assinatura da Netflix") |
| Gastos fora do normal | Desvio robusto (mediana/MAD) por categoria e por estabelecimento | Escreve o alerta em linguagem natural |
| Saldo projetado no fim do mês | Saldo atual + recorrentes previstas + run-rate das variáveis + faturas a vencer | Comentário e recomendações |
| Perguntas em linguagem natural | — | O LLM usa **ferramentas** (*tool use*) que **executam no aparelho**, por exemplo `somar_lancamentos({categoria, periodo})`, `listar_lancamentos`, `saldo_contas`. O LLM nunca escreve SQL e nunca recebe o banco inteiro |

**Como ele "aprende com o uso":**
1. Toda correção sua de categoria vira um registro em `ai_feedback`.
2. Correções repetidas para o mesmo estabelecimento viram uma **regra** automática,
   que você pode ver e editar.
3. O classificador local é re-treinado com o histórico (é leve e roda em milissegundos).
4. Os prompts do LLM incluem suas correções mais relevantes, então ele imita o
   seu jeito de classificar.
5. Os alertas que você dispensa baixam o peso de alertas parecidos.

### Interface desacoplada

```ts
interface AIProvider {
  id: string;                     // 'claude' | 'local' | 'proxy' | ...
  isAvailable(): Promise<boolean>; // sem internet/chave → false
  complete(req: AIRequest): Promise<AIResponse>; // mensagens + tools + saída estruturada
}
```

- **Fase 1:** dois adaptadores, escolhidos nas configurações do app:
  - `ClaudeProvider`, que chama a API da Anthropic. O modelo é configurável: um
    menor e barato (Haiku) para categorizar e um maior (Sonnet) para análises e
    perguntas.
  - `OpenAIProvider`, que chama a API da OpenAI (ChatGPT), com modelos configuráveis
    do mesmo jeito.

  As chaves são **suas** e ficam no Keychain do iPhone (SecureStore). No navegador do
  PC, que não tem um cofre equivalente, a chave fica no armazenamento local do site,
  só naquele computador. Os dois
  adaptadores falam o mesmo "idioma" interno (mensagens, ferramentas e saída
  estruturada), então trocar de provedor não muda nada no resto do app. Dá também para
  usar um provedor para categorizar e outro para conversar.
- **Consulta à internet:** quando a pergunta depende de informação externa (Selic,
  CDI, IPCA, cotação do dólar, rendimento de um título, notícia de um banco), o
  provedor usa a **busca na web nativa** dele: a ferramenta de web search da API do
  Claude ou a da OpenAI. Regras:
  - Fica **desligada por padrão** e é ativada nas configurações.
  - Só os termos da busca saem do aparelho, nunca os seus lançamentos.
  - A resposta mostra as fontes consultadas.
- **Sem internet ou sem chave:** o app continua funcionando inteiro. O motor local
  categoriza, detecta e projeta, e só o chat fica indisponível.
- **Futuro:** `LocalModelProvider` (modelo rodando no aparelho) ou `ProxyProvider`
  (o seu servidor), sem mexer nas telas.
- **Privacidade:** o LLM só recebe o necessário (descrições e agregados), nunca
  o banco inteiro. Cada chamada é registrada em `ai_usage`, para você acompanhar o custo.

---

## 5. Importação de extratos

- **OFX:** é o padrão que a maioria dos bancos brasileiros exporta (Itaú, Bradesco,
  BB, Santander, Caixa, Inter, Nubank…). Teremos um parser próprio, tolerante a OFX 1.x
  em SGML e codificação latin1, usando o `FITID` para não duplicar.
- **CSV:** não há padrão entre bancos. Os primeiros **presets** serão para os bancos
  que você usa: **Itaú** (conta e cartão), **Santander** (conta e cartão), **Mercado
  Pago** (relatório de movimentações da conta) e **XP** (conta digital e cartão).
  Haverá também um **mapeador de colunas** genérico, que lembra a configuração por
  banco. Os formatos serão validados com arquivos reais exportados por você, com
  valores fictícios ou anonimizados. Suporta datas `dd/mm/aaaa`, valores `1.234,56` e sinal ou
  coluna de débito/crédito.
- **Fluxo:** escolher o arquivo → pré-visualizar → remover duplicados
  (`fingerprint` = conta + data + valor + descrição normalizada) → categorizar em lote
  (motor local + IA) → revisar → confirmar. Toda importação pode ser desfeita como um
  lote só.

## 6. Backup e exportação

- **Backup completo:** um arquivo `.json` versionado com todas as tabelas, salvo
  pelo menu de compartilhar do iOS no app Arquivos, no iCloud Drive ou enviado por
  e-mail. A restauração valida a versão do arquivo e roda as migrações necessárias.
- **Exportar lançamentos em CSV**, para planilhas.
- O app avisa "último backup há X dias".
- Opcional depois: backup criptografado com senha.

---

## 7. ⚠️ Decisões que podem dificultar o futuro

| Decisão | Risco | Como mitigamos |
|---|---|---|
| **Chave da API dentro do app** | Aceitável só para uso pessoal. **Num produto comercial seria vazamento de chave** e custo descontrolado | A IA fica atrás do `AIProvider`. Na Fase 2 entra um `ProxyProvider` (backend próprio com autenticação, limites e cobrança) sem mudar as telas |
| SQLite no **web/desktop** | `expo-sqlite` no web é experimental (WASM e exige cabeçalhos COOP/COEP). Na Etapa 0 vimos que as operações **síncronas** dele expiram no navegador | A camada de dados é **toda assíncrona**, e o app já roda no navegador (testado). Num desktop dá para trocar o adaptador (SQLite nativo via Tauri/Electron, ou o servidor) sem mexer nos repositórios |
| **Chaves de dois provedores** (Claude e OpenAI) | O mesmo risco da linha acima, em dobro | Mesma mitigação: na Fase 2 as duas ficam no servidor, atrás do `ProxyProvider` |
| Ficar preso ao **Expo Go** | Impede bibliotecas nativas que não vêm nele | Na Etapa 7 migramos para development build (EAS), e a restrição some |
| IDs autoincrementais ou exclusão física | Quebrariam a sincronização | Já adotamos UUIDs, `updated_at` e exclusão lógica |
| Lógica de negócio dentro das telas | Impede reaproveitar no servidor/desktop | Regras ficam em `domain/`, `ai/` e `import/` (TS puro, testado) |
| Particularidades de **iOS** (Face ID, iCloud) | Diferenças no Android | Tudo passa por `src/platform/`. O Android usa biometria e Google Drive equivalentes |
| Dados financeiros e LGPD na Fase 2 | Obrigações legais ao guardar dados de terceiros | Local-first já minimiza dados no servidor. Planejar consentimento e criptografia antes da Fase 2 |
| Open Finance (importação automática) | Exige agregador pago (Pluggy, Belvo…) e backend | Fora da Fase 1. Importação por arquivo atende |

---

## 8. Plano de desenvolvimento

> **Mudança de rota (decisão do usuário):** o desenvolvimento e o refinamento
> acontecem **primeiro no computador** (versão web, no navegador). A base de código
> é a mesma do celular, então o que for refinado no PC vai pronto para o iPhone e o
> Android. As telas se adaptam sozinhas: menu lateral em telas largas e abas embaixo
> no celular. A IA é a ferramenta principal e entra em todas as etapas.

| Etapa | Entrega | Onde testar |
|---|---|---|
| **0. Fundação** ✅ | Expo SDK 58. Camada de dados (Drizzle, migrações, UUID e exclusão lógica). Migração dos dados antigos. Categorias brasileiras. Tema claro/escuro | PC e Expo Go |
| **1. PC primeiro + IA central** ✅ | Layout de desktop. Contas e cartões (Itaú, Santander, XP e Mercado Pago em destaque). Camada de IA com Claude e ChatGPT. Categorização que aprende com as suas correções. Assistente que responde consultando os seus dados, com busca opcional na internet | **PC (navegador)** |
| **2. Dados reais com segurança** | **Backup e restauração** (arquivo JSON). Exportar CSV. Importar OFX e CSV (presets Itaú, Santander, XP e Mercado Pago). Deduplicação. Categorização em lote pela IA, com revisão | PC |
| **3. Cartão de crédito** | Faturas calculadas pelo fechamento e vencimento. Parcelamentos ("3x de R$ 100"). Pagamento de fatura como transferência. Lançamento rápido em poucos toques | PC |
| **4. Painel e orçamentos** | Gráficos (por categoria e evolução mensal), saldo por conta, faturas abertas, orçamentos com barras de progresso | PC |
| **5. IA v2: proativa** | Detecção de recorrentes (assinaturas, contas fixas). Gastos fora do normal. Saldo projetado no fim do mês. Feed de alertas e dicas. Conversas salvas. Mais ferramentas para o assistente | PC |
| **6. Instalável no PC + revisão mobile** | App instalável no computador (PWA ou app desktop com Tauri/Electron). Revisão de toque e teclado no iPhone pelo Expo Go | PC e iPhone |
| **7. Lojas** | Apple Developer e Google Play. Build pelo EAS. Face ID. Notificações. Publicação na App Store e na Play Store | iPhone e Android |
| **8. Fase 2 comercial** *(futuro)* | Servidor (o mesmo TypeScript): contas de usuário, sincronização entre aparelhos, proxy da IA (as chaves saem do app), assinatura | — |

---

## 9. Etapa 0 — o que foi feito

- **Expo SDK 53 → 58** (React Native 0.88, React 19.3). O Expo Go atual da App Store
  abre o projeto.
- **Camada de dados nova** (`src/data/`):
  - `schema.ts`: tabelas `accounts`, `categories`, `budgets`, `transactions` e
    `settings`. Todas têm UUID, `created_at`/`updated_at` e exclusão lógica
    (`deleted_at`), prontas para sincronização futura.
  - Migrações geradas pelo `drizzle-kit` em `drizzle/` e embutidas no app por
    `scripts/bundle-migrations.js`. Um teste falha se o arquivo embutido ficar
    desatualizado.
  - `setup.ts`: aplica as migrações, cria a conta "Carteira" e as categorias
    brasileiras, e **migra os dados da primeira versão do app** (categorias,
    orçamentos e lançamentos) sem perder nada.
  - Repositórios (`repositories/`) são o único acesso aos dados. Toda gravação passa
    por uma fila de transações (`ctx.write`), e as telas se atualizam sozinhas pelo
    barramento de mudanças.
  - Tudo é **assíncrono** e independe do driver: expo-sqlite no app, better-sqlite3
    nos testes.
- **Domínio** (`src/domain/`, TS puro e testado): tipos novos (Pix, boleto,
  parcelas, transferências, fatura, origem da categorização para a IA), árvore de
  categorias, resumo do mês (transferências não contam como gasto, e o orçamento da
  categoria-mãe soma as subcategorias), datas no formato brasileiro, instituições.
- **Telas** com tema claro/escuro automático:
  - Resumo: gastos, receitas, resultado, saldo por conta e ameaças ao orçamento.
  - Lançamentos: navegação por mês e formulário em modal para despesa, receita ou
    transferência, com subcategoria e forma de pagamento.
  - Categorias: árvore com orçamento, criação, edição e exclusão.
  - Previsões.
- **Verificação:** 56 testes automatizados, TypeScript e lint sem erros, bundle de
  iOS gerado. O fluxo completo também foi testado num navegador automatizado, nos
  temas claro e escuro: criar despesa e receita, editar, definir orçamento e
  recarregar para confirmar que os dados persistem.

---

## 10. Etapa 1 — o que foi feito (PC primeiro + IA central)

- **Desktop:** em janelas largas (≥ 900 px) a navegação vira um **menu lateral** e o
  conteúdo fica numa coluna centralizada. No celular continuam as abas embaixo. É a
  mesma tela, sem código separado. As caixas de diálogo agora funcionam também no
  navegador (`src/platform/dialogs.ts`).
- **Contas e cartões:** cadastro com tipo, banco (Itaú, Santander, XP e Mercado Pago
  primeiro), saldo inicial e, para cartões, limite e dias de fechamento e vencimento.
  Também é possível arquivar.
- **Camada de IA** (`src/ai/`):
  - `types.ts` define o contrato (`AIProvider`). `providers/claude.ts` e
    `providers/openai.ts` usam os **SDKs oficiais**.
  - **Claude:** por padrão, Opus 5.5 nas duas funções, configurável para Sonnet 5.5 ou
    Haiku 5.5 (mais baratos). As chamadas usam o *fallback* do lado do servidor,
    `fallbacks: "default"`: se o modelo recusar, outro modelo atende.
  - **ChatGPT:** Responses API, GPT-5.5 para o assistente e GPT-5.4 mini para
    categorizar, também configuráveis.
  - Chaves no Keychain (celular) ou no armazenamento local do navegador (PC).
- **Categorização que aprende** (`src/ai/categorizer/`):
  1. **Regras:** a última escolha manual para o mesmo estabelecimento vence. Nomes de
     extrato são normalizados, então "IFD*IFOOD 12/03" e "Ifood" contam como o mesmo.
  2. **Modelo local** (Naive Bayes) treinado no seu histórico, no próprio aparelho,
     offline e de graça.
  3. **IA na nuvem** só quando o modelo local não tem certeza. Ela recebe a lista
     fechada de categorias (não pode inventar uma) e exemplos de como **você**
     classifica.

  No formulário, a sugestão aparece sozinha enquanto você digita. Corrigir ensina o
  app. Cada lançamento guarda **quem** escolheu a categoria (`category_source`).
- **Assistente** (aba Assistente):
  - A IA responde em português usando **ferramentas que rodam no aparelho**:
    `resumo_periodo`, `buscar_lancamentos`, `gastos_por_mes`, `saldos_contas`,
    `orcamentos_do_mes` e `listar_categorias`.
  - O provedor recebe só os resultados agregados de cada consulta, nunca o banco
    inteiro.
  - Com a busca na internet ligada, usa a busca nativa do provedor e mostra as fontes.
- **Correção de compatibilidade:** os SDKs de IA têm um ciclo de importação que quebra
  no bundler do Expo. O `metro.config.js` resolve o build CommonJS deles. Isso foi
  validado no navegador e no bundle de iOS.
- **Verificação:**
  - 95 testes automatizados, com os provedores testados contra respostas HTTP
    simuladas.
  - Teste de ponta a ponta no navegador, com a API do Claude e a da OpenAI simuladas:
    configurar a chave, testar a conexão, criar contas e cartão, receber a sugestão da
    IA, corrigir (na vez seguinte a regra aprendida resolve **sem chamar a IA**) e
    perguntar ao assistente, que respondeu com os dados reais do banco local.
