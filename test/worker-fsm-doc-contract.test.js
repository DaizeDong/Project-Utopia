// Round 0 / Final-Polish-Loop / C1-code-architect Wave-1 lock-test.
//
// Asserts that the "## State Inventory" section of docs/systems/03-worker-ai.md
// lists exactly the FSM state names exported as `STATE` from
// src/simulation/npc/fsm/WorkerStates.js. If these two sets diverge (e.g. a
// new state is added to the FSM without a matching docs row, or vice versa),
// this test will fail with a deepEqual diff naming the missing / extra
// state(s).
//
// The intent is to convert "docs sync" from a one-shot manual chore into a
// continuous invariant. When this test fails, the fix is one of:
//   (a) add the new STATE to the doc's "## State Inventory" list, or
//   (b) remove the stale STATE row from the doc, or
//   (c) (rare) rename a STATE — in which case BOTH the WorkerStates.js export
//       AND the docs row need updating in the same commit.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// Import order matters: WorkerStates.js indirectly depends on WorkerAISystem.js
// (helpers re-exported back into the FSM bodies). Importing WorkerAISystem
// first forces the right module-graph init order so TDZ is avoided when
// WorkerTransitions.js reads STATE. See test/v0.10.0-a-fsm-foundation.test.js
// for the same pattern.
import "../src/simulation/npc/WorkerAISystem.js";
import { STATE } from "../src/simulation/npc/fsm/WorkerStates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOC_PATH = resolve(__dirname, "../docs/systems/03-worker-ai.md");

/**
 * Parse the "## State Inventory" section of the docs file and return the set
 * of STATE names listed as `- \`STATE_NAME\` — …` bullet items.
 *
 * Uses the simplest possible regex (list-item with a backticked all-caps
 * identifier) to avoid coupling to markdown table syntax — see C1 plan §5 R2.
 */
function parseDocStateNames(markdown) {
  const lines = markdown.split(/\r?\n/);
  const startIdx = lines.findIndex((line) => /^##\s+State Inventory\b/.test(line));
  assert.ok(startIdx >= 0, "docs/systems/03-worker-ai.md missing '## State Inventory' section");
  // Section ends at the next heading of equal or higher level (^## or ^#).
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i])) { endIdx = i; break; }
  }
  const section = lines.slice(startIdx, endIdx);
  const names = new Set();
  const itemRe = /^- `([A-Z][A-Z_]*)`/;
  for (const line of section) {
    const m = itemRe.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

describe("worker-fsm-doc-contract", () => {
  it("docs/systems/03-worker-ai.md State Inventory matches WorkerStates.js STATE export", () => {
    const markdown = readFileSync(DOC_PATH, "utf8");
    const docStates = parseDocStateNames(markdown);
    const codeStates = new Set(Object.values(STATE));
    assert.deepEqual(
      [...docStates].sort(),
      [...codeStates].sort(),
      "docs/systems/03-worker-ai.md State Inventory and src/simulation/npc/fsm/WorkerStates.js"
        + " STATE export are out of sync. Update both in the same commit.",
    );
  });
});
