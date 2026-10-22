#!/usr/bin/env node
// Runs the AI evaluation tests and writes docs/ai/evaluation-report.json with
// pass / fail / not_run for every case E01–E93 (contract §9). A case passes
// only when a test named after it ran and passed; "(parcial)" tests are kept
// as partial evidence and never turn a case into a pass.
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const casesDir = path.join(root, 'src/ai/eval/cases');
const cases = fs
  .readdirSync(casesDir)
  .sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(casesDir, f), 'utf8')));

// Why a case was not run yet, by the stage that implements it (docs/ai/architecture.md §2).
const PENDING = [
  [/^E(16|17|19|20|22|23|24|25|26|35|36|37|40)$/, 'Etapa 6.2: contrato de resposta, memória, base de conhecimento ou permissões ainda não implementados.'],
  [/^E21$/, 'Etapa 6.2: isolamento da memória por usuário. Só a parte das ferramentas foi verificada (teste parcial).'],
  [/^E(27|28|29|30|34)$/, 'Etapa 6.3: motor e gerenciador do modelo local; exige modelo real e, em parte, aparelho.'],
  [/^E(4\d|5\d|60)$/, 'Política e integração com modelo real: etapas 6.2 e 6.3. Sem modelo nesta sessão (rede bloqueada para os pesos).'],
  [/^E(6\d|7\d|80|81)$/, 'Identidade e comunicação com modelo real: etapas 6.2 e 6.3.'],
  [/^E(8[2-9]|9[0-3])$/, 'Etapa 6.3: planejamento de viagens (anexo M).'],
];

const out = path.join(root, '.ai-eval-jest.json');
spawnSync(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), 'src/ai/eval', '--json', `--outputFile=${out}`], {
  cwd: root,
  stdio: 'inherit',
});
const results = JSON.parse(fs.readFileSync(out, 'utf8'));
fs.rmSync(out, { force: true });
const tests = results.testResults.flatMap((file) =>
  file.assertionResults.map((a) => ({ title: a.title, status: a.status, file: path.relative(root, file.name) }))
);

const report = cases.map((c) => {
  const own = tests.filter((t) => t.title.startsWith(`${c.id} `));
  const full = own.filter((t) => !/\(parcial\)/.test(t.title));
  const partial = own.filter((t) => /\(parcial\)/.test(t.title));
  let status = 'not_run';
  if (full.length > 0) status = full.every((t) => t.status === 'passed') ? 'pass' : 'fail';
  const reason = status === 'not_run' ? (PENDING.find(([re]) => re.test(c.id)) ?? [null, 'Ainda não implementado.'])[1] : null;
  return {
    id: c.id,
    name: c.name,
    status,
    layer: full.length > 0 ? 'domain_without_model' : null,
    evidence: [...full, ...partial].map((t) => ({ test: t.title, file: t.file, result: t.status })),
    not_run_reason: reason,
  };
});

let commit = null;
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
} catch {}
const count = (s) => report.filter((r) => r.status === s).length;
const doc = {
  generated_at: new Date().toISOString(),
  app_commit: commit,
  model: null,
  note: 'Casos de domínio executados sem modelo contra o cenário sintético (anexo B) e o gabarito independente (anexo C). not_run não é aprovação. Nenhum caso que exige modelo foi executado: não há modelo instalado nesta etapa.',
  summary: { total: report.length, pass: count('pass'), fail: count('fail'), not_run: count('not_run') },
  cases: report,
};
fs.writeFileSync(path.join(root, 'docs/ai/evaluation-report.json'), JSON.stringify(doc, null, 2) + '\n');
console.log(`\nAvaliação: ${doc.summary.pass} pass, ${doc.summary.fail} fail, ${doc.summary.not_run} not_run de ${doc.summary.total}.`);
if (doc.summary.fail > 0) process.exit(1);
