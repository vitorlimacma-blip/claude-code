#!/usr/bin/env node
// Abre o app no navegador com um único comando:  node run.js
// Se o app mostrar erro de cache (ex.: "EBUSY"), use:  node run.js limpar
// Para abrir no celular (Expo Go) em qualquer rede, use:  node run.js celular
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
const git = (args) => run('git', args, { stdio: 'pipe', encoding: 'utf8' });
let pull = git(['pull', '--ff-only']);
if (pull.status !== 0) {
  // The most common cause: "npm install" rewrote package-lock.json on this PC. That file is
  // regenerated from the repository's version, so it is safe to restore it and try again.
  const changed = (git(['status', '--porcelain']).stdout || '')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('??'))
    .map((l) => l.slice(3).trim());
  if (changed.length > 0 && changed.every((f) => f.endsWith('package-lock.json'))) {
    console.log('O package-lock.json foi alterado neste PC; restaurando a versão do repositório e tentando de novo…');
    git(['checkout', '--', ...changed]);
    pull = git(['pull', '--ff-only']);
  }
}
if (pull.status === 0) {
  console.log(pull.stdout.trim() || 'Código já está atualizado.');
} else {
  console.log('\x1b[33mNão foi possível atualizar o código agora. Seguindo com a versão que já está neste PC.\x1b[0m');
  console.log('Motivo informado pelo git:');
  console.log(`  ${(pull.stderr || pull.stdout || '').trim().split('\n').join('\n  ')}`);
  console.log('Se o motivo for "alterações locais", envie esta mensagem para o Claude.');
}

const lockHash = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'package-lock.json'))).digest('hex');
// The Expo command-line tool; if it is missing, node_modules is incomplete (e.g. an interrupted install).
const expoCli = path.join(root, 'node_modules', 'expo', 'bin', 'cli');
const installed = fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === lockHash && fs.existsSync(expoCli);
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
  if (!fs.existsSync(expoCli)) {
    fail(
      'A instalação terminou, mas o Expo não foi encontrado em node_modules.\n' +
        '  Apague a pasta "node_modules" dentro de finance-app e rode "node run.js" de novo.'
    );
  }
  fs.writeFileSync(stampFile, lockHash);
}

const clearCache = process.argv.includes('limpar');
if (clearCache) {
  step('Limpando o cache do app…');
  fs.rmSync(path.join(root, '.metro-cache'), { recursive: true, force: true });
}

// Tunnel mode routes the phone through the internet, so it works even when the
// PC and the phone can't see each other on the local network (corporate Wi-Fi,
// different networks, firewall).
// Expo's own tunnel needs a (free) Expo account login and copes better with corporate
// networks; without a login, fall back to an anonymous ngrok tunnel.
const phone = process.argv.includes('celular');
let tunnelArgs = [];
if (phone) {
  const loggedIn = spawnSync(process.execPath, [expoCli, 'whoami'], { cwd: root, stdio: 'ignore' }).status === 0;
  tunnelArgs = loggedIn ? ['--tunnel'] : ['--tunnel', 'ngrok'];
  step(
    `Modo celular: criando um túnel pela internet (${loggedIn ? 'conta Expo' : 'ngrok'}). ` +
      'Aguarde o QR code e escaneie com a câmera do iPhone.'
  );
  if (!loggedIn) {
    console.log('Se aparecer "ngrok tunnel took too long", crie uma conta grátis em expo.dev, rode "npx expo login" e tente de novo.');
  }
} else {
  step('Abrindo o app no navegador (http://localhost:8081). Para fechar, aperte Ctrl+C aqui.');
}
// Runs the project's own Expo CLI with this Node, so it doesn't depend on npx or on the PATH.
const expoArgs = ['start', '--web', ...tunnelArgs, ...(clearCache ? ['--clear'] : [])];
const app = spawn(process.execPath, [expoCli, ...expoArgs], { cwd: root, stdio: 'inherit' });
app.on('exit', (code) => process.exit(code ?? 0));
