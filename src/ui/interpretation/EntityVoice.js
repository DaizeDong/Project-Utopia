// v0.8.2 Round-6 Wave-3 (01e-innovation Step 1) — In-character voice pack.
//
// Translates the third-person English insight strings produced by
// WorldExplain.getEntityInsight into first-person worker monologue. The goal
// is to keep every number, label, and state-name from the original line
// readable, but rewrite the framing from "system analysis" to "worker
// thought".
//
// Contract:
//   humaniseInsightLine(rawLine, entity, opts?) → string
//     - opts.profile === "dev" (or any value other than "casual"/undefined)
//       returns the rawLine unchanged so engineers can still see the
//       diagnostic prose.
//     - When the line matches one of the 9 known WorldExplain patterns we
//       rewrite it into a first-person sentence; unrecognised inputs fall
//       through verbatim (never throw).
//
//   humaniseGroupVoice(focus, role) → string
//     - Translates "seek_task" / "harvest" / "deliver" etc. into a clause
//       fragment usable inside "The colony's plan is pushing me toward …".
//
//   pickVoicePackEntry(bucket, seed) → string
//     - Deterministic round-robin: returns bucket[seed % bucket.length].
//     - When `bucket` is empty / non-array OR `seed` is non-finite, returns
//       the empty string (caller decides fallback).
//     - Pure function — no Math.random, no DOM, no side effects. Safe for
//       long-horizon-determinism.test.js because the seed is passed in by
//       the caller (HUD typically uses a clock-derived integer).
//
// Plan: assignments/homework6/Agent-Feedback-Loop/Round6/Plans/01e-innovation.md

/**
 * Returns true when opts.profile signals a casual / default UI surface
 * (the player-facing path that wants the in-character voice). Dev profile
 * or explicit dev-mode short-circuits to verbatim passthrough.
 *
 * @param {{ profile?: string }} [opts]
 * @returns {boolean}
 */
function shouldHumanise(opts) {
  const profile = String(opts?.profile ?? "").toLowerCase();
  if (profile === "dev" || profile === "full") return false;
  return true;
}

/**
 * Pull a stable subject from the entity for first-person framing. We prefer
 * "I" / "I've" — entity.displayName is reserved for memory tags / family
 * lines elsewhere. Returns the literal pronoun the rewrite uses.
 *
 * @param {object} _entity
 * @returns {string}
 */
function selfPronoun(_entity) {
  return "I";
}

/**
 * Lower-case role label safe for in-fiction copy ("FARM" → "farm",
 * "WOOD" → "lumber"). Used by the gather-loop branch.
 *
 * @param {string} role
 * @returns {string}
 */
function prettyRole(role) {
  const r = String(role ?? "").toLowerCase();
  if (r === "wood") return "lumber";
  return r || "work";
}

/**
 * Translate WorldExplain insight strings into first-person worker monologue.
 * Returns the rawLine unchanged in dev profile or when no rewrite rule
 * matches — guarantees zero information loss.
 *
 * @param {string} rawLine
 * @param {object} entity
 * @param {{ profile?: string }} [opts]
 * @returns {string}
 */
