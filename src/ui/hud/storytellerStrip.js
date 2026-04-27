// v0.8.2 Round-0 01e-innovation — Pure computation for the HUD Storyteller
// strip. Extracted from HUDController so the computation is trivially
// testable without a DOM: given a GameState-like object, return the
// already-formatted single-line string that #storytellerStrip should show.
//
// The resulting string is prefixed with the policy source so players can
// tell at a glance whether the colony is driven by the live LLM agent or
// the deterministic rule-based fallback — both of which are legitimate
// "storytellers" in the Project Utopia design. When no workers policy is
// available (menu phase, before the first decision tick), we render the
// idle copy that still communicates fallback-as-feature instead of silence.
//
// v0.8.2 Round-1 01e-innovation — augmented with `computeStorytellerStripModel`,
// a DOM-friendly { mode, focusText, summaryText, prefix } shape that
// HUDController renders as a colored badge + focus + summary triplet. The
// legacy `computeStorytellerStripText` single-line function is kept
// unchanged for the fallback path + existing test coverage.
//
// D3 arbitration (Plans/summary.md) — badge copy is player-facing:
//   mode "llm"      → prefix "WHISPER"  (live LLM model in charge)
//   mode "fallback" → prefix "DIRECTOR" (deterministic rule-based fallback)
//   mode "idle"     → prefix "DRIFT"    (no policy yet — menu / first tick)
//
// v0.8.2 Round-1 02d-roleplayer — model now also surfaces `beatText`: the
// latest salient event-trace line (SABOTAGE / SHORTAGE / VISITOR / WEATHER /
// death / warehouse fire) within a 15-second horizon. HUDController renders
// this into a dedicated `#storytellerBeat` child span (D4 arbitration),
// **not** spliced into the main summary textContent — so the legacy pure
// function `computeStorytellerStripText` is left untouched. When no salient
// beat is present, `beatText` is `null` and the HUD simply hides the span.

