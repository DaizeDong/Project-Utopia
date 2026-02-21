import { GameApp } from "./app/GameApp.js";

const canvas = document.getElementById("c");
if (!canvas) {
  throw new Error("Canvas #c not found");
}

const app = new GameApp(canvas);
app.start();

// Optional debug handle for quick console inspection.
window.__utopia = app;
