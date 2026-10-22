# Alinhamento — registro do Claude (código, integrações e testes)

Este arquivo complementa o `ALINHAMENTO.md` do dono (ponte com o ChatGPT, que cuida de design, experiência e do
"cérebro" da IA). O `ALINHAMENTO.md` ainda não está no repositório, então o Claude não conseguiu lê-lo: este registro
fica separado para não conflitar com a cópia que existe só no PC. Quando o arquivo do dono for enviado ao repositório,
as anotações abaixo serão juntadas a ele.

Regra combinada: **nenhum design novo é aplicado sem comando do dono.** A interface atual segue o sistema Maré Clara.

## Situação em 2026-10-22 — Fase 7 concluída (aguardando aprovação)

### Avanços

- **Primeiro uso:** três passos puláveis.
  1. O que o app faz e como trata os dados.
  2. A primeira conta, com o saldo de hoje opcional.
  3. O primeiro lançamento.

  Também há a opção "Explorar com dados de demonstração", identificada como teste. Quem já tem dados (o caso do dono)
  não vê a introdução. Em Ajustes › Sobre o app há "Rever a introdução".
- **Avisos no Resumo** (logo abaixo da margem):
  - risco de caixa;
  - conta prevista sem lançamento;
  - contas a vencer;
  - orçamento estourado ou com estouro previsto.

  Cada aviso traz o motivo ("Base: …") e uma ação. Dispensar tem "Desfazer". Em Ajustes › Avisos e notificações dá
  para escolher os tipos e a antecedência.
- **Resumo diário no celular:** opcional e desligado por padrão.
  - A permissão só é pedida ao ligar.
  - No máximo uma notificação por dia.
  - Na tela bloqueada aparece só "Há N avisos", sem valores, a menos que a pessoa permita.
- **Open Finance:** só as interfaces (consentimento, estados da conexão, histórico de sincronização, importação sem
  duplicar e reconciliação com o que foi lançado à mão). Não há banco conectado. A tela "Conexão com bancos" só
  explica.

### Limitações

- **Notificações não testadas em aparelho.** A parte que agenda foi testada em código; a entrega no iPhone (Expo Go)
  depende de um teste do dono.
- **Antecedência limitada.** Os avisos de vencimento usam a previsão até o próximo recebimento. Uma conta que vence
  depois do próximo salário só vira aviso após esse salário.

### Pontos para o design (ChatGPT)

- **Introdução:** se for redesenhada, precisa continuar curta, pulável e honesta sobre os dados.
- **Cartão de aviso:** hoje reutiliza o cartão de "Para olhar", com um botão de fechar.
- **Notificação:** o texto padrão na tela bloqueada não leva valores. Qualquer mudança aí é decisão de privacidade, não
  só de design.

## Situação em 2026-10-22 — etapa 6.3 (aprovada)

### Avanços

- **Planejamento de metas e viagens:** o Assistente responde "cabe uma viagem de R$ X em tal data?" com um resultado
  explícito:
  - "cabe";
  - "cabe com ajuste", num cenário com corte de 20% nos gastos discricionários;
  - "não cabe";
  - "falta caixa na data";
  - "faltam dados".

  A resposta mostra os aportes mensais, as premissas e o que falta. Reservas nunca contam como dinheiro livre.
- **Modelo local, opcional e desligado por padrão:**
  - no computador, usa o Ollama, só em `localhost`;
  - no celular, usa `llama.rn`, mas só num development build;
  - fica em Ajustes › Inteligência artificial › Modelo local.
- **O modelo local só redige:**
  - recebe os números já calculados pelo app, com referências [E1], [E2]…;
  - se mudar um valor ou inventar uma referência, a resposta dele é descartada e aparece a resposta calculada;
  - uma falha local nunca manda a pergunta para a nuvem.
- **Instalação segura do modelo no aparelho:**
  - pede consentimento antes de baixar e confere o espaço livre;
  - o download pode ser pausado e retomado;
  - o arquivo é conferido por SHA-256 antes de ser ativado;
  - um arquivo parcial ou com hash diferente nunca é carregado.
- **Assistente:** cada resposta diz o modo usado: regras, modelo local ou provedor externo. "Cancelar" interrompe a
  geração do modelo local.

### Limitações (honestas)

- **Nenhum modelo real foi executado.** A rede desta sessão bloqueia o download dos pesos (huggingface.co,
  ollama.com). Os testes usam dublês, que provam as regras de segurança e não a qualidade do modelo. No navegador,
  o caminho completo foi conferido com um servidor de teste que imita o Ollama: tela "Pronto", resposta marcada como
  "Escrito pelo modelo local" e aviso visível quando o modelo falha.
- **Prova no iPhone pendente.** Faltam um development build e uma conta Apple Developer (ou um Android). O
  benchmark em aparelho segue "não executado".
- **Instalação no aparelho bloqueada.** O manifesto do modelo ainda não tem origem, tamanho e hash conferidos na
  fonte oficial, e o app recusa instalar sem eles.
- **Busca de conhecimento abaixo da meta.** A coleção cega acerta 66,7% (meta: 90%).
- **Preço de viagem.** Sem busca autorizada, o custo é tratado como dado faltante, nunca estimado.

### Pontos para o design e o "cérebro" (ChatGPT)

- **Estados da tela do modelo local que o design precisa cobrir:**
  - não instalado;
  - aguardando consentimento, com o tamanho;
  - baixando, pausado e verificando, com progresso;
  - pronto, escrevendo e indisponível, com o motivo;
  - sem espaço;
  - arquivo inválido.
- **Texto em geração.** Hoje ele não aparece em tempo real, porque só é mostrado depois de conferido. Se o novo
  design pedir texto aparecendo aos poucos, é preciso definir como marcar que ele ainda não foi conferido.
- **Comportamento da IA.** As regras de voz (L.1), os limites de capacidade e o contrato de resposta (fatos,
  evidências, premissas, dados faltantes) estão no código. Mudanças de comportamento vindas do alinhamento entram
  como decisões em `docs/decisoes.md`.

### Pendências

- **Do dono:** enviar o `ALINHAMENTO.md` ao repositório ou anexá-lo no chat.
- **Do dono (opcional):** testar o modelo local no PC com o Ollama, seguindo `docs/ai/user-setup.md`.
