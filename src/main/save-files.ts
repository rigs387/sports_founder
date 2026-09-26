import { basename } from "node:path";
import { type BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from "electron";
import { z } from "zod";
import type { CloseState, FileDialogCopy, FileResult } from "../shared/save-files";
import { readCampaignFile, writeCampaignFile } from "./save-file-io";

const copySchema = z.strictObject({ title: z.string(), filter: z.string(), button: z.string() });
const closeSchema = z.strictObject({
  dirty: z.boolean(),
  busy: z.boolean(),
  title: z.string(),
  message: z.string(),
  detail: z.string(),
  stay: z.string(),
  leave: z.string(),
});

export interface FilePrompts {
  save: (copy: FileDialogCopy) => Promise<string | undefined>;
  open: (copy: FileDialogCopy) => Promise<string | undefined>;
  confirmClose: (state: CloseState) => Promise<boolean>;
}

export function attachSaveFiles(win: BrowserWindow): FilePrompts {
  let lastPath: string | undefined;
  let pendingLoadPath: string | undefined;
  let inFlight = false;
  let closing = false;
  let allowClose = false;
  let closeState: CloseState | null = null;
  const prompts: FilePrompts = {
    async confirmClose(state) {
      const result = await dialog.showMessageBox(win, {
        type: "question",
        title: state.title,
        message: state.message,
        detail: state.detail,
        buttons: [state.stay, state.leave],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return result.response === 1;
    },
    async save(copy) {
      const result = await dialog.showSaveDialog(win, {
        title: copy.title,
        buttonLabel: copy.button,
        defaultPath: lastPath ?? "campaign.sfsave",
        filters: [{ name: copy.filter, extensions: ["sfsave"] }],
      });
      return result.canceled ? undefined : result.filePath;
    },
    async open(copy) {
      const result = await dialog.showOpenDialog(win, {
        title: copy.title,
        buttonLabel: copy.button,
        properties: ["openFile"],
        filters: [{ name: copy.filter, extensions: ["sfsave", "json"] }],
      });
      return result.canceled ? undefined : result.filePaths[0];
    },
  };
  const trusted = (event: IpcMainInvokeEvent) =>
    event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame;
  async function run<T>(
    event: IpcMainInvokeEvent,
    operation: () => Promise<FileResult<T>>,
  ): Promise<FileResult<T>> {
    if (!trusted(event) || inFlight) return { status: "error" };
    inFlight = true;
    try {
      return await operation();
    } catch {
      return { status: "error" };
    } finally {
      inFlight = false;
    }
  }
  ipcMain.handle("campaign:save", (event, text: unknown, rawCopy: unknown) =>
    run(event, async () => {
      if (typeof text !== "string") throw new Error("Invalid save payload");
      JSON.parse(text);
      const path = await prompts.save(copySchema.parse(rawCopy));
      if (!path) return { status: "cancelled" };
      await writeCampaignFile(path, text);
      lastPath = path;
      return { status: "ok", value: basename(path) };
    }),
  );
  ipcMain.handle("campaign:open", (event, rawCopy: unknown) =>
    run(event, async () => {
      const path = await prompts.open(copySchema.parse(rawCopy));
      if (!path) return { status: "cancelled" };
      const text = await readCampaignFile(path);
      pendingLoadPath = path;
      return { status: "ok", value: { text, name: basename(path) } };
    }),
  );
  const onCloseState = (event: Electron.IpcMainEvent, value: unknown) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    const parsed = closeSchema.safeParse(value);
    if (parsed.success) closeState = parsed.data;
  };
  ipcMain.on("campaign:close-state", onCloseState);
  const onAcceptLoad = (event: Electron.IpcMainEvent) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    // Only a worker-validated load changes the next save dialog's default destination.
    if (pendingLoadPath) lastPath = pendingLoadPath;
    pendingLoadPath = undefined;
  };
  ipcMain.on("campaign:accept-load", onAcceptLoad);
  win.on("close", (event) => {
    if (allowClose || (!closeState?.dirty && !closeState?.busy && !inFlight)) return;
    event.preventDefault();
    if (closing || inFlight || closeState?.busy || !closeState) return;
    closing = true;
    void prompts
      .confirmClose(closeState)
      .then((confirmed) => {
        if (confirmed) {
          allowClose = true;
          win.close();
        }
      })
      .catch(() => {
        /* Keep the game open if the OS dialog fails. */
      })
      .finally(() => {
        closing = false;
      });
  });
  win.once("closed", () => {
    ipcMain.removeHandler("campaign:save");
    ipcMain.removeHandler("campaign:open");
    ipcMain.removeListener("campaign:close-state", onCloseState);
    ipcMain.removeListener("campaign:accept-load", onAcceptLoad);
  });
  return prompts;
}
