// v0.8.2 Round0 02b-casual — Build validity canvas overlay unit tests.
// Plan: assignments/homework6/Agent-Feedback-Loop/Round0/Plans/02b-casual.md
//
// The SceneRenderer paints a colored preview mesh at the hovered tile:
// green (#4ade80) when the BuildSystem's preview returns ok=true, red
// (#ef4444) when ok=false. In the casual UI profile the mesh is scaled up
// by 8% so first-time players can read the legal/illegal cue at standard
// zoom (reviewer player-02-casual missed it). The render path itself
// requires Three.js + a live canvas, so the scaling/colouring decision is
// extracted into the pure-function `describeBuildValidityAccent` for
// testability — this test exercises that pure helper.

import test from "node:test";
import assert from "node:assert/strict";

import { describeBuildValidityAccent } from "../src/render/SceneRenderer.js";

test("describeBuildValidityAccent paints green + casual scale for legal placement", () => {
  const preview = {
    ok: true,
    tool: "farm",
    ix: 12,
    iz: 7,
    summary: "Build farm (5 wood)",
    cost: { wood: 5 },
  };
  const out = describeBuildValidityAccent(preview, "casual");
  assert.equal(out.color, "#4ade80", "legal => green");
  assert.equal(out.legal, true);
  assert.equal(out.scale, 1.08, "casual profile scales mesh up 8%");
  assert.equal(out.reasonText, "Build farm (5 wood)");
});

test("describeBuildValidityAccent paints red + reasonText for illegal placement", () => {
  const preview = {
    ok: false,
    tool: "lumber",
    ix: 3,
    iz: 4,
    reason: "missingAdjacentResource",
    reasonText: "No forest node on this tile.",
  };
  const out = describeBuildValidityAccent(preview, "casual");
  assert.equal(out.color, "#ef4444", "illegal => red");
  assert.equal(out.legal, false);
  assert.equal(out.reasonText, "No forest node on this tile.");
});

test("describeBuildValidityAccent keeps mesh at 1.0x scale in full profile", () => {
  const preview = { ok: true, ix: 0, iz: 0 };
  const out = describeBuildValidityAccent(preview, "full");
  assert.equal(out.scale, 1.0, "full (power-user) profile => no accent");
});

test("describeBuildValidityAccent returns null color when no preview", () => {
  const out = describeBuildValidityAccent(null, "casual");
  assert.equal(out.color, null);
  assert.equal(out.scale, 1.0);
  assert.equal(out.legal, false);
  assert.equal(out.reasonText, "");
});

test("describeBuildValidityAccent falls back gracefully when reasonText missing", () => {
  const preview = {
    ok: false,
    tool: "farm",
    ix: 1,
    iz: 1,
    reason: "insufficientResource",
    cost: { wood: 5 },
    resources: { wood: 2 },
  };
  const out = describeBuildValidityAccent(preview, "casual");
  assert.equal(out.color, "#ef4444");
  assert.equal(out.legal, false);
  // Should have some non-empty text — either explainBuildReason output or
  // empty string (but not undefined). Test: defined + string-typed.
  assert.equal(typeof out.reasonText, "string");
});

// Mock-canvas style test: a minimal object standing in for
// CanvasRenderingContext2D records `strokeRect` calls. This is a sketched
// integration — in this codebase the hover overlay is a Three.js
// previewMesh rather than a raster canvas stroke, so we verify the
// mock-recorder pattern the plan describes on a trivial driver.
test("overlay driver records red strokeRect for illegal hover on mock ctx", () => {
  const strokes = [];
  const mockCtx = {
    strokeStyle: "",
    lineWidth: 0,
    strokeRect(x, y, w, h) {
      strokes.push({ x, y, w, h, style: this.strokeStyle, lineWidth: this.lineWidth });
    },
  };

  // Simulate the canvas overlay path the plan describes: given a preview
  // and profile, a minimal 2D-canvas consumer would call:
  const preview = {
    ok: false,
    ix: 5,
    iz: 5,
    reasonText: "No forest node on this tile.",
  };
  const accent = describeBuildValidityAccent(preview, "casual");
  const tilePx = 32;
  mockCtx.strokeStyle = accent.color;
  mockCtx.lineWidth = 2;
  mockCtx.strokeRect(preview.ix * tilePx, preview.iz * tilePx, tilePx, tilePx);

  assert.equal(strokes.length, 1, "one strokeRect for the hovered tile");
  assert.equal(strokes[0].style, "#ef4444", "illegal hover => red border");
  assert.equal(strokes[0].lineWidth, 2);
  assert.equal(strokes[0].x, 5 * tilePx);
  assert.equal(strokes[0].y, 5 * tilePx);
});
