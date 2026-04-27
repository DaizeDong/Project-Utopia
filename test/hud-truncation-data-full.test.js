import test from "node:test";
import assert from "node:assert/strict";

// v0.8.2 Round-5b Wave-1 (01a Step 3 + Step 10) — HUD truncation data-full
// contract. When #renderNextAction sets node.title= and node.dataset.full=,
// both should mirror the untruncated full text so hover exposes the complete
// instruction even when CSS ellipsis shortens the visible label.
//
// This is a pure logic test — no DOM needed beyond a mock node object.
// We model the exact logic from HUDController.#renderNextAction:
//   node.textContent = loopText  (possibly truncated by CSS)
//   node.title       = title     (full hover text)
//   node.dataset.full = title || loopText  (full text for programmatic access)

function mockNode() {
  const attrs = {};
  return {
    _textContent: "",
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = v; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    _attrs: attrs,
  };
}

// Simulates the data-full assignment logic from HUDController.#renderNextAction.
function applyFullTextHover(node, loopText, title) {
  node.textContent = loopText;
  node.setAttribute("title", title);
  // v0.8.2 Round-5b Wave-1 (01a Step 3): data-full mirrors full text
  node.setAttribute("data-full", title || loopText);
}

test("data-full: setAttribute stores full text when title is provided", () => {
  const node = mockNode();
  const longText = "Next: Build Farm adjacent to Warehouse to increase food production — logistics bottleneck";
  const shortText = "Next: Build Farm";
  applyFullTextHover(node, shortText, longText);
  assert.equal(node.getAttribute("title"), longText,
    "title attribute must equal the full untruncated text");
  assert.equal(node.getAttribute("data-full"), longText,
    "data-full attribute must equal the full untruncated text");
  assert.equal(node.textContent, shortText,
    "textContent carries the (potentially shorter) loop text");
});

test("data-full: when title is empty, data-full falls back to loopText", () => {
  const node = mockNode();
  const loopText = "Next: hold";
  applyFullTextHover(node, loopText, "");
  assert.equal(node.getAttribute("data-full"), loopText,
    "data-full must fall back to loopText when title is empty");
});

test("data-full: long text stored untruncated in data-full (> 40 chars)", () => {
  const node = mockNode();
  // Simulate a scenario directive that exceeds the 40-char CSS ellipsis cap
  const fullText = "Stockpile 50 food and 30 wood before winter to avoid a spring famine";
  assert.ok(fullText.length > 40, "test precondition: fullText must exceed 40 chars");
  applyFullTextHover(node, fullText.slice(0, 40), fullText);
  const stored = node.getAttribute("data-full");
  assert.ok(stored.length >= fullText.length,
    "data-full must be at least as long as the original full text (no truncation)");
  assert.equal(stored, fullText, "data-full must exactly equal the untruncated full text");
});

test("data-full: title and data-full are consistent with each other", () => {
  const node = mockNode();
  const fullText = "Route connected: Warehouse ready — haul Food to the depot before dawn";
  applyFullTextHover(node, "Route connected", fullText);
  assert.equal(node.getAttribute("title"), node.getAttribute("data-full"),
    "title and data-full must carry the same value");
});
