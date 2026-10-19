#!/usr/bin/env node
// Abre o app no navegador com um único comando:  node run.js
// Se o app mostrar erro de cache (ex.: "EBUSY"), use:  node run.js limpar
//
// 1. Baixa a versão mais recente do código (git pull), se possível.
// 2. Instala/atualiza as dependências só quando mudaram.
// 3. Inicia o app e abre o navegador em http://localhost:8081.
const { spawnSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const isWindows = process.platform === 'win32';
const stampFile = path.join(root, 'node_modules', '.instalacao-ok');

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: isWindows, ...options });
}

function step(message) {
  console.log(`\n\x1b[36m▶ ${message}\x1b[0m`);
}

function fail(message) {
  console.error(`\n\x1b[31m✖ ${message}\x1b[0m\n`);
  process.exit(1);
}

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) fail(`Node.js ${process.versions.node} é antigo demais. Instale a versão LTS em https://nodejs.org`);

step('Procurando atualizações do código…');
const pull = run('git', ['pull', '--ff-only'], { stdio: 'pipe', encoding: 'utf8' });
if (pull.status === 0) console.log(pull.stdout.trim() || 'Código já está atualizado.');
else console.log('Não foi possível atualizar agora (sem internet ou alterações locais). Seguindo com a versão atual.');

const lockHash = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex');
const installed = fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === lockHash;
if (!installed) {
  step('Instalando dependências (só na primeira vez ou quando houver novidades, pode levar alguns minutos)…');
  const install = run('npm', ['install', '--no-audit', '--no-fund']);
  if (install.status !== 0) {
    fail(
      'A instalação falhou.\n' +
        '  1. Feche outros terminais e editores abertos nesta pasta.\n' +
        '  2. Apague a pasta "node_modules" dentro de finance-app.\n' +
        '  3. Rode "node run.js" de novo.\n' +
        '  Se continuar, copie a mensagem de erro acima e envie para o Claude.'
    );
  }
  fs.writeFileSync(stampFile, lockHash);
}

const clearCache = process.argv.includes('limpar');
if (clearCache) {
  step('Limpando o cache do app…');
  fs.rmSync(path.join(root, '.metro-cache'), { recursive: true, force: true });
}

step('Abrindo o app no navegador (http://localhost:8081). Para fechar, aperte Ctrl+C aqui.');
const expoArgs = ['expo', 'start', '--web', ...(clearCache ? ['--clear'] : [])];
const app = spawn('npx', expoArgs, { cwd: root, stdio: 'inherit', shell: isWindows });
app.on('exit', (code) => process.exit(code ?? 0));
