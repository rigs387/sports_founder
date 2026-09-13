import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { attachSmokeTest } from "./smoke";

// Security posture (tech plan 8.4): the game window never loads remote content, and external
// links open in the system browser. Steam overlay settings are deferred with Steam integration.

function isExternalWebUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "Sports Founder",
    backgroundColor: "#f3eee2",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const current = win.webContents.getURL();
    if (current && new URL(url).origin === new URL(current).origin) return;
    event.preventDefault();
    if (isExternalWebUrl(url)) void shell.openExternal(url);
  });

  const smokeOutDir = process.env.SF_SMOKE_OUT;
  if (smokeOutDir) attachSmokeTest(win, smokeOutDir);

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(fileURLToPath(new URL("../renderer/index.html", import.meta.url)));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
