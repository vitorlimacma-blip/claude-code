# Finance App

Aplicativo de controle financeiro pessoal com inteligência artificial,
pensado para o contexto brasileiro (R$, Pix, boleto, cartão com fatura).
Uma única base de código (Expo + React Native + TypeScript) roda no iPhone,
no Android e no navegador.

Os dados ficam **somente no aparelho**, num banco SQLite local, sem servidor.
A arquitetura, as decisões e o plano de etapas estão em
[`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

**Etapa atual:** 1 (PC primeiro + IA central) concluída. Próxima: Etapa 2, com
backup e importação de extratos.

## Como usar no computador (principal nesta fase)

O app roda no navegador do seu PC com o **mesmo código** da versão de celular. Tudo o
que for refinado aqui vai pronto para o iPhone e o Android.

1. **Uma vez só:** instale o [Node.js LTS](https://nodejs.org) e o
   [Git](https://git-scm.com) e baixe o código:
   ```bash
   git clone https://github.com/vitorlimacma-blip/claude-code.git
   cd claude-code
   git checkout claude/finance-ai-app-e6keyb
   ```
2. **Para abrir o app**, sempre o mesmo comando, na pasta `finance-app`:
   ```bash
   node run.js
   ```
   O comando busca a versão mais nova do código, instala o que for preciso (demora
   alguns minutos só na primeira vez) e abre o app em **http://localhost:8081**. Use
   Chrome ou Edge. Para fechar, aperte `Ctrl+C` no terminal.

**Ativando a IA:** vá em **Ajustes › Inteligência artificial**, escolha **Claude** ou
**ChatGPT** e cole a sua chave de API:
- Claude: crie em console.anthropic.com › API Keys.
- ChatGPT: crie em platform.openai.com › API keys.

Toque em **Testar conexão**. O uso é cobrado pelo provedor, na sua conta. Sem chave, o
app funciona normalmente com a inteligência local, que aprende com as suas correções.

**Onde ficam os dados no PC:** dentro do navegador, só neste computador. **Não limpe
os dados de navegação de `localhost`** e use sempre o mesmo navegador. O backup em
arquivo chega na Etapa 2. Até lá, evite colocar algo que você não possa recriar.

## Testar no iPhone (opcional nesta fase)

Com o computador e o iPhone na mesma rede Wi-Fi:

1. Instale o app **Expo Go** pela App Store.
2. No computador, na pasta `finance-app`, rode `npx expo start`.
3. Aponte a **Câmera** do iPhone para o QR code que aparece no terminal.

Se o iPhone não conectar (rede corporativa), use `npx expo start --tunnel`. Nesse modo,
o computador precisa estar ligado para abrir o app, e os dados do celular ficam
separados dos do PC. A sincronização entre aparelhos é da Fase 2.

## O que já funciona

- **Assistente com IA:** pergunte em português ("quanto gastei com alimentação nos
  últimos 3 meses?", "como estão meus orçamentos?"). A IA consulta os seus lançamentos
  por ferramentas que rodam no app e, se você permitir, pesquisa na internet (Selic,
  CDI, IPCA…), citando as fontes.
- **Categorização que aprende:** ao digitar a descrição, o app sugere a categoria.
  Primeiro usa as suas escolhas anteriores, depois um modelo local e, se ainda tiver
  dúvida, a IA. Quando você corrige, ele aprende e não precisa perguntar de novo.
- **Contas e cartões:** Itaú, Santander, XP, Mercado Pago e outros. Cartões guardam
  limite e os dias de fechamento e vencimento.
- **Lançamentos:** despesas, receitas e transferências, com categoria, subcategoria,
  forma de pagamento (Pix, boleto, débito, crédito…), data e descrição. Navegação por
  mês.
- **Resumo do mês:** gastos, receitas, resultado, saldo por conta e "ameaças ao
  orçamento", com alerta quando o ritmo de gastos projeta estouro.
- **Categorias:** cerca de 70 categorias brasileiras já cadastradas, com orçamento
  mensal.
- **Previsões:** média diária e projeção do mês e do ano por categoria.
- **Layout adaptável:** menu lateral no computador e abas no celular. Tema claro e
  escuro.

## Estrutura do projeto

```
app/                    Telas e navegação (expo-router)
  (tabs)/                 Resumo, Lançamentos, Assistente, Categorias, Ajustes (+ Previsões)
  transaction/[id].tsx    Formulário de lançamento, com sugestão de categoria
  category/[id].tsx       Formulário de categoria
  account/[id].tsx        Formulário de conta/cartão
  accounts.tsx            Lista de contas
  ai-settings.tsx         Configuração da IA
src/
  domain/                 Regras de negócio em TypeScript puro (sem React/SQLite), testadas
  data/                   Banco de dados: schema, migrações, repositórios
  ai/                     IA: contrato, provedores (Claude, OpenAI), categorizador, assistente
  platform/               Diferenças entre plataformas (chaves seguras, diálogos)
  state/                  Ponte entre dados e telas (DataProvider, AIContext, useQuery)
  ui/                     Tema, layout e componentes visuais
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
