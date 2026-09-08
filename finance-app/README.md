# Finance App

Aplicativo de gestão financeira pessoal, com foco em **previsões de gastos**
(diária, mensal e anual) e **alertas de estouro de orçamento** por categoria.
Uma única base de código (Expo + React Native + TypeScript) roda como app
mobile (iOS/Android) e como app web.

Nesta primeira fase o app roda **totalmente localmente**: todos os dados
ficam em um banco SQLite no próprio dispositivo (via `expo-sqlite`), sem
backend ou nuvem. Isso mantém o app simples de começar e evita qualquer
dependência de rede; um backend com sincronização entre dispositivos pode
ser adicionado depois sem reescrever a camada de domínio, que já é
independente de onde os dados são persistidos.

## Como rodar

```bash
npm install
npm run web       # versão web, abre no navegador
npm run android   # emulador/dispositivo Android
npm run ios       # simulador iOS (requer macOS)
npm start         # abre o menu do Expo (escolher a plataforma)
```

## Funcionalidades

- **Categorias de despesa** com cor e orçamento mensal opcional.
- **Lançamentos** de despesas e receitas, associados a uma categoria.
- **Resumo do mês**: total gasto, receita e saldo, além da lista de
  "ameaças ao orçamento" — categorias cujo orçamento mensal já foi
  estourado, está perto de estourar, ou está projetado para estourar até
  o fim do mês no ritmo atual de gastos.
- **Previsões**: para cada categoria, média diária de gastos e projeção
  linear (run-rate) do total do mês e do total do ano, a partir do que já
  foi gasto.

## Como as previsões e alertas são calculadas

A lógica financeira fica isolada em `src/domain/` (`forecast.ts` e
`alerts.ts`), sem nenhuma dependência de UI ou de banco de dados, e é
coberta por testes unitários em `src/domain/__tests__/`.

- **Projeção (run-rate)**: `total_gasto_no_período / dias_decorridos *
  dias_totais_do_período`. Ou seja, assume que o ritmo de gastos
  observado até agora se mantém até o fim do mês/ano.
- **Alerta mensal por categoria** (só para categorias com orçamento
  definido), do menos para o mais severo:
  - `ok`: menos de 80% do orçamento gasto até agora.
  - `warning`: 80%+ do orçamento já gasto, mas a projeção ainda fica
    dentro do orçamento.
  - `projected_overrun` ("ameaça de estouro"): o gasto até agora ainda
    está dentro do orçamento, mas o ritmo atual projeta um estouro até o
    fim do mês — o alerta mais importante do app, pois avisa **antes**
    do estouro acontecer.
  - `exceeded`: o orçamento já foi estourado neste mês.

## Estrutura do projeto

```
app/                    Telas e navegação (expo-router)
  (tabs)/                Resumo, Lançamentos, Categorias, Previsões
src/
  domain/                Tipos e lógica financeira pura (forecast, alerts)
  db/                     Cliente SQLite e repositório (CRUD)
  state/                  Contexto React que liga banco + domínio às telas
  components/             Componentes de UI reutilizáveis
  utils/                  Formatação de moeda e datas
```

## Testes e verificação de tipos

```bash
npm test        # testes unitários da lógica de previsões/alertas
npm run typecheck
npm run lint
```

## Próximos passos possíveis

- Editar categorias e lançamentos existentes (hoje só é possível criar e
  remover).
- Gráficos de evolução de gastos por categoria.
- Exportar/importar dados (backup local).
- Backend opcional para sincronizar entre dispositivos, mantendo a mesma
  camada de domínio (`src/domain/`) já testada.
