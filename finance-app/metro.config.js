const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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

module.exports = config;
