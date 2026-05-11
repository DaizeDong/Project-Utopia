// AnchorInjector — protocol for seeding `harness.memoryStore` with anchor
// observations at simulation t=0 (or any specified tick).
//
// Why this exists:
//   MemoryDegradation expects opts.anchors to flow into the prompt context so
//   it can probe whether the LLM (a) verbally recalls the anchor token in
//   strategic-summaries (anchored_fact_recall) and (b) preserves the anchor's
//   implicit goals in directive distributions (action_grounded_recall).
//   Prior to this module, no plumbing wrote those anchors into the
//   memoryStore — every E5 (anchor decay) experiment ran on empty context.
//
// Anchor shape (matches MemoryDegradation):
//   { token: string, implicitGoals?: string[] }
//
// Each anchor becomes one MemoryStore observation:
//   text       = anchor.token (verbatim — recall checks substring containment)
//   timeSec    = atSec (default 0)
//   category   = "anchor"
//   importance = 5 (treat injected anchors as critical so they survive
//                   recency decay long enough for retrieval probes)
//
// MemoryStore API (observed at module path src/simulation/ai/memory/MemoryStore.js):
//   addObservation(timeSec, text, category, importance)
//   - clamps importance to [1,5]
//   - evicts oldest when over `maxObservations` cap (default 50)
//
// If the MemoryStore api ever changes, the injector falls back to a direct
// `observations` push so callers don't crash silently in tests.

/**
 * @typedef {object} Anchor
 * @property {string} token         — the verbal token to embed in memory
 * @property {string[]} [implicitGoals]  — optional action-grounded recall keys
 */

/**
 * Inject N anchors into a SimHarness's memoryStore so they become part of
 * the LLM's prompt context at the next strategic / policy decision.
 *
 * @param {{ memoryStore?: object }} harness — a SimHarness or shape-compatible carrier
 * @param {Anchor[]} anchors
 * @param {object} [opts]
 * @param {number} [opts.atSec=0]       — sim-second timestamp to record on each entry
 * @param {string} [opts.category="anchor"] — observation category bucket
 * @param {number} [opts.importance=5]  — observation importance (clamped to [1,5])
 * @returns {{ injected: number, skipped: number }}
 */
export function injectAnchors(harness, anchors, opts = {}) {
  const list = Array.isArray(anchors) ? anchors : [];
  const atSec = Number(opts.atSec ?? 0);
  const category = String(opts.category ?? "anchor");
  const importance = Number(opts.importance ?? 5);
  const memoryStore = harness?.memoryStore;
  let injected = 0;
  let skipped = 0;

  if (!memoryStore) {
    return { injected: 0, skipped: list.length };
  }

  const hasAddObservation = typeof memoryStore.addObservation === "function";
  const observationsArray = Array.isArray(memoryStore.observations) ? memoryStore.observations : null;

  for (const anchor of list) {
    if (!anchor || (!anchor.token && typeof anchor !== "string")) {
      skipped++;
      continue;
    }
    const token = String(anchor.token ?? anchor);
    if (!token) {
      skipped++;
      continue;
    }

    if (hasAddObservation) {
      memoryStore.addObservation(atSec, token, category, importance);
      injected++;
    } else if (observationsArray) {
      // Fallback: write directly. Schema mirrors MemoryStore.addObservation
      // so retrieve() / formatForPrompt() continue to work.
      observationsArray.push({
        timeSec: atSec,
        text: token,
        category,
        importance: Math.max(1, Math.min(5, importance)),
        type: "observation",
      });
      injected++;
    } else {
      skipped++;
    }
  }

  return { injected, skipped };
}
