# Avaliação da IA (somente testes)

Material do contrato `docs/ai/spec/PROMPT_UNICO_CLAUDE_V2.md`:

- `fixtures/B_scenario.json`: dados financeiros inteiramente sintéticos (anexo B).
- `fixtures/C_oracle.json`: gabarito independente (anexo C). Não alterar para um teste passar.
- `fixtures/M8_travel_scenario.json`: cenário e gabarito de viagem (anexo M.8).
- `cases/`: os 93 casos de aceitação (E01–E93).
- `scenario.ts`: carrega o anexo B numa base de teste descartável pelos repositórios do app.

Nada daqui pode ser importado pelo app, entrar no corpus, no prompt de produção ou em treino. O teste
`noEvalInApp.test.ts` garante a primeira regra. O relatório de execução é gerado por `npm run ai:eval` em
`docs/ai/evaluation-report.json`.
