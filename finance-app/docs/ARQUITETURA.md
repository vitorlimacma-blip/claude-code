# Arquitetura e plano — App de finanças pessoais com IA

> Status: **proposta para aprovação** (nenhum código novo escrito ainda).
> Base existente: `finance-app/` (Expo SDK 53, SQLite, categorias, lançamentos,
> previsões run-rate e alertas de orçamento, com testes de domínio).

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
| Acesso a dados | **Drizzle ORM** | Tipado, migrações geradas, `useLiveQuery` reativo, **o mesmo schema funciona em Postgres** no futuro | Mais uma dependência. A alternativa é SQL puro (como hoje) + migrações manuais via `PRAGMA user_version` |
| Estado de UI | Zustand (leve) + live queries do Drizzle | Simples e sem boilerplate | Context (atual) fica verboso com o crescimento |
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

- **Fase 1:** `ClaudeProvider` chama a API da Anthropic direto do app com a **sua**
  chave, guardada no Keychain (SecureStore). O modelo é configurável: um modelo menor
  e barato (Haiku) para categorizar e um maior (Sonnet) para análises e perguntas.
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
- **CSV:** não há padrão entre bancos. Vamos ter **presets** (Nubank conta, Nubank
  cartão, Inter, C6, Itaú…) e um **mapeador de colunas** genérico, que lembra a
  configuração por banco. Suporta datas `dd/mm/aaaa`, valores `1.234,56` e sinal ou
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
| SQLite no **web/desktop** | `expo-sqlite` no web é experimental (WASM e exige cabeçalhos COOP/COEP) | Repositórios por interface: no desktop dá para usar outro adaptador (SQLite nativo via Tauri/Electron, ou o servidor) |
| Ficar preso ao **Expo Go** | Impede bibliotecas nativas que não vêm nele | Na Etapa 7 migramos para development build (EAS), e a restrição some |
| IDs autoincrementais ou exclusão física | Quebrariam a sincronização | Já adotamos UUIDs, `updated_at` e exclusão lógica |
| Lógica de negócio dentro das telas | Impede reaproveitar no servidor/desktop | Regras ficam em `domain/`, `ai/` e `import/` (TS puro, testado) |
| Particularidades de **iOS** (Face ID, iCloud) | Diferenças no Android | Tudo passa por `src/platform/`. O Android usa biometria e Google Drive equivalentes |
| Dados financeiros e LGPD na Fase 2 | Obrigações legais ao guardar dados de terceiros | Local-first já minimiza dados no servidor. Planejar consentimento e criptografia antes da Fase 2 |
| Open Finance (importação automática) | Exige agregador pago (Pluggy, Belvo…) e backend | Fora da Fase 1. Importação por arquivo atende |

---

## 8. Plano de desenvolvimento

Cada etapa termina com o app rodando no iPhone, testes passando e instruções de teste.

| Etapa | Entrega | Como testar no iPhone |
|---|---|---|
| **0. Fundação** | Atualizar para Expo SDK 58. Reorganizar pastas (seção 3). Drizzle + migrações. Novo modelo de dados com migração dos dados atuais. Categorias brasileiras pré-cadastradas. Tema claro/escuro | Expo Go |
| **1. Lançamento rápido + contas** | Cadastro de contas (corrente, carteira, cartão). Lançamento em até 3 toques (valor no teclado numérico → categoria sugerida → salvar). Forma de pagamento (Pix, boleto, débito, crédito…). Transferências. Editar e excluir. Busca e filtros | Expo Go |
| **2. IA v1: categorização que aprende** | `AIProvider` + `ClaudeProvider`. Tela de configuração da chave. Motor local (regras + Naive Bayes). Aprendizado a partir das correções. Indicador "sugerido pela IA" | Expo Go (com internet para a parte LLM) |
| **3. Importação + backup** | Importar OFX e CSV (presets + mapeador). Deduplicação. Categorização em lote com revisão. Backup e restauração em JSON. Exportar CSV | Expo Go (arquivos do app Arquivos/iCloud) |
| **4. Cartão de crédito** | Fechamento e vencimento. Faturas calculadas. Parcelamentos ("3x de R$ 100"). Pagamento de fatura como transferência | Expo Go |
| **5. Painel + orçamentos** | Resumo mensal, gráficos por categoria e por evolução, saldo por conta, faturas abertas. Orçamento por categoria com barras de progresso e alertas (aproveitando os `alerts.ts` atuais) | Expo Go |
| **6. IA v2: análise e conversa** | Chat com perguntas em linguagem natural (*tool use*). Detecção de recorrentes. Gastos fora do normal. Saldo projetado no fim do mês. Feed de insights | Expo Go |
| **7. App independente** | Face ID para abrir o app. Build via EAS (preview/ad hoc). EAS Update. Notificações locais de alertas | **App instalado no iPhone** (requer Apple Developer) |
| **8. Preparação para a Fase 2** *(futuro)* | Versão web/desktop. Backend Node (mesmo TS) com autenticação, sincronização e `ProxyProvider`. Multiusuário | — |

Ordem pensada para: **usar o app de verdade o mais cedo possível** (Etapa 1),
colocar a IA desde o começo (Etapa 2) e ter **backup antes de confiar dados reais
ao app** (Etapa 3).
