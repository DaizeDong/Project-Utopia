// agent-bridge — exercises the in-process server (createAgentBridgeServer)
// against the HTTPAgentClient end-to-end, using NoopAgentAdapter for the
// channel backends so we don't need any LLM credentials.

import test from "node:test";
import assert from "node:assert/strict";

import { createAgentBridgeServer, AgentRegistry } from "../server/agent-bridge.js";
import { HTTPAgentClient } from "../src/simulation/ai/llm/HTTPAgentClient.js";
import { CHANNELS, NoopAgentAdapter, SCHEMA_VERSION } from "../src/simulation/ai/llm/AgentAdapter.js";

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

test("agent-bridge: /health returns service metadata", async () => {
  const { server } = createAgentBridgeServer();
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/health`);
    assert.equal(resp.ok, true);
    const data = await resp.json();
    assert.equal(data.ok, true);
    assert.equal(data.service, "agent-bridge");
    assert.equal(data.schemaVersion, SCHEMA_VERSION);
    assert.equal(typeof data.agentCount, "number");
  } finally {
    await close(server);
  }
});

test("agent-bridge: register + decision round-trips through Noop backend", async () => {
  const registry = new AgentRegistry();
  // Pre-register an agent with NoopAgentAdapter so we exercise the
  // end-to-end POST /decision path without any cell-routing dependencies.
  const noop = new NoopAgentAdapter();
  const adapters = new Map(CHANNELS.map((c) => [c, noop]));
  registry.register({ agentId: "noop-1", adapters, cellId: "FB" });

  const { server } = createAgentBridgeServer({ registry });
  const baseUrl = await listen(server);

  try {
    const client = new HTTPAgentClient({
      agentBridgeUrl: baseUrl,
      agentId: "noop-1",
      timeoutMs: 3000,
    });

    for (const channel of CHANNELS) {
      const resp = await client.request(channel, { tick: 1 });
      // NoopAgentAdapter returns fallback:true with model:"noop"
      assert.equal(resp.fallback, true, `channel=${channel}`);
      assert.equal(resp.model, "noop");
      assert.equal(resp.error, "");
      assert.equal(resp.data, null);
      assert.deepEqual(resp.debug?.payloadEcho, { tick: 1 });
    }
  } finally {
    await close(server);
  }
});

test("agent-bridge: /api/agent/register endpoint creates an entry", async () => {
  const { server, registry } = createAgentBridgeServer();
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/api/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "alpha", mode: "push", cellId: "FB" }),
    });
    assert.equal(resp.ok, true);
    const data = await resp.json();
    assert.equal(data.ok, true);
    assert.equal(data.agentId, "alpha");
    assert.equal(data.cellId, "FB");
    assert.deepEqual(data.channels.slice().sort(), CHANNELS.slice().sort());
    assert.equal(registry.get("alpha")?.cellId, "FB");
  } finally {
    await close(server);
  }
});

test("agent-bridge: GET /poll returns lastSeen for a registered agent", async () => {
  const registry = new AgentRegistry();
  registry.register({ agentId: "poller", cellId: "FB" });
  const { server } = createAgentBridgeServer({ registry });
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/api/agent/poller/poll`);
    assert.equal(resp.ok, true);
    const data = await resp.json();
    assert.equal(data.ok, true);
    assert.equal(data.agentId, "poller");
    assert.ok(data.lastSeen > 0);
  } finally {
    await close(server);
  }
});

test("agent-bridge: GET /health for unknown agent returns 404", async () => {
  const { server } = createAgentBridgeServer();
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/api/agent/missing/health`);
    assert.equal(resp.status, 404);
    const data = await resp.json();
    assert.equal(data.ok, false);
  } finally {
    await close(server);
  }
});

test("agent-bridge: decision with unknown channel returns fallback shape", async () => {
  const registry = new AgentRegistry();
  registry.register({ agentId: "ch", cellId: "FB" });
  const { server } = createAgentBridgeServer({ registry });
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/api/agent/ch/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "garbage", payload: {}, schemaVersion: SCHEMA_VERSION }),
    });
    assert.equal(resp.ok, true);
    const data = await resp.json();
    assert.equal(data.fallback, true);
    assert.equal(data.data, null);
    assert.match(data.error, /unknown channel/);
  } finally {
    await close(server);
  }
});

test("agent-bridge: decision with mismatched schemaVersion returns fallback", async () => {
  const registry = new AgentRegistry();
  registry.register({ agentId: "v", cellId: "FB" });
  const { server } = createAgentBridgeServer({ registry });
  const baseUrl = await listen(server);
  try {
    const resp = await fetch(`${baseUrl}/api/agent/v/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "npc-policy", payload: {}, schemaVersion: "9.99" }),
    });
    assert.equal(resp.ok, true);
    const data = await resp.json();
    assert.equal(data.fallback, true);
    assert.match(data.error, /schemaVersion/);
  } finally {
    await close(server);
  }
});
