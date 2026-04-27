/**
 * DimensionPlugin — protocol definition for pluggable evaluation dimensions.
 *
 * Each benchmark dimension implements this protocol to integrate with
 * the unified benchmark framework. Dimensions are responsible for:
 * - Defining what scores they produce
 * - Collecting dimension-specific samples from a SimHarness run
 * - Computing deterministic self-scores from collected samples
 *
 * @typedef {object} DimensionPlugin
 * @property {string} id - Unique identifier (e.g., "perceiver")
 * @property {string} label - Human-readable label
 * @property {string[]} scoreDimensions - Names of score dimensions this plugin outputs
 * @property {(harness: SimHarness, opts: object) => Promise<object[]>} collectSamples
 * @property {(samples: object[], context: object) => Record<string, number>} selfScore
 * @property {(samples: object[], context: object) => string} [buildJudgePrompt]
 * @property {(response: string) => Record<string, number>} [parseJudgeResponse]
 */

/**
 * Validate that a plugin object conforms to the DimensionPlugin protocol.
 * Throws if invalid.
 *
 * @param {object} plugin
 */
export function validatePlugin(plugin) {
  const required = ['id', 'label', 'scoreDimensions', 'collectSamples', 'selfScore'];
  for (const key of required) {
    if (plugin[key] == null) {
      throw new Error(`DimensionPlugin "${plugin.id ?? '?'}" missing required field: ${key}`);
    }
  }
  if (!Array.isArray(plugin.scoreDimensions) || plugin.scoreDimensions.length === 0) {
    throw new Error(`DimensionPlugin "${plugin.id}" scoreDimensions must be a non-empty array`);
  }
  if (typeof plugin.collectSamples !== 'function') {
    throw new Error(`DimensionPlugin "${plugin.id}" collectSamples must be a function`);
  }
  if (typeof plugin.selfScore !== 'function') {
    throw new Error(`DimensionPlugin "${plugin.id}" selfScore must be a function`);
  }
}
