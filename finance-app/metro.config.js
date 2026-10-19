const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);

// Keep Metro's cache inside the project instead of the system temp folder. On
// Windows, antivirus scans of %TEMP% lock cache files and Metro fails with
// "EBUSY: resource busy or locked". Delete the folder (or run
// `node run.js limpar`) to start from a clean cache.
config.cacheStores = [new FileStore({ root: path.join(__dirname, '.metro-cache') })];

// expo-sqlite's web implementation loads a WebAssembly binary (wa-sqlite);
// Metro needs to know to treat .wasm as a bundled asset, not source code.
config.resolver.assetExts.push('wasm');

// expo-sqlite on the web needs SharedArrayBuffer, which browsers only enable on
// cross-origin isolated pages. These headers do that for `npm run web`; a
// hosted web/desktop build must send the same headers.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

// The AI SDKs' ES-module builds contain an import cycle that Metro's module
// transform evaluates too early ("Cannot access ... before initialization").
// Their CommonJS builds don't have the problem, so resolve those instead.
const CJS_PACKAGES = ['@anthropic-ai/sdk', 'openai'];
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromCjsPackage = CJS_PACKAGES.some(
    (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`) || context.originModulePath.includes(`/node_modules/${pkg}/`)
  );
  const ctx = fromCjsPackage ? { ...context, unstable_conditionNames: ['require', 'default'] } : context;
  return defaultResolve ? defaultResolve(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
};

module.exports = config;
