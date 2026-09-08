const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web implementation loads a WebAssembly binary (wa-sqlite);
// Metro needs to know to treat .wasm as a bundled asset, not source code.
config.resolver.assetExts.push('wasm');

module.exports = config;
