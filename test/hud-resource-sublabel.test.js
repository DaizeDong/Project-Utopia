import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("primary HUD resource pills include visible text sublabels", () => {
  for (const [id, label] of [
    ["hudFood", "Food"],
    ["hudWood", "Wood"],
    ["hudStone", "Stone"],
    ["hudHerbs", "Herbs"],
    ["hudWorkers", "Workers"],
  ]) {
    const pattern = new RegExp(`id="${id}"[\\s\\S]*?<span class="hud-sublabel">${label}</span>`);
    assert.match(html, pattern, `${id} should include ${label} sublabel`);
  }
});

test("toast CSS defines milestone styling and compact sublabel fallback", () => {
  assert.match(html, /\.build-toast--milestone/);
  assert.match(html, /@keyframes toastMilestone/);
  assert.match(html, /#ui\.compact \.hud-sublabel \{ display: none; \}/);
});
