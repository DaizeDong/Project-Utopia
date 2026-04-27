const fs = require("fs");
const os = require("os");
const path = require("path");

const LOG_PATH = path.join(os.tmpdir(), "project-utopia-desktop.log");
function logLine(message) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // ignore log write failures
  }
}

process.on("uncaughtException", (err) => {
  logLine(`uncaughtException: ${String(err && (err.stack || err.message) ? (err.stack || err.message) : err)}`);
});
process.on("unhandledRejection", (err) => {
  logLine(`unhandledRejection: ${String(err && (err.stack || err.message) ? (err.stack || err.message) : err)}`);
});

logLine("main bootstrap start");
const { app, BrowserWindow, dialog, shell } = require("electron");
logLine(`electron loaded: app=${Boolean(app)} BrowserWindow=${Boolean(BrowserWindow)} dialog=${Boolean(dialog)} shell=${Boolean(shell)}`);

let mainWindow = null;
let desktopServer = null;
let closingPromise = null;

function getAllowedOrigin() {
  return desktopServer?.origin ?? "";
}

async function stopDesktopServer() {
  if (!desktopServer || closingPromise) {
    return closingPromise || Promise.resolve();
  }
  closingPromise = desktopServer.close()
    .catch((err) => {
      logLine(`stopDesktopServer error: ${String(err && (err.stack || err.message) ? (err.stack || err.message) : err)}`);
    })
    .finally(() => {
      desktopServer = null;
      closingPromise = null;
    });
  return closingPromise;
}

async function createMainWindow() {
  logLine("createMainWindow start");
  const { startDesktopServer } = await import("./server.mjs");
  desktopServer = await startDesktopServer();
  logLine(`desktop server started at ${desktopServer.origin}`);

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a1420",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const allowedOrigin = getAllowedOrigin();
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (allowedOrigin && url.startsWith(allowedOrigin)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  win.once("ready-to-show", () => {
    logLine("window ready-to-show");
    win.show();
  });

  await win.loadURL(`${allowedOrigin}/`);
  logLine(`window loaded ${allowedOrigin}/`);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
logLine(`single instance lock: ${gotLock}`);
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    logLine("second-instance event");
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady()
    .then(async () => {
      logLine("app.whenReady resolved");
      mainWindow = await createMainWindow();
    })
    .catch(async (err) => {
      const detail = String(err && (err.stack || err.message) ? (err.stack || err.message) : err);
      logLine(`startup catch: ${detail}`);
      try {
        dialog.showErrorBox("Project Utopia failed to start", detail);
      } catch {
        // ignore
      }
      await stopDesktopServer();
      app.exit(1);
    });

  app.on("activate", async () => {
    logLine("activate event");
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = await createMainWindow();
  });

  app.on("window-all-closed", async () => {
    logLine("window-all-closed event");
    if (process.platform === "darwin") return;
    await stopDesktopServer();
    app.quit();
  });

  app.on("before-quit", async () => {
    logLine("before-quit event");
    await stopDesktopServer();
  });
}
