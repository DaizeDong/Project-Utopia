// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 1) — local-only run
// leaderboard persisted in localStorage at `utopia:leaderboard:v1`.
//
// Data lifecycle:
//   - `recordRunResult(entry)` validates / clamps an entry, prepends to the
//     in-memory list, sorts by score desc, truncates to MAX_ENTRIES (20).
//     Then attempts to mirror to localStorage. ALL setItem paths are
//     wrapped in try/catch so QuotaExceededError or Safari private-mode
//     setItem failures NEVER block the calling end-phase transition
//     (Round-6 plan §5 R1).
//   - `listTopByScore(limit)` returns the top-N by score desc.
//   - `listRecent(limit)` returns the most recent N by ts desc.
//   - `clear()` removes the localStorage key and empties the in-memory list.
//   - `exportJson()` serialises the current list for share/clipboard.
//
// Schema (single-version v1, no migration path needed yet):
//   { id, ts, seed, templateId, templateName, scenarioId,
//     survivedSec, score, devIndex, deaths, workers, cause }
//
// Schema validation on load: any entry missing `score` (number) OR `ts`
// (number) is dropped; corrupt JSON returns []. The caller never sees the
// corrupt payload.

export const LEADERBOARD_STORAGE_KEY = "utopia:leaderboard:v1";
export const LEADERBOARD_MAX_ENTRIES = 20;

const ALLOWED_CAUSES = new Set(["loss", "abandon", "crash", "max_days_reached"]);

function nowMs() {
  if (typeof Date !== "undefined" && typeof Date.now === "function") return Date.now();
  return new Date().getTime();
}

function makeId() {
  // Cheap unique-ish id for ordering ties; Math.random is acceptable here
  // (no determinism contract — leaderboard is local-only and persists across
  // sessions, so ts collisions on a fast machine are easy to hit).
  const rnd = Math.floor(Math.random() * 0xffffff).toString(36);
  return `r${nowMs().toString(36)}${rnd}`;
}

function sanitizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const score = Number(raw.score);
  const ts = Number(raw.ts);
  if (!Number.isFinite(score) || !Number.isFinite(ts)) return null;
  const cause = ALLOWED_CAUSES.has(String(raw.cause)) ? String(raw.cause) : "loss";
  const entry = {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : makeId(),
    ts,
    seed: raw.seed === null || raw.seed === undefined ? "" : String(raw.seed),
    templateId: typeof raw.templateId === "string" ? raw.templateId : "",
    templateName: typeof raw.templateName === "string" ? raw.templateName : "",
    scenarioId: typeof raw.scenarioId === "string" ? raw.scenarioId : "",
    survivedSec: Math.max(0, Math.floor(Number(raw.survivedSec) || 0)),
    score: Math.floor(score),
    devIndex: Math.max(0, Math.round(Number(raw.devIndex) || 0)),
    deaths: Math.max(0, Math.floor(Number(raw.deaths) || 0)),
    workers: Math.max(0, Math.floor(Number(raw.workers) || 0)),
    cause,
  };
  return entry;
}

function compareByScoreDesc(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return b.ts - a.ts;
}

function compareByTsDesc(a, b) {
  return b.ts - a.ts;
}

function safeReadStorage(storage) {
  if (!storage || typeof storage.getItem !== "function") return [];
  let raw;
  try {
    raw = storage.getItem(LEADERBOARD_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — return empty list per plan §4 Step 7a.
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cleaned = [];
  for (const entry of parsed) {
    const sane = sanitizeEntry(entry);
    if (sane) cleaned.push(sane);
  }
  cleaned.sort(compareByScoreDesc);
  return cleaned.slice(0, LEADERBOARD_MAX_ENTRIES);
}

function safeWriteStorage(storage, list) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    // QuotaExceededError, Safari private-mode, or any other storage failure
    // is logged once and swallowed — the in-memory list still serves the
    // current session per plan §5 R1.
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      try {
        console.warn(`[leaderboardService] storage write failed: ${err?.message ?? err}`);
      } catch {
        // even console.warn can throw in some test environments; ignore
      }
    }
    return false;
  }
}

