import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { attachSaveFiles } from "./save-files";
import { attachSmokeTest } from "./smoke";

if (process.env.SF_SMOKE_OUT) app.commandLine.appendSwitch("force-device-scale-factor", "1");

// Security posture (tech plan 8.4): the game window never loads remote content, and external
// links open in the system browser. Steam overlay settings are deferred with Steam integration.

function isExternalWebUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,
    show: false,
    title: "Sports Founder",
    backgroundColor: "#97dbe3",
    webPreferences: {
      preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !process.env.SF_SMOKE_OUT,
    },
  });

  const filePrompts = attachSaveFiles(win);

  win.once("ready-to-show", () => {
    if (!process.env.SF_SMOKE_OUT) win.show();
  });

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
  if (smokeOutDir) attachSmokeTest(win, smokeOutDir, filePrompts);

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
