import { GameApp } from "./app/GameApp.js";

const canvas = document.getElementById("c");
if (!canvas) {
  throw new Error("Canvas #c not found");
}

function mountBootError(message) {
  const panel = document.createElement("div");
  panel.id = "bootError";
  panel.style.position = "fixed";
  panel.style.right = "14px";
  panel.style.bottom = "14px";
  panel.style.zIndex = "9999";
  panel.style.maxWidth = "560px";
  panel.style.padding = "10px 12px";
  panel.style.borderRadius = "10px";
  panel.style.border = "1px solid rgba(173, 30, 30, 0.45)";
  panel.style.background = "rgba(255, 240, 240, 0.95)";
  panel.style.color = "#7a1818";
  panel.style.fontSize = "12px";
  panel.style.lineHeight = "1.4";
  panel.style.whiteSpace = "pre-wrap";
  panel.textContent = `Startup failed:\n${message}`;
  document.body.appendChild(panel);
}

let app = null;
const cleanupApp = () => {
  app?.dispose?.();
};
try {
  app = new GameApp(canvas);
  app.start();
  window.__utopia = app;
  window.__utopiaLongRun = {
    getTelemetry: () => app?.getLongRunTelemetry?.() ?? null,
    configure: (options) => app?.configureLongRunMode?.(options),
    clearAiManualModeLock: () => app?.clearAiManualModeLock?.(),
    setAiEnabled: (enabled, options) => app?.setAiEnabled?.(enabled, options),
    startRun: () => app?.startSession?.(),
    regenerate: (params, options) => app?.regenerateWorld?.(params, options),
    focusTile: (ix, iz, zoom) => app?.focusTile?.(ix, iz, zoom) ?? null,
    focusEntity: (entityId, zoom) => app?.focusEntity?.(entityId, zoom) ?? null,
    selectTile: (ix, iz, options) => app?.selectTile?.(ix, iz, options) ?? null,
    selectEntity: (entityId, options) => app?.selectEntity?.(entityId, options) ?? false,
    placeToolAt: (tool, ix, iz) => app?.placeToolAt?.(tool, ix, iz) ?? null,
    placeFirstValidBuild: (tool, centerIx, centerIz, radius) => app?.placeFirstValidBuild?.(tool, centerIx, centerIz, radius) ?? null,
    saveSnapshot: (slotId) => app?.saveSnapshot?.(slotId),
    loadSnapshot: (slotId) => app?.loadSnapshot?.(slotId),
  };
} catch (err) {
  const message = String(err?.message ?? err ?? "Unknown startup failure");
  console.error("[Project Utopia] startup failed:", err);
  window.__utopiaBootError = message;
  mountBootError(message);
}

window.addEventListener("beforeunload", cleanupApp);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    window.removeEventListener("beforeunload", cleanupApp);
    cleanupApp();
  });
}
