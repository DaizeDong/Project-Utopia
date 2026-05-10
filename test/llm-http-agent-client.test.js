// HTTPAgentClient — exercises the AgentAdapter contract against a local
// node:http mock server. Confirms:
//   1) normal request round-trip preserves the DecisionResponse shape
//   2) timeout returns fallback (does not throw)
//   3) malformed response returns fallback (does not throw)
//   4) HTTP 5xx returns fallback (does not throw)
//   5) health() never throws even when the bridge is unreachable

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { HTTPAgentClient } from "../src/simulation/ai/llm/HTTPAgentClient.js";
import { CHANNELS, SCHEMA_VERSION } from "../src/simulation/ai/llm/AgentAdapter.js";

function startMock(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => handler(req, res, raw));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function stopMock(srv) {
  return new Promise((resolve) => srv.close(() => resolve()));
}

test("HTTPAgentClient: normal request round-trip", async () => {
  const { server, baseUrl } = await startMock((req, res, raw) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/agent/test-agent/decision");
    const body = JSON.parse(raw);
    assert.equal(body.channel, "environment-director");
    assert.equal(body.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(body.payload, { hello: "world" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      data: { directive: { weatherBias: "calm" } },
      fallback: false,
      usage: { promptTokens: 12, completionTokens: 34, cachedTokens: 0 },
      latencyMs: 42,
      model: "test-model",
      error: "",
      debug: { source: "mock" },
    }));
  });

  try {
    const client = new HTTPAgentClient({
      agentBridgeUrl: baseUrl,
      agentId: "test-agent",
      timeoutMs: 5000,
    });
    const resp = await client.request("environment-director", { hello: "world" });
    assert.equal(resp.fallback, false);
    assert.deepEqual(resp.data, { directive: { weatherBias: "calm" } });
    assert.equal(resp.model, "test-model");
    assert.equal(resp.error, "");
    assert.equal(resp.usage.promptTokens, 12);
    assert.equal(client.lastStatus, "up");
  } finally {
    await stopMock(server);
  }
});

test("HTTPAgentClient: request timeout returns fallback (no throw)", async () => {
  // Mock that never responds — let the AbortController fire.
  const { server, baseUrl } = await startMock(() => { /* dangle */ });

  try {
    const client = new HTTPAgentClient({
      agentBridgeUrl: baseUrl,
      agentId: "slow",
      timeoutMs: 150,
    });
    const resp = await client.request("npc-policy", { x: 1 });
    assert.equal(resp.fallback, true);
    assert.equal(resp.data, null);
    assert.match(resp.error, /timeout/i);
    assert.equal(client.lastStatus, "down");
  } finally {
    await stopMock(server);
  }
});

test("HTTPAgentClient: malformed JSON response returns fallback", async () => {
  const { server, baseUrl } = await startMock((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("not json {{{");
  });

  try {
    const client = new HTTPAgentClient({
      agentBridgeUrl: baseUrl,
      agentId: "garbage",
      timeoutMs: 2000,
    });
    const resp = await client.request("strategic-plan", {});
    assert.equal(resp.fallback, true);
    assert.equal(resp.data, null);
    assert.match(resp.error, /malformed/i);
  } finally {
    await stopMock(server);
  }
});

test("HTTPAgentClient: malformed shape (missing data/fallback) returns fallback", async () => {
  const { server, baseUrl } = await startMock((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ unrelated: 42 }));
  });

  try {
    const client = new HTTPAgentClient({ agentBridgeUrl: baseUrl, agentId: "weird" });
    const resp = await client.request("colony-agent", {});
    assert.equal(resp.fallback, true);
    assert.match(resp.error, /malformed/i);
  } finally {
    await stopMock(server);
  }
});

test("HTTPAgentClient: HTTP 5xx returns fallback", async () => {
  const { server, baseUrl } = await startMock((req, res) => {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("upstream down");
  });

  try {
    const client = new HTTPAgentClient({ agentBridgeUrl: baseUrl, agentId: "down" });
    const resp = await client.request("environment-director", {});
    assert.equal(resp.fallback, true);
    assert.match(resp.error, /HTTP 503/);
  } finally {
    await stopMock(server);
  }
});

test("HTTPAgentClient: unknown channel returns fallback without contacting server", async () => {
  // Pass a deliberately broken fetchImpl — must NOT be called.
  let called = false;
  const client = new HTTPAgentClient({
    agentBridgeUrl: "http://127.0.0.1:1",
    fetchImpl: () => { called = true; throw new Error("should not be called"); },
  });
  const resp = await client.request("not-a-channel", {});
  assert.equal(resp.fallback, true);
  assert.match(resp.error, /unknown channel/);
  assert.equal(called, false);
});

test("HTTPAgentClient: CHANNELS constant covers all 4 expected names", () => {
  // Sanity guard so this test fails loudly if the channel set is renamed.
  assert.deepEqual(
    CHANNELS.slice().sort(),
    ["colony-agent", "environment-director", "npc-policy", "strategic-plan"],
  );
});

test("HTTPAgentClient: health() returns unhealthy on unreachable bridge", async () => {
  const client = new HTTPAgentClient({
    agentBridgeUrl: "http://127.0.0.1:1",  // closed port
    agentId: "ghost",
    timeoutMs: 500,
  });
  const h = await client.health();
  assert.equal(h.healthy, false);
  assert.ok(typeof h.error === "string" && h.error.length > 0);
});

test("HTTPAgentClient: health() returns healthy when bridge says so", async () => {
  const { server, baseUrl } = await startMock((req, res) => {
    assert.equal(req.url, "/api/agent/foo/health");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ healthy: true, lastSeen: 123 }));
  });

  try {
    const client = new HTTPAgentClient({ agentBridgeUrl: baseUrl, agentId: "foo" });
    const h = await client.health();
    assert.equal(h.healthy, true);
    assert.equal(h.lastSeen, 123);
  } finally {
    await stopMock(server);
  }
});