function safeClearStorage(storage) {
  if (!storage || typeof storage.removeItem !== "function") return false;
  try {
    storage.removeItem(LEADERBOARD_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createLeaderboardService(storage = null) {
  // Lazy-load from storage on first construction. Subsequent reads use the
  // in-memory `entries` cache (kept sorted desc-by-score) so listTopByScore
  // and listRecent never hit JSON.parse on the hot path.
  let entries = safeReadStorage(storage);

  function persist() {
    return safeWriteStorage(storage, entries);
  }

  return {
    recordRunResult(rawEntry) {
      const sane = sanitizeEntry(rawEntry);
      if (!sane) return { ok: false, reason: "invalid_entry" };
      // De-dup by id (caller may pass an existing id when replaying).
      entries = entries.filter((e) => e.id !== sane.id);
      entries.push(sane);
      entries.sort(compareByScoreDesc);
      if (entries.length > LEADERBOARD_MAX_ENTRIES) {
        entries = entries.slice(0, LEADERBOARD_MAX_ENTRIES);
      }
      const persisted = persist();
      return { ok: true, persisted, entry: sane };
    },

    listTopByScore(limit = LEADERBOARD_MAX_ENTRIES) {
      const cap = Math.max(0, Math.floor(Number(limit) || 0));
      // entries is already sorted desc-by-score after every recordRunResult.
      return entries.slice(0, cap);
    },

    listRecent(limit = 5) {
      const cap = Math.max(0, Math.floor(Number(limit) || 0));
      return entries.slice().sort(compareByTsDesc).slice(0, cap);
    },

    findRankBySeed(seed) {
      // Returns 1-based rank of the latest entry matching the seed, or 0 if
      // none. Used by GameStateOverlay's end-phase seed chip suffix (#X of N).
      const seedStr = seed === null || seed === undefined ? "" : String(seed);
      if (!seedStr) return { rank: 0, total: entries.length };
      // entries is already sorted score-desc, so the rank is the index+1 of
      // the highest-score entry matching this seed.
      for (let i = 0; i < entries.length; i += 1) {
        if (entries[i].seed === seedStr) return { rank: i + 1, total: entries.length };
      }
      return { rank: 0, total: entries.length };
    },

    clear() {
      entries = [];
      safeClearStorage(storage);
      return { ok: true };
    },

    exportJson() {
      return `${JSON.stringify(entries, null, 2)}\n`;
    },

    // Test seam: lets unit tests inspect the cache without going through
    // localStorage (Node does not provide one by default).
    _inspectEntries() {
      return entries.slice();
    },
  };
}

// v0.8.2 Round-6 Wave-3 02c-speedrunner (Step 7c) — small helper used by the
// integration test so the test can assert "speedrunner finishes a run, opens
// boot screen, sees their entry" without standing up a full GameApp. The
// helper extracts the same fields as GameApp #evaluateRunOutcome (Step 2b).
export function recordRunResultFromState(state, leaderboardService, options = {}) {
  if (!state || !leaderboardService || typeof leaderboardService.recordRunResult !== "function") {
    return { ok: false, reason: "missing_input" };
  }
  const cause = String(options.cause ?? state.session?.outcome ?? "loss");
  return leaderboardService.recordRunResult({
    ts: nowMs(),
    seed: state.world?.mapSeed ?? "",
    templateId: state.world?.mapTemplateId ?? "",
    templateName: state.world?.mapTemplateName ?? "",
    scenarioId: state.gameplay?.scenario?.id ?? "",
    survivedSec: Math.floor(Number(state.metrics?.timeSec ?? 0)),
    score: Math.floor(Number(state.metrics?.survivalScore ?? 0)),
    devIndex: Math.round(Number(state.gameplay?.devIndexSmoothed ?? state.gameplay?.devIndex ?? 0)),
    deaths: Math.floor(Number(state.metrics?.deathsTotal ?? 0)),
    workers: Math.floor(Number(state.metrics?.populationStats?.workers ?? 0)),
    cause,
  });
}
