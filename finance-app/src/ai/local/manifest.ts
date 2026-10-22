import type { ModelArtifact } from './manager';

/**
 * The model the phone would install (mirrors docs/ai/model-manifest.json).
 * Origin, revision, size and SHA-256 are null until verified at the official
 * source on a session with access to it; with any of them null, installation
 * stays blocked (never a guessed hash or URL).
 */
export const CANDIDATE_MODEL: ModelArtifact & { baseModel: string; quantization: string; license: string; contextTokens: number } = {
  id: 'qwen3.5-2b-q4_k_m-candidate',
  baseModel: 'Qwen/Qwen3.5-2B',
  quantization: 'Q4_K_M (candidato)',
  license: 'Apache-2.0 declarada no model card; conferir o artefato exato',
  filename: 'qwen3.5-2b-q4_k_m.gguf',
  url: null,
  sha256: null,
  sizeBytes: null,
  contextTokens: 2048,
};