export function humaniseInsightLine(rawLine, entity, opts) {
  const line = String(rawLine ?? "").trim();
  if (!line) return "";
  if (!shouldHumanise(opts)) return line;
  const me = selfPronoun(entity);

  // 1) Local survival rule (hunger threshold).
  if (/^Local survival rule is prioritizing food access/i.test(line)) {
    return `${me}'m running on empty — heading to the warehouse for a meal before anything else.`;
  }

  // 2) Local logistics rule (carry total > 0).
  let m = line.match(/^Local logistics rule sees ([\d.]+) carried resources/i);
  if (m) {
    const amount = m[1];
    return `${me}'m carrying about ${amount} units already — best to drop this off before grabbing more.`;
  }

  // 3) Carry pressure (carryAgeSec >= 5.5).
  m = line.match(/^Carry pressure has been building for ([\d.]+)s/i);
  if (m) {
    const sec = m[1];
    return `${me}'ve been hauling for nearly ${sec} seconds — time to drop this load at the depot.`;
  }

  // 4) Target warehouse inbound congestion.
  m = line.match(/^Target warehouse currently has (\d+) inbound workers/i);
  if (m) {
    const n = m[1];
    return `${me}'ll have to queue at the warehouse — ${n} other workers are already inbound, so unloading will be slower.`;
  }

  // 5) Wildlife pressure on target farm.
  m = line.match(/^Wildlife pressure is suppressing the target farm by about (\d+)%/i);
  if (m) {
    const pct = m[1];
    return `Wildlife is trampling my target farm — yields are down about ${pct}% on this loop.`;
  }

  // 6) Worker still in gather loop (carry low + worksite present).
  m = line.match(/^Worker is still in a gather loop because carry is low and a (\w+) worksite exists/i);
  if (m) {
    const role = prettyRole(m[1]);
    return `Carry's still light — ${me}'ll keep working the ${role} site until my hands are full.`;
  }

  // 7) Trader favoring a label.
  m = line.match(/^Trader is favoring (.+?); current trade yield bonus is x([\d.]+)\.?/i);
  if (m) {
    const label = m[1];
    const bonus = m[2];
    return `Caravan's drawn to ${label} — the trade payout there is running x${bonus} right now.`;
  }

  // 8) Saboteur pressuring a label.
  m = line.match(/^Saboteur is pressuring (.+?); current target has (\d+) nearby wall tiles\.?(.*)$/i);
  if (m) {
    const label = m[1];
    const walls = m[2];
    const tail = String(m[3] ?? "").trim();
    const blockedFrag = /Last sabotage run was blocked/i.test(tail)
      ? " The last raid bounced off the walls."
      : "";
    return `${me}'m staging a hit on ${label} — ${walls} wall tiles in the way.${blockedFrag}`;
  }

  // 9) Group AI biasing toward a target state.
  m = line.match(/^Group AI is currently biasing this unit toward (.+?)\.?$/i);
  if (m) {
    const stateName = m[1];
    const phrase = humaniseGroupVoice(stateName, entity?.role);
    return `The colony's plan is pushing me to ${phrase}.`;
  }

  // Unrecognised line — return verbatim (no information loss).
  return line;
}

/**
 * Translate a group-AI target state name (e.g. "seek_task", "harvest",
 * "deliver") into a clause fragment that fits inside a first-person
 * sentence. Returns the lowercased state when no rewrite matches.
 *
 * Used by EntityFocusPanel's whyBlock to reframe
 * "Group AI is currently biasing this unit toward seek_task" into
 * "The colony's plan is pushing me back to find work".
 *
 * @param {string} focus
 * @param {string} [role]
 * @returns {string}
 */
export function humaniseGroupVoice(focus, role) {
  const f = String(focus ?? "").trim().toLowerCase();
  if (!f) return "stay in formation";
  if (f === "seek_task") return "swing back and find new work";
  if (f === "harvest" || f === "gather") {
    const r = prettyRole(role);
    return `head out and gather from the ${r} site`;
  }
  if (f === "deliver" || f === "haul") return "haul this load back to base";
  if (f === "patrol") return "patrol the frontier and watch for trouble";
  if (f === "defend") return "fall back to the walls and brace";
  if (f === "rest") return "take a breather before the next push";
  if (f === "build") return "join the build queue at the worksite";
  if (f === "repair") return "patch up the damaged structure";
  if (f === "eat") return "stop at the larder and eat something";
  return f.replace(/_/g, " ");
}

/**
 * Pure deterministic round-robin selector. Returns bucket[seed mod len], or
 * "" when the bucket is empty / not an array. Non-finite seeds collapse to
 * index 0 so test stubs without `metrics.timeSec` still return something.
 *
 * Important: this function consumes a CALLER-SUPPLIED seed (the HUD passes
 * a clock-derived integer). It does NOT touch services.rng — the per-tick
 * RNG offset stays untouched, keeping long-horizon-determinism.test.js
 * green.
 *
 * @param {string[]} bucket
 * @param {number} seed
 * @returns {string}
 */
export function pickVoicePackEntry(bucket, seed) {
  if (!Array.isArray(bucket) || bucket.length === 0) return "";
  const len = bucket.length;
  const s = Number.isFinite(seed) ? Math.floor(Math.abs(Number(seed))) : 0;
  const idx = ((s % len) + len) % len;
  const entry = bucket[idx];
  return typeof entry === "string" ? entry : String(entry ?? "");
}
