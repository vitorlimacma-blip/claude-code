# Modelo local: como ligar

O app funciona sem nenhum modelo: as respostas do Assistente são calculadas por regras no aparelho. Um modelo local
só **escreve a explicação** com os fatos que o app já calculou; se ele mudar um valor ou inventar uma referência, a
resposta dele é descartada e o app mostra a resposta calculada. Uma falha do modelo local **nunca** passa a pergunta
para a nuvem.

## No computador (Ollama)

1. Instale o Ollama: https://ollama.com/download
2. Baixe o modelo (uma vez, alguns GB):

   ```
   ollama pull qwen3.5:2b
   ```

   O nome deve existir na biblioteca do Ollama; se não existir, use outro modelo pequeno instalado e informe o nome
   no app.
3. Libere o app no navegador (o Ollama recusa páginas de outra origem). No Windows (PowerShell), feche o Ollama e:

   ```
   setx OLLAMA_ORIGINS "http://localhost:8081"
   ```

   Abra o Ollama de novo. (Se abrir o app em outra porta, use essa porta.)
4. No app: Ajustes › Inteligência artificial › **Modelo local** › ligue "Usar o Ollama deste computador", confira o
   nome do modelo e toque em **Verificar**. O estado deve ficar "Pronto".

O app só fala com `localhost`/`127.0.0.1`: as perguntas não saem do computador. Isso **não** prova que o modelo
funciona offline num celular.

## No iPhone/Android (development build)

O modelo no aparelho usa `llama.rn`, um módulo nativo que **não roda no Expo Go**. É preciso um development build:

1. `npx expo install llama.rn` e `npx expo prebuild`.
2. No arquivo de entrada do build, registrar o módulo antes de abrir o app:

   ```ts
   import { registerLlamaRn } from './src/ai/local/llamaRn';
   registerLlamaRn(require('llama.rn'));
   ```
3. Gerar o build (`eas build --profile development` ou Xcode/Android Studio). No iPhone isso exige uma conta Apple
   Developer.
4. Preencher `docs/ai/model-manifest.json` e `src/ai/local/manifest.ts` com URL, tamanho e SHA-256 conferidos na
   fonte oficial. Enquanto algum desses campos for nulo, a instalação fica bloqueada.

Hoje não há conta Apple Developer nem aparelho Android disponível: a prova no aparelho e as medições de
`docs/ai/device-benchmark.json` continuam **não executadas**.
