import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type { FilePrompts } from "./save-files";

/**
 * Late card rewards (GDD v1.39, tech plan 2.25 step 5). After the stoppage step this loads the
 * late-game campaign again (PP tier 5) and plays on until a news window pays a late reward: cash
 * into a league or tradition weight, in words, with no PP line.
 */
export async function verifyLateRewards(
  win: BrowserWindow,
  outDir: string,
  prompts: FilePrompts,
  screenshot: (name: string) => Promise<void>,
) {
  const original = { ...prompts };
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const exists = (selector: string) =>
    evaluate<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Late rewards smoke timed out: ${condition}`);
  };
  const turn = async () =>
    Number(await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`));
  const WINDOW = '[data-testid="moment-window"]';
  const REWARD = `${WINDOW} .moment-reward [data-effect]`;

  try {
    prompts.open = async () => join(outDir, "late-game.sfsave");
    await click(".game-nav [data-view=world]");
    await wait(`!document.querySelector('[data-testid="campaign-files"]').disabled`);
    await click('[data-testid="campaign-files"]');
    await wait(`document.querySelector('[data-testid="save-dialog"]').open`);
    await click('[data-testid="load-campaign"]');
    await delay();
    if (await exists('[data-testid="confirm-load"]')) await click('[data-testid="confirm-load"]');
    await wait(
      `(() => { const g = document.querySelector('[data-testid="game"]'); return g.dataset.status === "ready" && document.querySelector('[data-testid="retrospective-screen"]')?.hidden !== false; })()`,
    );
    await wait(`!document.querySelector(".save-dialog header button").disabled`);
    await click(".save-dialog header button");
    await click(".game-nav [data-view=world]");

    // Each turn's big news comes up one window at a time; collect each until one pays a reward.
    let turnsPlayed = 0;
    while (!(await exists(REWARD)) && turnsPlayed < 12) {
      if (await exists('[data-testid="moment-window-collect"]')) {
        await click('[data-testid="moment-window-collect"]');
        await delay(120);
        continue;
      }
      const next = (await turn()) + 1;
      await click('[data-testid="end-turn"]');
      await delay(120);
      if (await exists(WINDOW)) continue;
      await wait(
        `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && (Number(g.dataset.turn) === ${next} || !!document.querySelector('${WINDOW}')); })()`,
      );
      if ((await turn()) === next) turnsPlayed += 1;
    }
    if (!(await exists(REWARD))) throw new Error("No late card paid a reward in 12 turns.");
    const kind = await evaluate<string>(`document.querySelector('${REWARD}').dataset.effect`);
    const template = await evaluate<string>(
      `document.querySelector('${WINDOW}').dataset.eventTemplate`,
    );
    const reward = await evaluate<string>(
      `document.querySelector('${WINDOW} .moment-reward').textContent ?? ""`,
    );
    if (!reward || reward.includes("{{") || /\bevents\.[a-z]/.test(reward))
      throw new Error(`The late reward shows a missing string: ${reward}`);
    if (/\bPP\b/.test(reward)) throw new Error(`A late card still pays PP: ${reward}`);
    if (kind === "leagueCash" && !reward.includes("$"))
      throw new Error(`League cash is not shown in dollars: ${reward}`);
    // Let the window finish fading in.
    await delay(700);
    await screenshot("62-late-card-reward.png");
    return { turnsPlayed, template, kind, reward };
  } finally {
    Object.assign(prompts, original);
  }
}
