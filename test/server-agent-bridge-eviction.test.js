// test/server-agent-bridge-eviction.test.js
// P1 reviewer-fix B-1: AgentRegistry must self-prune stale entries (no
// permanent leak across long benchmark runs) and expose a hard cap +
// unregister endpoint.

import test from "node:test";
import assert from "node:assert/strict";

import {
  AgentRegistry,
  createAgentBridgeServer,
  DEFAULT_MAX_AGENTS,
} from "../server/agent-bridge.js";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("AgentRegistry.evictStale drops entries older than maxIdleMs", () => {
  const registry = new AgentRegistry({ maxIdleMs: 60_000 });
  for (let i = 0; i < 100; i++) {
    registry.register({ agentId: `agent-${i}`, cellId: "FB" });
  }
  assert.equal(registry.size(), 100);

  // Age out the first 50 by rolling back their lastSeen timestamps
  // beyond the eviction window.
  const ancient = Date.now() - (60_000 + 5_000);
  for (let i = 0; i < 50; i++) {
    const e = registry.get(`agent-${i}`);
    assert.ok(e, `agent-${i} should exist`);
    e.lastSeen = ancient;
  }

  const removed = registry.evictStale();
  assert.equal(removed, 50, "exactly 50 stale agents removed");
  assert.equal(registry.size(), 50, "50 fresh agents survive");

  // The survivors are agent-50..agent-99
  assert.ok(registry.get("agent-50"));
  assert.equal(registry.get("agent-0"), null);
});

test("AgentRegistry.unregister removes a single entry", () => {
  const registry = new AgentRegistry();
  registry.register({ agentId: "alpha", cellId: "FB" });
  registry.register({ agentId: "beta", cellId: "FB" });
  assert.equal(registry.size(), 2);

  assert.equal(registry.unregister("alpha"), true);
  assert.equal(registry.size(), 1);
  assert.equal(registry.get("alpha"), null);
  assert.ok(registry.get("beta"));

  // Idempotent — second call is a no-op
  assert.equal(registry.unregister("alpha"), false);
});

test("AgentRegistry hard cap throws REGISTRY_FULL", () => {
  const registry = new AgentRegistry({ maxAgents: 3 });
  registry.register({ agentId: "a", cellId: "FB" });
  registry.register({ agentId: "b", cellId: "FB" });
  registry.register({ agentId: "c", cellId: "FB" });
  assert.equal(registry.size(), 3);

  assert.throws(
    () => registry.register({ agentId: "d", cellId: "FB" }),
    (err) => err && err.code === "REGISTRY_FULL",
    "registering past the cap throws REGISTRY_FULL",
  );
  assert.equal(registry.size(), 3, "size unchanged after rejected register");

  // Re-registering an existing id should work (overwrite, not insert)
  registry.register({ agentId: "a", cellId: "FB" });
  assert.equal(registry.size(), 3);
});

test("AgentRegistry register triggers opportunistic evictStale", () => {
  const registry = new AgentRegistry({ maxIdleMs: 60_000, maxAgents: 5 });
  registry.register({ agentId: "old-1", cellId: "FB" });
  registry.register({ agentId: "old-2", cellId: "FB" });
  registry.register({ agentId: "fresh", cellId: "FB" });

  // Age out old-1 and old-2
  registry.get("old-1").lastSeen = Date.now() - 120_000;
  registry.get("old-2").lastSeen = Date.now() - 120_000;

  // Next register prunes them before checking the cap
  registry.register({ agentId: "new", cellId: "FB" });
  assert.equal(registry.get("old-1"), null);
  assert.equal(registry.get("old-2"), null);
  assert.ok(registry.get("fresh"));
  assert.ok(registry.get("new"));
  assert.equal(registry.size(), 2);
});

test("agent-bridge: DELETE /api/agent/:id/unregister removes the entry", async () => {
  const registry = new AgentRegistry();
  registry.register({ agentId: "to-remove", cellId: "FB" });
  const { server } = createAgentBridgeServer({ registry });
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/api/agent/to-remove/unregister`, {
      method: "DELETE",
    });
    assert.equal(resp.ok, true);
    const data = await resp.json();
    assert.equal(data.ok, true);
    assert.equal(data.removed, true);
    assert.equal(registry.size(), 0);

    // Second call returns 404
    const r2 = await fetch(`${baseUrl}/api/agent/to-remove/unregister`, {
      method: "DELETE",
    });
    assert.equal(r2.status, 404);
  } finally {
    await close(server);
  }
});

test("agent-bridge: register past the hard cap returns HTTP 503", async () => {
  const registry = new AgentRegistry({ maxAgents: 2 });
  const { server } = createAgentBridgeServer({ registry });
  const baseUrl = await listen(server);
  try {
    for (const id of ["a", "b"]) {
      const r = await fetch(`${baseUrl}/api/agent/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: id, mode: "push", cellId: "FB" }),
      });
      assert.equal(r.ok, true, `register ${id} ok`);
    }
    // Third should be rejected
    const overflow = await fetch(`${baseUrl}/api/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "c", mode: "push", cellId: "FB" }),
    });
    assert.equal(overflow.status, 503);
    const data = await overflow.json();
    assert.equal(data.ok, false);
    assert.equal(data.code, "REGISTRY_FULL");
    assert.equal(data.maxAgents, 2);
  } finally {
    await close(server);
  }
});

test("DEFAULT_MAX_AGENTS is exported and 256 by default", () => {
  assert.equal(DEFAULT_MAX_AGENTS, 256);
  const r = new AgentRegistry();
  assert.equal(r.maxAgents, DEFAULT_MAX_AGENTS);
});
