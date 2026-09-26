import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { readCampaignFile } from "./save-file-io";
import type { FilePrompts } from "./save-files";

/** Only the OS picker is substituted. UI, preload, IPC, disk, worker and validation are real. */
export async function verifySaves(
  win: BrowserWindow,
  outDir: string,
  prompts: FilePrompts,
  screenshot: (name: string) => Promise<void>,
) {
  const original = { ...prompts };
  const saved = join(outDir, "campaign.sfsave");
  const continued = join(outDir, "continued.sfsave");
  const resumed = join(outDir, "resumed.sfsave");
  const invalid = join(outDir, "invalid.sfsave");
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const click = (id: string) =>
    win.webContents.executeJavaScript(
      `document.querySelector('[data-testid="${id}"]').click()`,
      true,
    );
  const wait = async (condition: string) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new Error(`Save smoke timed out: ${condition}`);
  };
  const notice = (value: string) =>
    wait(`document.querySelector('[data-notice="${value}"]') !== null`);
  const close = () =>
    win.webContents.executeJavaScript(
      `document.querySelector('.save-dialog header button').click()`,
      true,
    );
  const open = async () => {
    await wait(`!document.querySelector('[data-testid="campaign-files"]').disabled`);
    await click("campaign-files");
    await wait(`document.querySelector('[data-testid="save-dialog"]').open`);
  };
  const load = async () => {
    await click("load-campaign");
    if (await evaluate<boolean>(`!!document.querySelector('[data-testid="confirm-load"]')`))
      await click("confirm-load");
  };
  const advance = async () => {
    const turn = await evaluate<number>(
      `Number(document.querySelector('[data-testid="game"]').dataset.turn)`,
    );
    await click("end-turn");
    await wait(
      `document.querySelector('[data-testid="game"]').dataset.status === 'ready' && Number(document.querySelector('[data-testid="game"]').dataset.turn) === ${turn + 1}`,
    );
  };
  try {
    let closeCancelled = false;
    prompts.confirmClose = async (state) => {
      closeCancelled = state.dirty;
      return false;
    };
    win.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!closeCancelled || win.isDestroyed())
      throw new Error("Unsaved campaign closed without protection");
    await open();
    // Cancellation and a failed atomic replacement keep the campaign playable and unsaved.
    prompts.save = async () => undefined;
    await click("save-campaign");
    await wait(`document.querySelector('[data-testid="game"]').dataset.status === 'ready'`);
    prompts.save = async () => join(outDir, "missing-folder", "cannot-save.sfsave");
    await click("save-campaign");
    await notice("saveError");
    prompts.save = async () => saved;
    await click("save-campaign");
    await notice("saved");
    await screenshot("22-campaign-saved.png");
    const originalText = await readCampaignFile(saved);
    const originalSave = JSON.parse(originalText);
    if (Object.values(originalSave.history).some((points) => (points as unknown[]).length < 2))
      throw new Error("Missing country history");
    await writeFile(invalid, '{"broken":', "utf8");
    prompts.open = async () => invalid;
    await load();
    await notice("invalid");
    // Saving after a rejected load must give the exact original state and history.
    await click("save-campaign");
    await notice("saved");
    if ((await readCampaignFile(saved)) !== originalText)
      throw new Error("Invalid load changed campaign");
    await close();
    await advance();
    await open();
    await click("load-campaign");
    await wait(`!!document.querySelector('[data-testid="load-confirmation"]')`);
    await screenshot("23-unsaved-progress.png");
    await win.webContents.executeJavaScript(
      `document.querySelector('.save-replace button').click()`,
      true,
    );
    prompts.save = async () => continued;
    await click("save-campaign");
    await notice("saved");
    win.setContentSize(390, 844);
    await screenshot("24-save-narrow.png");
    if (
      !(await evaluate<boolean>(
        `document.documentElement.scrollWidth <= innerWidth && document.querySelector('.save-dialog').scrollWidth <= document.querySelector('.save-dialog').clientWidth`,
      ))
    )
      throw new Error("Save menu overflows");
    win.setContentSize(1280, 800);
    await close();
    // A renderer reload creates a fresh worker and store, so this cannot pass on in-memory state.
    win.webContents.reload();
    await wait(
      `!!document.querySelector('[data-testid="campaign-setup"]') && !!window.saveFiles && !document.querySelector('[data-testid="game"]')`,
    );
    await open();
    await wait(`!document.querySelector('[data-testid="load-campaign"]').disabled`);
    await screenshot("25-load-from-setup.png");
    prompts.open = async () => saved;
    await load();
    await wait(`document.querySelector('[data-testid="game"]')?.dataset.status === 'ready'`);
    await open();
    prompts.save = async () => resumed;
    await click("save-campaign");
    await notice("saved");
    if ((await readCampaignFile(resumed)) !== originalText)
      throw new Error("Reload did not restore complete session");
    await close();
    await advance();
    await open();
    await click("save-campaign");
    await notice("saved");
    if ((await readCampaignFile(resumed)) !== (await readCampaignFile(continued)))
      throw new Error("Resumed turn differs from uninterrupted campaign");
    await screenshot("26-resumed-campaign.png");
    await close();
    return {
      diskRoundTrip: true,
      freshWorker: true,
      identicalContinuation: true,
      historyPreserved: true,
      invalidLoadPreservedCampaign: true,
      saveBytes: (await stat(saved)).size,
      uncompressedBytes: Buffer.byteLength(originalText),
      closeCancelled,
      turn: originalSave.campaign.state.turn,
    };
  } finally {
    prompts.save = original.save;
    prompts.open = original.open;
    prompts.confirmClose = original.confirmClose;
  }
}
