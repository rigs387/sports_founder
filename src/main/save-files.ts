import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, type BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from "electron";
import { z } from "zod";
import type {
  CloseState,
  FileDialogCopy,
  FileResult,
  SaveEntry,
  SaveHeader,
} from "../shared/save-files";
import { readCampaignFile, writeCampaignFile } from "./save-file-io";

/** Autosaves kept, newest first (GDD v1.35). */
const AUTOSAVES = 3;
/** Saves the Load screen lists at most, newest first. */
const LISTED = 40;
const autosaveName = (n: number) => `autosave-${n}.sfsave`;
const headerSchema = z.strictObject({
  sportName: z.string(),
  anchorCountryId: z.string(),
  turn: z.int().min(1),
  year: z.int(),
  quarterOfYear: z.int().min(1).max(4),
});

/**
 * The saves folder (GDD v1.35): Windows' Saved Games\Sports Founder, not synced by OneDrive by
 * default; elsewhere the app's data folder. A smoke run keeps its saves in its output folder.
 */
export function savesFolder(): string {
  if (process.env.SF_SMOKE_OUT) return join(process.env.SF_SMOKE_OUT, "saves");
  if (process.platform === "win32")
    return join(app.getPath("home"), "Saved Games", "Sports Founder");
  return join(app.getPath("userData"), "saves");
}

/** A save's header, or null if it has none or cannot be read. */
async function readHeader(path: string): Promise<SaveHeader | null> {
  try {
    const raw = JSON.parse(await readCampaignFile(path)) as { header?: unknown };
    const parsed = headerSchema.safeParse(raw.header);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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

/** Creates the saves folder on first use and returns it. */
async function ensureFolder(): Promise<string> {
  const folder = savesFolder();
  await mkdir(folder, { recursive: true });
  return folder;
}

export function attachSaveFiles(win: BrowserWindow): FilePrompts {
  let lastPath: string | undefined;
  let autosaving = false;
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
        defaultPath: lastPath ?? join(await ensureFolder(), "campaign.sfsave"),
        filters: [{ name: copy.filter, extensions: ["sfsave"] }],
      });
      return result.canceled ? undefined : result.filePath;
    },
    async open(copy) {
      const result = await dialog.showOpenDialog(win, {
        title: copy.title,
        buttonLabel: copy.button,
        properties: ["openFile"],
        defaultPath: await ensureFolder(),
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
  ipcMain.handle("campaign:list", async (event): Promise<FileResult<SaveEntry[]>> => {
    if (!trusted(event)) return { status: "error" };
    try {
      const folder = await ensureFolder();
      const files = (await readdir(folder)).filter((name) => name.endsWith(".sfsave"));
      const stamped = await Promise.all(
        files.map(async (name) => ({ name, savedAt: (await stat(join(folder, name))).mtimeMs })),
      );
      stamped.sort((a, b) => b.savedAt - a.savedAt);
      const entries = await Promise.all(
        stamped.slice(0, LISTED).map(
          async ({ name, savedAt }): Promise<SaveEntry> => ({
            name,
            savedAt,
            autosave: /^autosave-\d+\.sfsave$/.test(name),
            header: await readHeader(join(folder, name)),
          }),
        ),
      );
      return { status: "ok", value: entries };
    } catch {
      return { status: "error" };
    }
  });
  ipcMain.handle("campaign:open-named", (event, rawName: unknown) =>
    run(event, async () => {
      // Only a plain file name in the saves folder: no paths reach the renderer or come from it.
      const name = z
        .string()
        .regex(/^[^\\/:*?"<>|]+\.sfsave$/)
        .parse(rawName);
      if (basename(name) !== name) throw new Error("Not a save name");
      const path = join(await ensureFolder(), name);
      const text = await readCampaignFile(path);
      pendingLoadPath = path;
      return { status: "ok", value: { text, name } };
    }),
  );
  ipcMain.handle("campaign:autosave", async (event, text: unknown) => {
    // Never blocks or waits on the player's own saves; a turn's autosave is skipped if busy.
    if (!trusted(event) || autosaving || typeof text !== "string") return { status: "error" };
    autosaving = true;
    try {
      JSON.parse(text);
      const folder = await ensureFolder();
      await rm(join(folder, autosaveName(AUTOSAVES)), { force: true });
      for (let n = AUTOSAVES - 1; n >= 1; n -= 1)
        await rename(join(folder, autosaveName(n)), join(folder, autosaveName(n + 1))).catch(
          () => undefined,
        );
      await writeCampaignFile(join(folder, autosaveName(1)), text);
      return { status: "ok", value: autosaveName(1) };
    } catch {
      return { status: "error" };
    } finally {
      autosaving = false;
    }
  });
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
    ipcMain.removeHandler("campaign:list");
    ipcMain.removeHandler("campaign:open-named");
    ipcMain.removeHandler("campaign:autosave");
    ipcMain.removeListener("campaign:close-state", onCloseState);
    ipcMain.removeListener("campaign:accept-load", onAcceptLoad);
  });
  return prompts;
}
