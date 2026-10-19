# Finance App

Aplicativo de controle financeiro pessoal com inteligência artificial,
pensado para o contexto brasileiro (R$, Pix, boleto, cartão com fatura).
Uma única base de código (Expo + React Native + TypeScript) roda no iPhone,
no Android e no navegador.

Os dados ficam **somente no aparelho**, num banco SQLite local, sem servidor.
A arquitetura, as decisões e o plano de etapas estão em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

**Etapa atual:** 0 (Fundação) concluída. Próxima: Etapa 1, contas e lançamento rápido.

## Como testar no iPhone (grátis, sem Mac)

Você precisa de um computador (Windows, Mac ou Linux) e do iPhone **na mesma rede
Wi-Fi**. O computador "serve" o app e o iPhone o executa dentro do **Expo Go**.

1. **No computador, uma vez só:** instale o [Node.js LTS](https://nodejs.org) e o
   [Git](https://git-scm.com).
2. **No iPhone, uma vez só:** instale o app **Expo Go** pela App Store.
3. **No computador**, baixe o código e inicie o servidor:
   ```bash
   git clone https://github.com/vitorlimacma-blip/claude-code.git
   cd claude-code
   git checkout claude/finance-ai-app-e6keyb
   cd finance-app
   npm install
   npx expo start
   ```
4. Vai aparecer um **QR code** no terminal. Abra a **Câmera** do iPhone, aponte para
   o QR code e toque na notificação "Abrir no Expo Go".
5. Para atualizar depois: `git pull` e `npx expo start` de novo. Com o servidor
   rodando, o app recarrega sozinho quando o código muda.

**Problemas comuns**
- *O iPhone não conecta* (rede corporativa, Wi-Fi diferente): use
  `npx expo start --tunnel`. Funciona por qualquer rede.
- *"Project is incompatible with this version of Expo Go"*: atualize o Expo Go na
  App Store. O projeto usa o Expo SDK 58.

**Limitações desta fase**
- O computador precisa estar com o servidor rodando para **abrir** o app. Depois de
  carregado, o app funciona offline. Para um app independente, instalado de vez no
  iPhone, será preciso o Apple Developer Program (Etapa 7).
- Os dados ficam dentro do Expo Go. **Se você apagar o Expo Go, eles se perdem.**
  Por isso, não confie dados importantes ao app antes da Etapa 3, que traz o backup.

## Rodar no navegador (opcional)

```bash
npm run web
```

O banco SQLite também funciona no navegador. O servidor de desenvolvimento já envia os
cabeçalhos de segurança necessários (veja `metro.config.js`).

## O que já funciona

- **Resumo do mês:** gastos, receitas, resultado, saldo por conta e "ameaças ao
  orçamento". Uma categoria recebe alerta quando o ritmo de gastos projeta estouro
  antes do fim do mês.
- **Lançamentos:** despesas, receitas e transferências entre contas, com categoria,
  subcategoria, forma de pagamento (Pix, boleto, débito, crédito…), data e descrição.
  É possível editar, excluir e navegar por mês.
- **Categorias:** cerca de 70 categorias e subcategorias brasileiras já cadastradas
  (Alimentação › Mercado, Moradia › Condomínio, Transporte › Uber, 99 e táxi…). Dá
  para criar as suas e definir orçamento mensal.
- **Previsões:** média diária e projeção do mês e do ano por categoria.
- **Tema claro/escuro**, acompanhando a configuração do iPhone.

## Estrutura do projeto

```
app/                    Telas e navegação (expo-router)
  (tabs)/                 Resumo, Lançamentos, Categorias, Previsões
  transaction/[id].tsx    Formulário de lançamento (modal)
  category/[id].tsx       Formulário de categoria (modal)
src/
  domain/                 Regras de negócio em TypeScript puro (sem React/SQLite), testadas
  data/                   Banco de dados: schema, migrações, repositórios
  state/                  Ponte entre dados e telas (DataProvider, useQuery)
  ui/                     Tema e componentes visuais
drizzle/                Migrações SQL geradas (não editar à mão)
docs/                   Arquitetura e plano
```

## Desenvolvimento

```bash
npm test             # testes automatizados (domínio e banco de dados com SQLite real)
npm run typecheck    # verificação de tipos
npm run lint         # padrões de código
```

**Mudando o banco de dados:** edite `src/data/schema.ts` e rode
`npm run db:generate`. Isso cria uma nova migração em
`drizzle/` e atualiza `src/data/migrations.generated.ts`. Nunca edite uma migração
já gerada: aparelhos que já a executaram não vão executá-la de novo.
