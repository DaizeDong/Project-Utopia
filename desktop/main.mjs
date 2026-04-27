import { app, BrowserWindow, dialog, shell } from "electron/main";

import { startDesktopServer } from "./server.mjs";

let mainWindow = null;
let desktopServer = null;
let closingPromise = null;

function getAllowedOrigin() {
  return desktopServer?.origin ?? "";
}

async function stopDesktopServer() {
  if (!desktopServer || closingPromise) {
    return closingPromise ?? Promise.resolve();
  }
  closingPromise = desktopServer.close()
    .catch(() => {})
    .finally(() => {
      desktopServer = null;
      closingPromise = null;
    });
  return closingPromise;
}

async function createMainWindow() {
  desktopServer = await startDesktopServer();

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
    win.show();
  });

  await win.loadURL(`${allowedOrigin}/`);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady()
    .then(async () => {
      mainWindow = await createMainWindow();
    })
    .catch(async (err) => {
      const detail = String(err?.stack ?? err?.message ?? err);
      console.error(detail);
      dialog.showErrorBox("Project Utopia failed to start", detail);
      await stopDesktopServer();
      app.exit(1);
    });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = await createMainWindow();
  });

  app.on("window-all-closed", async () => {
    if (process.platform === "darwin") return;
    await stopDesktopServer();
    app.quit();
  });

  app.on("before-quit", async () => {
    await stopDesktopServer();
  });
}
