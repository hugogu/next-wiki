/**
 * Compatibility surface. OpenRouter capability detection moved behind the
 * shared Model Capability Detector contract in `model-detectors/`. These
 * re-exports keep existing importers (`ai-admin.ts`, tests) working while the
 * canonical implementation lives in `model-detectors/openrouter.ts`.
 */
export {
  clearDetectorCache,
  detectCapabilities,
  listEmbeddingModels,
  type DetectedCapabilities,
  type DetectedEmbeddingModel,
} from './model-detectors/openrouter';