// v0.8.2 Round-1 02d-roleplayer — salient event-trace filters. We only
// surface the 6 tag families that move the player's story forward
// (sabotage / shortage / visitor arrival / weather shift / death / fire).
// Anything else (routine event lifecycle transitions, raid cooldown drops,
// spawn/drop bookkeeping) stays buried in the DeveloperPanel.
import { describeMapTemplate } from "../../world/grid/Grid.js";
import { pickVoicePackEntry } from "../interpretation/EntityVoice.js";

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 7) — kinship & rivalry beats.
// Three new patterns plumbed in: obituary line ("X, farming specialist,
// died of starvation near the west lumber route"), birth-with-parent ("Y was
// born to Z"), and rival relief ("Felt grim relief at …'s death"). 01e &
// 02e Wave-3 plans append more patterns to this array AFTER 02d lands; the
// frozen-array pattern means each subsequent commit replaces (not mutates)
// the export — see Stage B §8 sequencing in Round6/Plans/summary.md.
//
// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 1) — Author Voice Channel
// expansion. Five new beat families surface friendship / birth-of /
// named-after / dream / grieving prose that was previously locked inside
// Worker memory streams. Patterns layered ON TOP of the 02d kinship beats
// per Stage B summary.md §3 D2 (15-rule SALIENT union). NARRATIVE_BEAT_MAX_AGE_SEC
// raised 15 → 20 because friendship/dream lines aren't urgent and players
// are happy to "delay-consume" them via the strip's dwell window.
const SALIENT_BEAT_PATTERNS = Object.freeze([
  // Obituary form (richest — must be checked first by the priority pass).
  /^.+, .+, died of /i,
  /\bborn to\b/i,
  /\bmother of\b/i,
  /Felt grim relief/i,
  /\[SABOTAGE\]/i,
  /\[SHORTAGE\]/i,
  /\[VISITOR\]/i,
  /\[WEATHER\]/i,
  /\bdied \(/i,
  /warehouse fire/i,
  // 02e-indie-critic Step 1 — friendship / birth-of / named-after / dream /
  // grieving. Each is anchored on a stable verb/noun phrase so noisy event-
  // trace lines (e.g. "intent: friend-checkin") don't false-match.
  /\bbecame\b.*\bfriend\b/i,
  /\bbirth of\b/i,
  /\bnamed after\b/i,
  /\bdream\b/i,
  /\bgrieving\b/i,
]);

// v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 7) — obituary > birth > rivalry
// > friendship > fire/vermin > visitor priority bands. The first matching
// band wins, so a fresh death always trumps a same-tick warehouse fire.
const HIGH_PRIORITY_PATTERNS = Object.freeze([
  /^.+, .+, died of /i,           // obituary
  /\bborn to\b/i,                  // birth-with-parent
  /Felt grim relief/i,             // rivalry beat
]);

// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 1) — raised 15 → 20s so the
// friendship / birth / dream / grieving beats added below stay on the strip
// long enough to actually be read (these aren't sabotage-urgent; players
// happily delay-consume them via the dwell window).
const NARRATIVE_BEAT_MAX_AGE_SEC = 20;
// Raised from 140 → 180 for obituary lines that include both backstory and
// scenario-anchor labels ("Aila-2, farming specialist swift temperament,
// died of starvation near the west lumber route" — typical 90-110 chars but
// long-anchor scenarios push above the previous cap).
const NARRATIVE_BEAT_MAX_LEN = 180;

/**
 * Strip the leading `[12.3s]` timestamp prefix from an eventTrace line so
 * the player-facing beat reads cleanly. Returns both the cleaned line and
 * the parsed age (now - traceSec); if the prefix is malformed we fall
 * back to age=0 (render as "just now").
 *
 * @param {string} rawLine
 * @param {number} nowSec
 * @returns {{ line: string, ageSec: number }}
 */
function parseBeatLine(rawLine, nowSec) {
  const src = String(rawLine ?? "");
  const m = src.match(/^\[([\d.]+)s\]\s*(.+)$/);
  if (!m) return { line: src.trim(), ageSec: 0 };
  const traceSec = Number(m[1]);
  const body = String(m[2] ?? "").trim();
  if (!Number.isFinite(traceSec)) return { line: body, ageSec: 0 };
  const age = Math.max(0, Number(nowSec ?? 0) - traceSec);
  return { line: body, ageSec: age };
}

/**
 * Pull the latest salient narrative beat out of `state.debug.eventTrace`.
 * The trace is maintained newest-first (via `unshift`), so we scan forward
 * and return the first entry whose body matches one of the 6 salient
 * tag patterns AND whose age is within NARRATIVE_BEAT_MAX_AGE_SEC.
 *
 * Pure function — no DOM, no side effects. Returns `null` when nothing
 * salient is within the horizon, which signals HUDController to hide the
 * `#storytellerBeat` child span.
 *
 * @param {object} state GameState-like with optional `debug.eventTrace` and
 *   `metrics.timeSec`.
 * @param {number} [nowSec] Override clock (for tests). Defaults to
 *   `state.metrics.timeSec ?? 0`.
 * @returns {{ line: string, ageSec: number } | null}
 */
export function extractLatestNarrativeBeat(state, nowSec) {
  const trace = Array.isArray(state?.debug?.eventTrace) ? state.debug.eventTrace : null;
  if (!trace || trace.length === 0) return null;
  const clockSec = Number.isFinite(nowSec)
    ? Number(nowSec)
    : Number(state?.metrics?.timeSec ?? 0);
  // v0.8.2 Round-6 Wave-3 (02d-roleplayer Step 7) — two-pass scan with
  // priority. First pass picks the latest within-horizon HIGH_PRIORITY beat
  // (obituary > birth > rivalry). If none, fall through to the legacy
  // single-pass scan that returns the first salient beat in arrival order.
  // Trace is newest-first via unshift; index 0 is the most recent entry.
  for (let i = 0; i < trace.length; i += 1) {
    const parsed = parseBeatLine(trace[i], clockSec);
    if (parsed.ageSec > NARRATIVE_BEAT_MAX_AGE_SEC) continue;
    let highPriority = false;
    for (const pat of HIGH_PRIORITY_PATTERNS) {
      if (pat.test(parsed.line)) { highPriority = true; break; }
    }
    if (highPriority) return parsed;
  }
  // Scan oldest index=0 first (which is actually newest given unshift()).
  for (let i = 0; i < trace.length; i += 1) {
    const parsed = parseBeatLine(trace[i], clockSec);
    // Age gate — skip stale beats. `ageSec === 0` (no parseable timestamp)
    // is treated as "just now" and passes the gate.
    if (parsed.ageSec > NARRATIVE_BEAT_MAX_AGE_SEC) continue;
    // Tag gate — must match one of the salient patterns.
    let salient = false;
    for (const pat of SALIENT_BEAT_PATTERNS) {
      if (pat.test(parsed.line)) { salient = true; break; }
    }
    if (!salient) continue;
    return parsed;
  }
  return null;
}

/**
 * Format an extracted beat into the single-line copy HUDController writes
 * into `#storytellerBeat`. Exported for testing; HUDController uses the
 * `beatText` field on `computeStorytellerStripModel`'s return value.
 *
 * @param {{ line: string, ageSec: number } | null} beat
 * @returns {string | null}
 */
function formatBeatText(beat) {
  if (!beat) return null;
  let body = String(beat.line ?? "").trim();
  if (!body) return null;
  // Clamp line length — event messages can be long (impact coordinates,
  // target labels); avoid overflowing the single-line strip.
  if (body.length > NARRATIVE_BEAT_MAX_LEN) {
    body = `${body.slice(0, NARRATIVE_BEAT_MAX_LEN - 1)}\u2026`;
  }
  const ageSec = Number(beat.ageSec ?? 0);
  // Round to nearest second; ageSec < 0.5 reads as "just now".
  const ageRounded = Math.max(0, Math.round(ageSec));
  const ageFrag = ageRounded <= 0 ? "just now" : `${ageRounded}s ago`;
  return `Last: ${body} (${ageFrag})`;
}

// v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 2) — beat kind classification.
// Used by the new #authorTickerStrip + tests so each ring-buffer entry can be
// rendered with a leading icon. Legacy `formatBeatText` is kept verbatim so
// `#storytellerBeat` and existing snapshot tests are untouched.
//
// Kind priority:
//   death      — obituary line ("X, …, died of …") OR plain "died ("
//   birth      — "born to" / "birth of" / "named after"
//   friendship — "became <…> friend" / "grieving" / "felt grim relief"
//   weather    — "[WEATHER]"
//   sabotage   — "[SABOTAGE]" / "[SHORTAGE]" / warehouse fire
//   visitor    — "[VISITOR]"
//   dream      — "dream"
//   generic    — fallback for anything matched by SALIENT_BEAT_PATTERNS but
//                not classified above.
const KIND_ICONS = Object.freeze({
  death: "\u{1F480}",       // skull
  birth: "\u2728",           // sparkles
  friendship: "\u{1F91D}",   // handshake
  weather: "\u{1F327}",      // cloud-with-rain
  sabotage: "\u26A0",        // warning sign
  visitor: "\u{1F6B6}",      // walker
  dream: "\u{1F319}",        // crescent moon
  generic: "\u00B7",          // middle dot
});

function classifyBeatKind(line) {
  const src = String(line ?? "");
  if (!src) return "generic";
  if (/^.+, .+, died of /i.test(src)) return "death";
  if (/\bdied \(/i.test(src)) return "death";
  if (/\bborn to\b/i.test(src)) return "birth";
  if (/\bbirth of\b/i.test(src)) return "birth";
  if (/\bnamed after\b/i.test(src)) return "birth";
  if (/\bbecame\b.*\bfriend\b/i.test(src)) return "friendship";
  if (/\bgrieving\b/i.test(src)) return "friendship";
  if (/Felt grim relief/i.test(src)) return "friendship";
  if (/\[WEATHER\]/i.test(src)) return "weather";
  if (/warehouse fire/i.test(src)) return "sabotage";
  if (/\[SABOTAGE\]/i.test(src)) return "sabotage";
  if (/\[SHORTAGE\]/i.test(src)) return "sabotage";
  if (/\[VISITOR\]/i.test(src)) return "visitor";
  if (/\bdream\b/i.test(src)) return "dream";
  return "generic";
}

/**
 * v0.8.2 Round-6 Wave-3 (02e-indie-critic Step 2) — structured beat output
 * for the new #authorTickerStrip. Returns null when `beat` is null/empty.
 *
 * The returned `{ text, kind, icon }` triple is consumed only by HUDController's
 * author-ticker render path; legacy `#storytellerBeat` keeps using the plain
 * `formatBeatText` string so 02d obituary tests stay green.
 *
 * @param {{ line: string, ageSec: number } | null} beat
 * @returns {{ text: string, kind: string, icon: string } | null}
 */
export function formatBeatTextWithKind(beat) {
  if (!beat) return null;
  const text = formatBeatText(beat);
  if (!text) return null;
  const kind = classifyBeatKind(beat.line);
  const icon = KIND_ICONS[kind] ?? KIND_ICONS.generic;
  return { text, kind, icon };
}

/**
 * Normalise a raw LLM/rule focus+summary pair into slightly more
 * human-readable prose. Keeps the function pure and side-effect free
 * (no DOM, no i/o) — just a small lookup table swap used by the model
 * builder below. We deliberately keep the table compact so a
 * future LLM output expansion doesn't silently bit-rot: anything
 * unrecognised falls through as-is.
 *
 * @param {string} raw
 * @returns {string}
 */
function humaniseSummary(raw) {
  if (!raw) return raw;
  let out = String(raw);
  // v0.8.2 Round-5 Wave-3 (01e Step 2 + 02e Step 1) — entry forecast that
  // swallows any leftover "(the colony should )?sustain " prefix immediately
  // followed by another verb (rebuild/reconnect/clear/keep/run/hug/strike/push/
  // work/disrupt/harass). This happens when upstream templates or older
  // cached payloads still carry the deprecated "sustain <verb-phrase>"
  // grammar trap. Kill the residue before any of the rewrite rules can
  // amplify it (Round-0 rebuild→reconnect cascade observed in Feedback §3).
  out = out.replace(
    /\b(?:the colony should |workers should )?sustain (?=(?:rebuild|reconnect|clear|keep|run|hug|strike|push|work|disrupt|harass)\b)/gi,
    "",
  );
  const rules = [
    [/route repair and depot relief/gi, "rebuild the broken supply lane"],
    // Round-5 Wave-3 (01e Step 2) — removed rebuild→reconnect double-rewrite:
    // the upstream focus word is already "rebuild"; collapsing it here gave
    // the HUD the "sustain reconnect …" observation in Feedbacks/01e §3.
    [/cargo relief/gi, "clear the stalled cargo"],
    [/stockpile throughput/gi, "keep the larder filling"],
    [/safe frontier throughput/gi, "work the safe edge of the frontier"],
    [/sustain frontier buildout/gi, "sustain the frontier push"],
    [/frontier buildout/gi, "push the frontier outward"],
    // Round-5 Wave-3 (02e Step 1) — removed "push the frontier outward →
    // push … while keeping the rear supplied": rule stacked with upstream
    // summary template to produce the double-clause sentence the HUD
    // clipped into the "reroute pres…" residue (Feedbacks/02e §3).
    [/forward depot trade/gi, "run trade to the forward depot"],
    [/defended warehouse lanes/gi, "hug the warehouse lanes"],
    [/warehouse circulation/gi, "keep goods moving between warehouses"],
    [/soft frontier corridor hits/gi, "strike a soft frontier corridor"],
    [/depot disruption/gi, "disrupt a frontier depot"],
    [/economic harassment/gi, "harass the supply chain"],
    [/stabilization/gi, "let the colony breathe"],
    [/hunger and carried cargo/gi, "empty bellies and full backpacks"],
    [/keep hunger (under control|low)/gi, "keep hunger in check"],
    [/workers should /gi, "the colony should "],
    [/depot throughput/gi, "warehouse throughput"],
    [/stretched worksites?/gi, "thinly-staffed worksites"],
    [/harvest loops? stall/gi, "harvest chain stalls"],
  ];
  for (const [pat, repl] of rules) out = out.replace(pat, repl);
  return out;
}

// v0.8.2 Round-5 Wave-3 (02e Step 2) — Authorial voice pack.
//
// All strings below are direct reuses of text already written elsewhere in
// the repository (scenario.meta openingPressure, Kitchen BuildAdvisor
// tooltip). No new authored prose is added — this is a transport layer that
// reinjects the author's voice into the HUD strip so players finally read
// those sentences during play instead of only in menu/help/tooltip surfaces.
//
// Keyed by (mapTemplateId × focusTag). focusTag is derived from the raw
// focus text via deriveFocusTag() below. The default bucket (*) is the
// fallback when no mapTemplate-specific override exists.
//
// Sources:
//   - temperate_plains / fertile_riverlands / rugged_highlands /
//     fortified_basin / archipelago_isles / coastal_ocean openingPressure
//     strings are from src/world/scenarios/ScenarioFactory.js:27-77.
//   - Default "Kitchen" line is from src/simulation/construction/
//     BuildAdvisor.js:61 ("the difference between a stocked warehouse and
//     workers starving beside it").
// v0.8.2 Round-6 Wave-3 (01e-innovation Step 3) — voice pack expanded from
// 1-3 entries per (template, tag) bucket up to 4-6 to defeat the "every
// colony hears the same line" repetition reviewers flagged. Each bucket is
// now a frozen `string[]`; `pickVoicePackEntry` rotates by a clock-derived
// seed (Math.floor(timeSec / 30)) so the strip refreshes every ~30s of
// game time. **bucket[0] of every existing key MUST keep the original
// authored line** so the storyteller-strip.test.js + hud-storyteller.test.js
// regex assertions (which call into the model with no `metrics.timeSec` →
// seed=0 → idx=0) stay green.
const AUTHOR_VOICE_PACK = Object.freeze({
  temperate_plains: Object.freeze({
    "broken-routes": Object.freeze([
      "The frontier is wide open, but the colony stalls fast if the west lumber line and east depot stay disconnected.",
      "Reconnect the lumber line before the east depot runs dry — the plains forgive distance, not silence.",
      "Out here a broken route is a slow famine; the frontier doesn't punish you all at once.",
      "The grass hides every shortcut you missed cutting last week — keep the haul lines alive.",
    ]),
    "cargo-stall": Object.freeze([
      "The difference between a stocked warehouse and workers starving beside it — clear the cargo before that gap opens.",
      "Backed-up haulers turn a good harvest into rotting piles; pull a worker off harvest and onto delivery.",
      "Cargo is meaningless until it's behind warehouse walls — push it through.",
      "Every minute a load sits on a worker's back is a minute the larder doesn't see it.",
    ]),
    stockpile: Object.freeze([
      "The plains fill the larder generously; the trick is moving it before the next storm.",
      "Stockpile depth buys you forgiveness later — keep the warehouse full while the weather holds.",
      "A stocked warehouse is the only buffer between a good day and a bad one.",
      "Eat the surplus the plains give you now; you'll need it when the rain breaks the routes.",
    ]),
    frontier: Object.freeze([
      "The frontier is wide open, but the colony stalls fast if the west lumber line and east depot stay disconnected.",
      "Push the frontier outward only as fast as the haul lines can follow.",
      "Every new tile cleared is one more haul leg to keep alive — measure your reach.",
      "The plains will let you over-extend; the warehouse will not.",
    ]),
    safety: Object.freeze([
      "Out here the wall is not a fortress — it is a buffer for the next shortage.",
      "The plains have no choke points; defense means keeping the warehouse close.",
      "Frontier safety is paid in stockpile, not stone.",
      "A breached gate is fixable; an empty larder is not.",
    ]),
    default: Object.freeze([
      "The frontier is wide open, but the colony stalls fast if the west lumber line and east depot stay disconnected.",
      "The plains reward steady throughput — keep the lumber and depot lines speaking to each other.",
      "Out here, the colony breathes in haul cycles. Hold the rhythm.",
      "Every directive on the plains comes back to the same question: is the warehouse filling?",
    ]),
  }),
  fertile_riverlands: Object.freeze({
    "broken-routes": Object.freeze([
      "The first threat is delay: silt, floodwater, and long haul lines can starve the hearth before the valley pays off.",
      "The river feeds you only after the bridges hold — patch the cargo loop before the silt does.",
      "Floods reroute haul lanes overnight; rebuild whatever the water moved.",
      "The valley is generous, but only to the patient with a working supply chain.",
    ]),
    "cargo-stall": Object.freeze([
      "Riverlands ferry their wealth through carts, not currents — clear the cargo or the harvest spoils on the bank.",
      "A jammed haul line in the valley turns abundance into rot within days.",
      "The river won't carry your wood — your workers will. Keep them moving.",
    ]),
    stockpile: Object.freeze([
      "Riverlands abundance is a trap if the warehouse can't keep up — overhaul before overharvesting.",
      "Stockpile faster than the valley produces, or watch the surplus drown.",
    ]),
    default: Object.freeze([
      "The first threat is delay: silt, floodwater, and long haul lines can starve the hearth before the valley pays off.",
      "The valley pays in volume; you pay in route maintenance.",
      "Riverlands always look easy until the silt arrives — keep one hand on the haul lines.",
    ]),
  }),
  rugged_highlands: Object.freeze({
    frontier: Object.freeze([
      "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
      "Up here the path you cut is the path raiders take next; clear deliberately.",
      "Highland frontier expansion buys ground at the cost of defense — measure both.",
      "Every switchback is a chokepoint; treat them like part of the wall.",
    ]),
    "broken-routes": Object.freeze([
      "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
      "A broken highland route doesn't just delay haul — it leaves the gate open.",
      "Repair the cut path before something else finds it.",
    ]),
    safety: Object.freeze([
      "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
      "Hold the high ground — every cleared switchback is a defensive shelf.",
      "Up here defense and logistics share the same path. Keep both moving.",
    ]),
    default: Object.freeze([
      "The highlands reward careful timing: every cleared route also becomes a gate you must hold.",
      "Highland decisions compound — every cut path is a future gate.",
      "Slow expansion, deliberate haul lines. The cliff doesn't forgive haste.",
    ]),
  }),
  fortified_basin: Object.freeze({
    "broken-routes": Object.freeze([
      "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
      "The basin's walls are only as strong as the shortest haul-line gap.",
      "A broken route inside the basin is a hole pointed inward — patch it fast.",
      "Pressure here builds at the open gate, not the empty larder.",
    ]),
    safety: Object.freeze([
      "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
      "Every gate that stays open is a contract with whatever's outside.",
      "The basin trades range for safety — defend what you've already enclosed.",
    ]),
    "cargo-stall": Object.freeze([
      "The basin will not starve from output — it will starve from exposure if the haul stalls at the gate.",
      "Stalled cargo at a basin gate is the worst kind of stall — eyes outside notice.",
    ]),
    default: Object.freeze([
      "The danger is not distance but exposure: the basin already has hard gates, and every open one invites pressure.",
      "Inside the basin every directive comes back to one question: which gate is open?",
      "The walls protect the throughput; the throughput pays for the walls.",
    ]),
  }),
  archipelago_isles: Object.freeze({
    stockpile: Object.freeze([
      "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
      "An island stockpile is a bet that the next bridge holds — keep both healthy.",
      "Surplus on one isle is famine on the next without a working span.",
    ]),
    "broken-routes": Object.freeze([
      "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
      "Bridge first, bank second — a broken span isolates the harvest.",
      "Out here a route is a bridge — when it breaks, the whole chain idles.",
    ]),
    "cargo-stall": Object.freeze([
      "Isles drown their own cargo if the bridges stall — clear the span before the tide rises.",
      "A stalled load on a bridge is a held breath; clear it before the chain breaks.",
    ]),
    default: Object.freeze([
      "The opening fight is over crossing water; one missed bridge leaves the island chain broken and idle.",
      "Every island decision starts with: which bridge holds tonight?",
      "The isles reward connectivity over expansion. Build the spans first.",
    ]),
  }),
  coastal_ocean: Object.freeze({
    "broken-routes": Object.freeze([
      "The coast is generous only after the causeways exist; until then the harbor, fields, and depot run separately.",
      "A broken causeway is a coastal famine in slow motion.",
      "The harbor and the larder don't talk until the causeway is intact — restore the link.",
    ]),
    "cargo-stall": Object.freeze([
      "Coastal cargo stalls fast — the harbor refuses what the depot can't accept.",
      "A stalled load by the shore is half a tide from spoiling. Move it.",
    ]),
    stockpile: Object.freeze([
      "Stockpile what the coast offers; the next storm will end the generosity.",
      "Coastal abundance is a window; close it before the weather does.",
    ]),
    default: Object.freeze([
      "The coast is generous only after the causeways exist; until then the harbor, fields, and depot run separately.",
      "The shore decides the tempo; the colony decides whether to keep up.",
      "Coastal directives all rhyme: connect before you collect.",
    ]),
  }),
  // v0.8.2 Round-6 Wave-3 (01e-innovation Step 3) — global fallback bucket.
  // Used when (a) the mapTemplateId is unknown and (b) when a template's
  // bucket has no entry for the focusTag and no `default` either.
  "*": Object.freeze({
    default: Object.freeze([
      "The difference between a stocked warehouse and workers starving beside it — keep the chain reinforcing itself.",
      "Every directive eventually answers the same question: is the larder filling faster than it empties?",
      "The colony breathes in haul cycles — hold the rhythm.",
      "A working supply chain is the only thing that turns intent into food.",
    ]),
    sabotage: Object.freeze([
      "Hooded riders left tracks near the southern depot — keep eyes on the wall.",
      "Smoke from a forward cache before dawn — someone is staging closer than the patrol thinks.",
      "Saboteurs are circling the soft side of the frontier; pull a worker to defense before the next push.",
      "Tools went missing from the lumber line overnight — the third party is testing the fence.",
      "An outsider walked the depot's blind spot today; consider it a warning shot.",
    ]),
  }),
});

/**
 * Derive a coarse focusTag from the focus text. Used only to index
 * AUTHOR_VOICE_PACK — non-matching focus falls through to the template's
 * `default` bucket, which in turn falls through to the `*` default.
 *
 * @param {string} focus
 * @returns {string}
 */
function deriveFocusTag(focus) {
  const f = String(focus ?? "").toLowerCase();
  if (!f) return "default";
  if (/(broken|supply lane|rebuild|reconnect|route repair)/.test(f)) return "broken-routes";
  if (/(cargo|stalled cargo|cargo relief)/.test(f)) return "cargo-stall";
  if (/(stockpile|larder|food recovery)/.test(f)) return "stockpile";
  if (/(frontier buildout|push the frontier|safe edge of the frontier)/.test(f)) return "frontier";
  if (/(safety|defend|hold the gates|wall)/.test(f)) return "safety";
  return "default";
}

/**
 * v0.8.2 Round-6 Wave-3 (01e-innovation Step 3) — bucket-mode lookup.
 *
 * Returns the matched string[] for (mapTemplateId, focusTag) following the
 * same template→default→global cascade as before. The caller picks one
 * entry via `pickVoicePackEntry(bucket, seed)` so the strip can rotate the
 * authored voice every ~30s of game time. Returns `{ bucket: [], hit: false }`
 * when nothing in the pack is applicable.
 *
 * @param {string} mapTemplateId
 * @param {string} focusTag
 * @returns {{ bucket: string[], hit: boolean }}
 */
function lookupAuthorVoice(mapTemplateId, focusTag) {
  const tplBucket = AUTHOR_VOICE_PACK[String(mapTemplateId ?? "")] ?? null;
  if (tplBucket && typeof tplBucket === "object") {
    if (Array.isArray(tplBucket[focusTag]) && tplBucket[focusTag].length > 0) {
      return { bucket: tplBucket[focusTag], hit: true };
    }
    if (Array.isArray(tplBucket.default) && tplBucket.default.length > 0) {
      return { bucket: tplBucket.default, hit: true };
    }
  }
  const globalBucket = AUTHOR_VOICE_PACK["*"];
  if (globalBucket) {
    if (Array.isArray(globalBucket[focusTag]) && globalBucket[focusTag].length > 0) {
      return { bucket: globalBucket[focusTag], hit: true };
    }
    if (Array.isArray(globalBucket.default) && globalBucket.default.length > 0) {
      return { bucket: globalBucket.default, hit: true };
    }
  }
  return { bucket: [], hit: false };
}

function buildTemplateTag(state) {
  const title = String(state?.gameplay?.scenario?.title ?? "").trim();
  const templateId = String(state?.world?.mapTemplateId ?? "").trim();
  if (!title || !templateId) return "";
  const templateName = String(describeMapTemplate(templateId)?.name ?? "").trim();
  if (!templateName) return "";
  return `${title} - ${templateName}`;
}

/**
 * v0.8.2 Round-7 (01e+02b) — Local WHISPER narrative builder.
 * Generates a state-aware, personalised story line for the fallback path
 * (no live LLM).  Returns null when no state signal warrants an override,
 * in which case the caller should fall through to the standard DIRECTOR
 * text.  When a non-null string is returned the HUD strip uses "WHISPER"
 * as the badge label to signal that the narrative is data-driven even
 * without a live model.
 *
 * Pure function — no DOM, no side effects.
 *
 * @param {object} state GameState-like
 * @returns {string | null}
 */
export function buildLocalWhisperNarrative(state) {
  const nowSec = Number(state?.metrics?.timeSec ?? 0);
  const food = Number(state?.resources?.food ?? 0);
  const workers = (state?.agents ?? []).filter(
    (a) => a && a.type === "WORKER" && a.alive !== false,
  ).length || (state?.colony?.workers?.length ?? 0);
  const kitchens = Number(state?.buildings?.kitchens ?? 0);
  const cooks = (state?.agents ?? []).filter(
    (a) => a && a.type === "WORKER" && a.alive !== false && a.role === "COOK",
  ).length;
  const deathLog = state?.gameplay?.deathLog ?? [];
  const recentDeath = Array.isArray(deathLog) ? deathLog[0] : null;
  if (recentDeath) {
    const deathSec = Number(recentDeath.timeSec ?? 0);
    if ((nowSec - deathSec) < 90) {
      const name = String(recentDeath.name ?? recentDeath.displayName ?? "Someone").split(" ")[0];
      if (food < 50) {
        return `${name} is gone — the rest press on. The colony cannot afford another loss.`;
      }
      return `${name} fell, but the colony holds. Steady the line.`;
    }
  }
  if (food < 30 && workers > 0) {
    return `${workers} mouth${workers === 1 ? "" : "s"}, no margin. Every second without harvest is a debt paid in lives.`;
  }
  if (kitchens > 0 && cooks === 0) {
    return "The kitchen stands cold. Raw food won\u2019t save them \u2014 someone needs to cook.";
  }
  return null;
}

/**
 * @param {object} state GameState or minimal shape with `ai.groupPolicies`
 *   (a Map keyed by group id) and `ai.lastPolicySource` (string).
 * @returns {string} Single-line human-readable storyteller ribbon text.
 */
export function computeStorytellerStripText(state) {
  const source = String(state?.ai?.lastPolicySource ?? "").toLowerCase();
  // Only the "llm" source counts as live LLM storytelling; "fallback",
  // "none", and any unrecognised source fall under Rule-based storyteller.
  const prefix = source === "llm" ? "LLM Storyteller" : "Rule-based Storyteller";

  let focus = "";
  let summary = "";
  const groupPolicies = state?.ai?.groupPolicies;
  if (groupPolicies) {
    // Map#get — supports both real Maps and test stubs that mimic Map API.
    const entry = typeof groupPolicies.get === "function"
      ? groupPolicies.get("workers")
      : (groupPolicies.workers ?? null);
    const data = entry?.data ?? entry ?? null;
    if (data && typeof data === "object") {
      focus = String(data.focus ?? "").trim();
      const rawSummary = String(data.summary ?? "").trim();
      // Keep the first sentence of summary; avoids overflowing the single-line
      // strip when the LLM returns a paragraph.
      const firstSentenceEnd = rawSummary.search(/[.!?](\s|$)/);
      summary = firstSentenceEnd > 0
        ? rawSummary.slice(0, firstSentenceEnd + 1)
        : rawSummary;
    }
  }

  if (!focus && !summary) {
    return "Rule-based storyteller idle — colony on autopilot";
  }
  const focusText = humaniseSummary(focus || "current directives");
  const summaryText = humaniseSummary(summary || "colony on autopilot");
  return `[${prefix}] ${focusText}: ${summaryText}`;
}

/**
 * Structured model for the storyteller strip, used by HUDController to
 * populate the badge + focus + summary spans. The badge copy (`prefix`)
 * follows the D3 arbitration in Round-1 Plans/summary.md:
 *
 *   mode "llm"      → prefix "WHISPER"
 *   mode "fallback" → prefix "DIRECTOR"
 *   mode "idle"     → prefix "DRIFT"
 *
 * @param {object} state GameState or minimal shape.
 * @returns {{mode: "llm"|"fallback"|"idle", focusText: string, summaryText: string, prefix: string, beatText: string | null, templateTag: string}}
 */
export function computeStorytellerStripModel(state) {
  const source = String(state?.ai?.lastPolicySource ?? "").toLowerCase();
  const lastPolicyError = String(state?.ai?.lastPolicyError ?? "").trim();
  const proxyHealth = String(state?.metrics?.proxyHealth ?? "").toLowerCase();

  let focus = "";
  let summary = "";
  let hasPolicy = false;
  const groupPolicies = state?.ai?.groupPolicies;
  if (groupPolicies) {
    const entry = typeof groupPolicies.get === "function"
      ? groupPolicies.get("workers")
      : (groupPolicies.workers ?? null);
    const data = entry?.data ?? entry ?? null;
    if (data && typeof data === "object") {
      focus = String(data.focus ?? "").trim();
      const rawSummary = String(data.summary ?? "").trim();
      const firstSentenceEnd = rawSummary.search(/[.!?](\s|$)/);
      summary = firstSentenceEnd > 0
        ? rawSummary.slice(0, firstSentenceEnd + 1)
        : rawSummary;
      if (focus || summary) hasPolicy = true;
    }
  }

  // Mode derivation:
  //   - source === "llm"                → mode llm     → prefix WHISPER
  //   - any policy data present         → mode fallback→ prefix DIRECTOR
  //   - no policy data yet              → mode idle    → prefix DRIFT
  let mode;
  if (source === "llm") mode = "llm";
  else if (hasPolicy) mode = "fallback";
  else mode = "idle";

  // v0.8.2 Round-5 Wave-3 (02e Step 4) — badgeState four-way split so the
  // HUD can differentiate a healthy live-LLM tick from a stale / degraded
  // fallback. WHISPER only lights up when we are both sourcing from the LLM
  // AND do NOT carry a lastPolicyError: previously any `source==="llm"` tick
  // unconditionally showed WHISPER, making the badge a promise the runtime
  // could not keep when the proxy flipped to error mid-session.
  let badgeState;
  if (mode === "llm" && !lastPolicyError) badgeState = "llm-live";
  else if (mode === "llm" && lastPolicyError) badgeState = "llm-stale";
  else if (mode === "fallback" && (proxyHealth === "error" || lastPolicyError)) badgeState = "fallback-degraded";
  else if (mode === "fallback") badgeState = "fallback-healthy";
  else badgeState = "idle";

  // Prefix: WHISPER only for healthy live LLM; stale LLM falls back to
  // DIRECTOR so players are not misled into thinking the model is driving
  // the colony when the last tick errored. idle → DRIFT (unchanged).
  const prefix = badgeState === "llm-live"
    ? "WHISPER"
    : mode === "idle"
      ? "DRIFT"
      : "DIRECTOR";

  // Idle copy communicates fallback-as-feature rather than going silent.
  // Keep the texts fully human-readable — no raw LLM debug tokens.
  let focusText = hasPolicy
    ? humaniseSummary(focus || "current directives")
    : "autopilot";

  // v0.8.2 Round-5 Wave-3 (02e Step 3) — voice-pack lookup. Only applies
  // in the fallback path (mode === "fallback"): the LLM-driven path stays
  // verbatim so authored model output is never overwritten. Idle keeps its
  // "holding steady" copy. See AUTHOR_VOICE_PACK comment for source origins.
  const mapTemplateId = String(state?.world?.mapTemplateId ?? "").trim();
  // v0.8.2 Round-5b (02e Step 2) — prefer policy.authorVoiceHintTag written by
  // PromptBuilder when available; fall back to deriveFocusTag heuristic.
  const policyTag = String(state?.ai?.groupPolicies?.get?.("workers")?.authorVoiceHintTag ?? "");
  const focusTag = policyTag || deriveFocusTag(focus);
  let summaryText;
  let voicePackHit = false;
  // v0.8.2 Round-5b (02e Step 1) — LLM-live overlay. Fallback path unchanged.
  // LLM path: voice-pack lookup runs independently of summaryText; if it hits,
  // voicePrefixText carries the authored short-sentence (rendered before summary
  // by HUDController). summaryText remains the humanised LLM output unchanged.
  let voicePrefixText = "";
  let voicePackOverlayHit = false;
  // v0.8.2 Round-6 Wave-3 (01e-innovation Step 3) — round-robin seed derived
  // from game time so the voice rotates every ~30s. State stubs without
  // metrics.timeSec collapse to seed=0 → bucket[0], preserving existing
  // unit-test text matchers.
  const voicePackSeed = Math.floor(Math.max(0, Number(state?.metrics?.timeSec ?? 0)) / 30);
  if (hasPolicy) {
    if (mode === "fallback") {
      // v0.8.2 Round-7 (01e+02b) — local WHISPER narrative: try state-aware
      // personalised text first; fall through to voice-pack if no signal.
      const localWhisper = buildLocalWhisperNarrative(state);
      if (localWhisper) {
        summaryText = localWhisper;
        voicePackHit = true; // repurpose flag: this text replaces the static pack
      } else {
        const vp = lookupAuthorVoice(mapTemplateId, focusTag);
        if (vp.hit) {
          const picked = pickVoicePackEntry(vp.bucket, voicePackSeed);
          if (picked) {
            summaryText = picked;
            voicePackHit = true;
          } else {
            summaryText = humaniseSummary(summary || "colony on autopilot");
          }
        } else {
          summaryText = humaniseSummary(summary || "colony on autopilot");
        }
      }
    } else {
      summaryText = humaniseSummary(summary || "colony on autopilot");
      // LLM-live overlay: add author prefix if focusTag is specific (non-default).
      if (mode === "llm" && focusTag && focusTag !== "default") {
        const vp = lookupAuthorVoice(mapTemplateId, focusTag);
        if (vp.hit) {
          const picked = pickVoicePackEntry(vp.bucket, voicePackSeed);
          if (picked) {
            voicePrefixText = picked;
            voicePackOverlayHit = true;
          }
        }
      }
    }
  } else {
    summaryText = "colony holding steady \u2014 awaiting the next directive";
  }

  // v0.8.2 Round-5 Wave-3 (01e Step 3) — in the fallback path, prefix the
  // focusText now carries only "picks ..." because the adjacent badge already
  // renders DIRECTOR. This keeps the live strip from reading
  // "DIRECTORDIRECTOR picks ..." while preserving the decision-maker cue.
  if (mode === "fallback" && focusText && focusText !== "autopilot"
      && !/^(?:DIRECTOR\s+)?picks\s+/i.test(focusText)) {
    focusText = `picks ${focusText.replace(/^DIRECTOR\s+/i, "").trim()}`;
  }

  // v0.8.2 Round-1 02d-roleplayer — fan-out salient event-trace beats into
  // the model so HUDController can render them into `#storytellerBeat`
  // without splicing into the main summary textContent (D4 arbitration).
  const beat = extractLatestNarrativeBeat(state);
  const beatText = formatBeatText(beat);
  const templateTag = buildTemplateTag(state);

  // v0.8.2 Round-5b Wave-1 (01e Step 1) — LLM state diagnostic overlay.
  // Surfaces "Why no WHISPER?" answer string synthesised from existing state
  // fields (no new sim signals). HUDController pipes whisperBlockedReason
  // into the storyteller tooltip so players stop asking "is this AI on?".
  //
  // v0.8.2 Round-6 Wave-1 01b-playability (Step 4) — the player-facing
  // whisperBlockedReason is now in-fiction (no "LLM"/"WHISPER" jargon). The
  // raw diagnostic strings are kept on `diagnostic.whisperBlockedReasonDev`
  // so dev-mode HUD overlays and existing tests can still read them. Per
  // summary.md §3 D2, the *dev* field name is locked across Wave-1 plans
  // (01b/01c/02b) — Wave-2/3 must not rename it.
  const policyLlmCount = Number(state?.ai?.policyLlmCount ?? 0);
  const policyTotalCount = Number(state?.ai?.policyDecisionCount ?? 0);
  let whisperBlockedReason;
  let whisperBlockedReasonDev;
  // v0.8.2 Round-6 Wave-3 (01e-innovation Step 4) — richer in-world copy.
  // Player-facing strings stay free of "LLM"/"WHISPER"/"errored"/"proxy"/"http"
  // tokens (locked by storyteller-llm-diagnostic-hidden.test.js) AND keep the
  // "Story Director" lead so existing storyteller-strip-whisper-diagnostic
  // assertions stay green. Engineer copy is preserved verbatim on
  // `whisperBlockedReasonDev` per Wave-1 contract.
  if (badgeState === "llm-live") {
    whisperBlockedReason = "Story Director: on air, the storyteller is listening.";
    whisperBlockedReasonDev = "LLM live \u2014 WHISPER active";
  } else if (badgeState === "llm-stale") {
    whisperBlockedReason = "Story Director: catching breath \u2014 the last word didn't land cleanly.";
    whisperBlockedReasonDev = "LLM stale \u2014 last tick failed guardrail";
  } else if (badgeState === "fallback-degraded") {
    const errKind = proxyHealth === "error" ? "http" : (lastPolicyError ? "error" : "unknown");
    whisperBlockedReason = "Story Director: line dropped \u2014 the rule-book is taking the wheel.";
    whisperBlockedReasonDev = `LLM errored (${errKind})`;
  } else if (badgeState === "fallback-healthy") {
    if (policyLlmCount === 0) {
      whisperBlockedReason = "Story Director: asleep \u2014 the rule-book has held the floor since the colony woke.";
      whisperBlockedReasonDev = "LLM never reached";
    } else {
      whisperBlockedReason = "Story Director: pondering \u2014 the rule-book is calling shots from the page tonight.";
      whisperBlockedReasonDev = "LLM quiet \u2014 fallback steering";
    }
  } else {
    whisperBlockedReason = "Story Director: warming up \u2014 the colony hasn't drawn its first breath yet.";
    whisperBlockedReasonDev = "No policy yet";
  }

  const diagnostic = {
    llmAvailable: badgeState === "llm-live" || badgeState === "llm-stale",
    llmEverFired: policyLlmCount > 0,
    llmLastErrorKind: lastPolicyError ? "error" : (proxyHealth === "error" ? "http" : "none"),
    llmLastErrorMessage: String(lastPolicyError ?? "").slice(0, 80),
    policyLlmCount,
    policyTotalCount,
    whisperBlockedReason,
    whisperBlockedReasonDev,
  };

  return {
    mode,
    focusText,
    summaryText,
    voicePrefixText,
    prefix,
    beatText,
    templateTag,
    badgeState,
    voicePackHit,
    voicePackOverlayHit,
    diagnostic,
  };
}
