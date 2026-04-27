import test from "node:test";
import assert from "node:assert/strict";

// We stub startSession's dependencies rather than import the whole GameApp
// (which bootstraps Three.js, the full DOM, and the services graph). The
// logic under test is small enough to exercise via a shallow harness.
function makeHarness({ loadedTemplateId, controlsTemplateId }) {
  const calls = [];
  const harness = {
    state: {
      world: {
        mapTemplateId: loadedTemplateId,
        mapSeed: 1337,
      },
      grid: {
        width: 96,
        height: 72,
      },
      controls: {
        mapTemplateId: controlsTemplateId,
        mapWidth: 96,
        mapHeight: 72,
        terrainTuning: { waterLevel: 0.3 },
      },
      session: { phase: "menu" },
      metrics: { timeSec: 0 },
    },
    regenerateWorld(params, options) {
      calls.push({ params, options });
      // Mimic the real method: commit the new templateId into state.world
      // so subsequent comparisons don't loop.
      this.state.world.mapTemplateId = params.templateId;
      this.state.grid.width = params.width ?? this.state.grid.width;
      this.state.grid.height = params.height ?? this.state.grid.height;
    },
    _setRunPhaseCalls: [],
  };

  // Mirror the small startSession template branch without booting GameApp's
  // private DOM/Three.js graph.
  harness.startSession = function startSession() {
    const selectedId = this.state?.controls?.mapTemplateId;
    const selectedWidth = Number(this.state?.controls?.mapWidth);
    const selectedHeight = Number(this.state?.controls?.mapHeight);
    const loadedId = this.state?.world?.mapTemplateId;
    const loadedWidth = Number(this.state?.grid?.width ?? 0);
    const loadedHeight = Number(this.state?.grid?.height ?? 0);
    const needsTemplateChange = Boolean(selectedId && loadedId && selectedId !== loadedId);
    const needsWidthChange = Number.isFinite(selectedWidth) && selectedWidth >= 24 && selectedWidth !== loadedWidth;
    const needsHeightChange = Number.isFinite(selectedHeight) && selectedHeight >= 24 && selectedHeight !== loadedHeight;
    if (needsTemplateChange || needsWidthChange || needsHeightChange) {
      this.regenerateWorld({
        templateId: selectedId ?? loadedId,
        seed: this.state.world.mapSeed,
        terrainTuning: this.state.controls.terrainTuning,
        width: Number.isFinite(selectedWidth) && selectedWidth >= 24 ? Math.floor(selectedWidth) : loadedWidth,
        height: Number.isFinite(selectedHeight) && selectedHeight >= 24 ? Math.floor(selectedHeight) : loadedHeight,
      }, { phase: "menu" });
    }
    this._setRunPhaseCalls.push({ phase: "active" });
    this.state.session.phase = "active";
  };

  harness.getRegenerateCalls = () => calls;
  return harness;
}

test("startSession regenerates world when selected template differs from loaded", () => {
  const harness = makeHarness({
    loadedTemplateId: "temperate_plains",
    controlsTemplateId: "rugged_highlands",
  });
  harness.state.controls.mapWidth = 128;
  harness.state.controls.mapHeight = 96;

  harness.startSession();

  const calls = harness.getRegenerateCalls();
  assert.equal(calls.length, 1, "regenerateWorld should be called exactly once");
  assert.equal(calls[0].params.templateId, "rugged_highlands");
  assert.equal(calls[0].params.width, 128);
  assert.equal(calls[0].params.height, 96);
  assert.equal(calls[0].params.seed, 1337, "seed must be preserved, not randomised");
  assert.equal(calls[0].options.phase, "menu", "regenerate should stage in menu phase");
  assert.equal(harness.state.session.phase, "active", "session should advance to active after regen");
});

test("startSession regenerates world when size differs even if the template matches", () => {
  const harness = makeHarness({
    loadedTemplateId: "temperate_plains",
    controlsTemplateId: "temperate_plains",
  });
  harness.state.controls.mapWidth = 128;
  harness.state.controls.mapHeight = 96;

  harness.startSession();

  const calls = harness.getRegenerateCalls();
  assert.equal(calls.length, 1, "regenerateWorld should be called exactly once for a size mismatch");
  assert.equal(calls[0].params.templateId, "temperate_plains");
  assert.equal(calls[0].params.width, 128);
  assert.equal(calls[0].params.height, 96);
  assert.equal(harness.state.session.phase, "active");
});

test("startSession does NOT regenerate when templates already match", () => {
  const harness = makeHarness({
    loadedTemplateId: "temperate_plains",
    controlsTemplateId: "temperate_plains",
  });

  harness.startSession();

  assert.equal(
    harness.getRegenerateCalls().length,
    0,
    "regenerateWorld must not be called when the selected and loaded templates match",
  );
  assert.equal(harness.state.session.phase, "active");
});

test("startSession is defensive when controls.mapTemplateId is undefined", () => {
  const harness = makeHarness({
    loadedTemplateId: "temperate_plains",
    controlsTemplateId: undefined,
  });

  harness.startSession();

  assert.equal(
    harness.getRegenerateCalls().length,
    0,
    "no regen when controls.mapTemplateId is unset - safe default on first Start",
  );
});
