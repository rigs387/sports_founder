import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type { GameState } from "../sim";
import { readCampaignFile } from "./save-file-io";
import type { FilePrompts } from "./save-files";
import { COLLECT_NEWS } from "./smoke-news";

/** Drives real story cards and file controls; only OS file pickers are substituted. */
export async function verifyEvents(
  win: BrowserWindow,
  outDir: string,
  prompts: FilePrompts,
  screenshot: (name: string) => Promise<void>,
) {
  const original = { ...prompts };
  const pendingFile = join(outDir, "events-pending.sfsave");
  const effectsFile = join(outDir, "events-effects.sfsave");
  const restoredFile = join(outDir, "events-restored.sfsave");
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const click = (selector: string) =>
    win.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
      true,
    );
  const wait = async (condition: string) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new Error(`Event smoke timed out: ${condition}`);
  };
  const ready = () =>
    wait(`document.querySelector('[data-testid="game"]').dataset.status === 'ready'`);
  const read = () =>
    evaluate<{ pp: number; turn: number; quarter: number; history: number }>(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return {pp:Number(g.dataset.pp),turn:Number(g.dataset.turn),quarter:Number(g.dataset.quarter),history:Number(document.querySelector('[data-testid="country-card"]')?.dataset.historyPoints)}; })()`,
    );
  const menu = () => click('[data-testid="campaign-files"]');
  const closeMenu = () => click(".save-dialog header button");
  const board = async () => {
    await click('[data-testid="events-open"]');
    await wait(`document.querySelector('[data-testid="event-board"]').open`);
  };
  const closeBoard = () => click('[data-testid="events-close"]');
  const save = async (path: string) => {
    prompts.save = async () => path;
    await menu();
    await click('[data-testid="save-campaign"]');
    await wait(`document.querySelector('[data-notice="saved"]') !== null`);
    await closeMenu();
  };
  const choose = async () => {
    await click('[data-choice="regulars"] button');
    await wait(`!!document.querySelector('[data-testid="event-confirm"]')`);
    await win.webContents.executeJavaScript(
      `(() => { const chooseButton=document.querySelector('[data-testid="event-choose"]');chooseButton.click();chooseButton.click(); })()`,
      true,
    );
    await ready();
    await wait(`!!document.querySelector('[data-testid="event-resolved"]')`);
  };
  try {
    await win.webContents.executeJavaScript(COLLECT_NEWS, true);
    await click('[data-testid="end-turn"]');
    await ready();
    await board();
    await wait(`!!document.querySelector('[data-event-template="open-doors"]')`);
    await screenshot("27-event-decision.png");
    const before = await read();
    await click('[data-choice="regulars"] button');
    await screenshot("28-event-confirm.png");
    await click(".event-confirm button");
    if (JSON.stringify(await read()) !== JSON.stringify(before))
      throw new Error("Review cancelled with a mutation");
    win.setContentSize(390, 844);
    await screenshot("29-events-narrow.png");
    if (
      !(await evaluate<boolean>(
        `document.querySelector('.event-board').scrollWidth <= document.querySelector('.event-board').clientWidth && document.documentElement.scrollWidth <= innerWidth`,
      ))
    )
      throw new Error("Event board overflows");
    win.setContentSize(1280, 800);
    await closeBoard();
    await save(pendingFile);
    await board();
    await choose();
    if (JSON.stringify(await read()) !== JSON.stringify(before))
      throw new Error("A free decision advanced time, changed PP or added history");
    await screenshot("30-event-resolved.png");
    await closeBoard();
    await save(effectsFile);
    const applied = JSON.parse(await readCampaignFile(effectsFile)).campaign.state as GameState;
    const modifiers = applied.events.modifiers.filter((m) => m.countryId === "brazil");
    if (modifiers.length !== 2 || !modifiers.every((m) => m.endQuarter === applied.quarter + 4))
      throw new Error("Decision applied twice or wrong duration");
    // Load the pre-choice file through the UI; the original pending decision must return intact.
    prompts.open = async () => pendingFile;
    await menu();
    await click('[data-testid="load-campaign"]');
    await wait(`document.querySelector('[data-notice="loaded"]') !== null`);
    await closeMenu();
    await save(restoredFile);
    if ((await readCampaignFile(restoredFile)) !== (await readCampaignFile(pendingFile)))
      throw new Error("Pending choice did not survive save/load exactly");
    await board();
    await choose();
    const moment = await evaluate<string | null>(
      `document.querySelector('[data-event-kind="moment"]')?.dataset.eventId ?? null`,
    );
    if (!moment) throw new Error("No first audience reward");
    const rewardBefore = await read();
    await win.webContents.executeJavaScript(
      `const momentButton=document.querySelector('[data-event-id="${moment}"][data-event-kind="moment"]');momentButton.click();momentButton.click();`,
      true,
    );
    await ready();
    const rewardAfter = await read();
    const pendingSave = JSON.parse(await readCampaignFile(pendingFile)).campaign.state as GameState;
    if (!pendingSave.events.pending.some((e) => e.id === Number(moment)))
      throw new Error("Unrecorded event opened");
    if (
      rewardAfter.pp <= rewardBefore.pp ||
      rewardAfter.turn !== rewardBefore.turn ||
      rewardAfter.history !== rewardBefore.history
    )
      throw new Error("Moment reward did not collect without advancing time");
    await screenshot("31-event-moment.png");
    await closeBoard();
    return {
      pendingChoiceRestored: true,
      timedEffectsSaved: true,
      choiceAppliedOnce: true,
      cancelPreservedState: true,
      reward: rewardAfter.pp - rewardBefore.pp,
      narrowOverflow: false,
    };
  } finally {
    prompts.save = original.save;
    prompts.open = original.open;
  }
}
