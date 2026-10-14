import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type { FilePrompts } from "./save-files";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * Retiring and the retrospective (GDD v1.38, tech plan 2.24 step 2). Runs last, on its own
 * campaign: the launcher (`scripts/smoke.ts`) has a bot play a long campaign to a win and saves
 * it as `late-game.sfsave`. Loads it through the real Load path, shows the World Championship's
 * page with real tournaments, retires, checks the retrospective and that no turn can be played,
 * then saves the retired campaign and loads it again: it opens on the retrospective.
 */
export async function verifyRetirement(
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
    throw new Error(`Retirement smoke timed out: ${condition}`);
  };
  const text = (selector: string) =>
    evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const count = (selector: string) =>
    evaluate<number>(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const checkText = (where: string, value: string) => {
    if (value.includes("{{") || /\b(retrospective|retire|championship|almanac)\.[a-z]/.test(value))
      throw new Error(`${where} shows a missing string: ${value.slice(0, 300)}`);
  };
  const turn = () =>
    evaluate<number>(`Number(document.querySelector('[data-testid="game"]')?.dataset.turn ?? 0)`);
  // Auto-collect may act as soon as a campaign loads, clearing the "loaded" notice: each load
  // waits for something only its campaign shows.
  const load = async (path: string, loaded: string) => {
    prompts.open = async () => path;
    await wait(`!document.querySelector('[data-testid="campaign-files"]').disabled`);
    await click('[data-testid="campaign-files"]');
    await wait(`document.querySelector('[data-testid="save-dialog"]').open`);
    await click('[data-testid="load-campaign"]');
    await delay();
    if (await exists('[data-testid="confirm-load"]')) await click('[data-testid="confirm-load"]');
    await wait(loaded);
    await wait(`!document.querySelector(".save-dialog header button").disabled`);
    await click(".save-dialog header button");
  };
  const SCREEN = '[data-testid="retrospective-screen"]';
  const retired = join(outDir, "retired.sfsave");

  try {
    // The late-game campaign has another anchor than the smoke campaign (scripts/smoke.ts).
    const anchor = await evaluate<string>(
      `document.querySelector('[data-testid="game"]').dataset.anchor`,
    );
    await load(
      join(outDir, "late-game.sfsave"),
      `(() => { const g = document.querySelector('[data-testid="game"]'); return g.dataset.status === "ready" && g.dataset.anchor !== ${JSON.stringify(anchor)}; })()`,
    );
    const loadedTurn = await turn();
    await click(".game-nav [data-view=world]");
    await evaluate(COLLECT_NEWS);
    await click(".game-nav [data-view=world]");
    await delay();

    // The World Championship's page, for once with real tournaments on it.
    let tournaments = 0;
    if (await exists(".game-nav [data-view=championship]")) {
      await click(".game-nav [data-view=championship]");
      await wait(`!document.querySelector('[data-testid="championship-screen"]').hidden`);
      checkText("The championship page", await text('[data-testid="championship-screen"]'));
      tournaments = Number(
        await evaluate<string>(
          `document.querySelector('[data-testid="championship-screen"]').dataset.tournaments`,
        ),
      );
      await screenshot("60-late-championship.png");
      await click(".game-nav [data-view=world]");
      await delay();
    }

    // Retire: offered on the objective card after the win, behind a confirmation.
    if (!(await exists('[data-testid="retire-open"]')))
      throw new Error("A won campaign does not offer Retire.");
    await screenshot("61-late-world.png");
    await click('[data-testid="retire-open"]');
    await wait(`document.querySelector('[data-testid="retire-dialog"]').open`);
    checkText("The retire dialog", await text('[data-testid="retire-dialog"]'));
    await screenshot("62-retire-confirm.png");
    await click('[data-testid="retire-cancel"]');
    await wait(`!document.querySelector('[data-testid="retire-dialog"]').open`);
    if (await exists(SCREEN)) throw new Error("Cancelling the retirement retired anyway.");
    await click('[data-testid="retire-open"]');
    await click('[data-testid="retire-confirm"]');
    await wait(`document.querySelector('${SCREEN}')?.hidden === false`);
    await delay(400);

    // The retrospective: every section, from records.
    const page = await text(SCREEN);
    checkText("The retrospective", page);
    const sections = {
      timeline: await count('[data-testid="retrospective-timeline"] li'),
      chart: await count('[data-testid="retrospective-chart"]'),
      legacy: await count('[data-testid="retrospective-legacy"] li.met'),
      champions: await count('[data-testid="retrospective-champions"] li'),
      hall: await count('[data-testid="retrospective-hall"] li'),
      amendments: await count('[data-testid="retrospective-rules"] li'),
    };
    const kinds = await evaluate<string[]>(
      `[...document.querySelectorAll('[data-testid="retrospective-timeline"] li')].map((li) => li.dataset.kind)`,
    );
    if (kinds[0] !== "founded" || kinds.at(-1) !== "retired" || !kinds.includes("won"))
      throw new Error(`The timeline is missing its ends or the win: ${kinds.join(", ")}`);
    if (sections.chart !== 1) throw new Error("The retrospective has no fan chart.");
    await screenshot("63-retrospective.png");
    await evaluate(
      `document.getElementById("retrospective-timeline-heading").scrollIntoView({ block: "start" })`,
    );
    await delay();
    await screenshot("64-retrospective-timeline.png");
    await evaluate(
      `document.getElementById("retrospective-title").scrollIntoView({ block: "start" })`,
    );
    win.setContentSize(390, 844);
    await delay();
    const overflow = await evaluate<boolean>("document.documentElement.scrollWidth > innerWidth");
    await screenshot("65-retrospective-narrow.png");
    win.setContentSize(1280, 800);
    await delay();
    if (overflow) throw new Error("The retrospective overflows on a narrow viewport.");

    // The campaign is over: no turn can be played, and Retire is gone.
    await click('[data-testid="retrospective-world"]');
    await delay();
    const endTurnDisabled = await evaluate<boolean>(
      `document.querySelector('[data-testid="end-turn"]').disabled`,
    );
    if (!endTurnDisabled) throw new Error("A retired campaign can still end a turn.");
    if (await exists('[data-testid="retire-open"]'))
      throw new Error("A retired campaign still offers Retire.");
    checkText("The retired notice", await text('[data-testid="retired-notice"]'));
    await screenshot("66-retired-world.png");

    // The save stays loadable: saved, loaded again, it opens on the retrospective.
    prompts.save = async () => retired;
    await click('[data-testid="campaign-files"]');
    await wait(`document.querySelector('[data-testid="save-dialog"]').open`);
    await click('[data-testid="save-campaign"]');
    await wait(`document.querySelector('[data-notice="saved"]') !== null`);
    await click(".save-dialog header button");
    // The world map is showing: only a load brings the retrospective back.
    await load(retired, `document.querySelector('${SCREEN}')?.hidden === false`);
    const reloaded = await count('[data-testid="retrospective-timeline"] li');
    if (reloaded !== sections.timeline)
      throw new Error("The retired save's retrospective differs after loading.");
    return { loadedTurn, tournaments, ...sections, endTurnDisabled, reloadedOnRetrospective: true };
  } finally {
    prompts.save = original.save;
    prompts.open = original.open;
  }
}
