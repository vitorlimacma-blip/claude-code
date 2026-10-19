# Como abrir o app no computador

## Todo dia
No terminal (PowerShell ou o terminal do Claude):

```
cd C:\Users\higramg_tecnico01\claude-code\finance-app
node run.js
```

Depois, abra **http://localhost:8081** no Chrome ou no Edge (se não abrir sozinho).

- Deixe o terminal aberto enquanto usa o app.
- Para fechar: **Ctrl+C** no terminal.
- O `node run.js` já baixa as atualizações (`git pull`) e instala o que faltar.

## Se o app mostrar erro de cache (ex.: "EBUSY: resource busy or locked")
Feche o terminal (Ctrl+C) e abra de novo limpando o cache:
```
node run.js limpar
```
A primeira abertura depois disso demora um pouco mais.

## Se der erro na instalação
```
cd C:\Users\higramg_tecnico01\claude-code\finance-app
git pull
Remove-Item -Recurse -Force node_modules
node run.js
```

## Primeira vez em outro computador
Instale o [Node.js LTS](https://nodejs.org) e o [Git](https://git-scm.com), depois:

```
cd C:\Users\SEU_USUARIO
git clone https://github.com/vitorlimacma-blip/claude-code.git
cd claude-code
git checkout claude/finance-ai-app-e6keyb
cd finance-app
node run.js
```
