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

## No iPhone (Expo Go)
Com o app **Expo Go** instalado no iPhone:

```
cd C:\Users\higramg_tecnico01\claude-code\finance-app
node run.js celular
```

Escaneie o QR code com a **Câmera** do iPhone. Esse modo cria um túnel pela internet, então
funciona mesmo que o PC e o celular estejam em redes diferentes.

- Se aparecer **"ngrok tunnel took too long"**: crie uma conta grátis em https://expo.dev,
  rode `npx expo login` uma vez e repita `node run.js celular`.
- Os dados do celular são separados dos dados do navegador do PC.

## Se o app mostrar erro de cache (ex.: "EBUSY: resource busy or locked")
Feche o terminal (Ctrl+C) e abra de novo limpando o cache:
```
node run.js limpar
```
A primeira abertura depois disso demora um pouco mais.

## Se o app não abrir ou não atualizar
Sinais de que o código do PC ficou desatualizado:

- aparece **"'expo' não é reconhecido como um comando"**;
- ou aparece **"Não foi possível atualizar"**;
- ou a instalação falha.

Isso costuma acontecer quando a pasta de dependências fica incompleta.

Rode no PowerShell, **um comando por vez**. Eles baixam a versão do GitHub e substituem o código deste PC:

```
cd C:\Users\higramg_tecnico01\claude-code
git reset --hard
git fetch origin claude/finance-ai-app-e6keyb
git checkout -B claude/finance-ai-app-e6keyb origin/claude/finance-ai-app-e6keyb
git log --oneline -1
```

O último comando mostra a versão que ficou no PC. Confira se é a mais recente que o Claude informou e depois rode:

```
cd finance-app
Remove-Item -Recurse -Force node_modules
node run.js
```

A primeira abertura depois disso demora alguns minutos, porque tudo é instalado de novo.

- **Seus dados não são apagados.** `git reset --hard` só desfaz alterações nos arquivos de código desta pasta. Os lançamentos ficam salvos no navegador (no PC) ou no Expo Go (no celular).
- **Se o `git fetch` der erro** (sem internet ou sem login no GitHub), copie a mensagem e envie para o Claude.
- **Se o `Remove-Item` disser que um arquivo está em uso**, feche o VS Code e os outros terminais abertos na pasta e tente de novo.
- Quando o `node run.js` não consegue atualizar, ele mostra o motivo. Envie essa mensagem para o Claude.

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
