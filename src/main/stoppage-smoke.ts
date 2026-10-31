import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type { FilePrompts } from "./save-files";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * The stoppage (GDD v1.39, tech plan 2.25 step 4). After the agreement step this loads the
 * late-game campaign again, plays on to talks, puts the offer the union counts as worth least
 * (certain refusal) and confirms it. End Turn loses the season: its headline card, the Flagship
 * tab's notice, and once the year is over the season in review and the Almanac's roll.
 */
export async function verifyStoppage(
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
  const textOf = (selector: string) =>
    evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Stoppage smoke timed out: ${condition}`);
  };
  const checkText = (where: string, value: string) => {
    if (!value || value.includes("{{") || /\b(events|flagship|press|almanac)\.[a-z]/.test(value))
      throw new Error(`${where} shows a missing string: ${value.slice(0, 300)}`);
  };
  const turn = async () =>
    Number(await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`));
  const endTurn = async () => {
    const next = (await turn()) + 1;
    await click(".game-nav [data-view=world]");
    await evaluate(COLLECT_NEWS);
    await click('[data-testid="end-turn"]');
    await wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${next}; })()`,
    );
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const CARD = `${OFFSEASON} [data-testid="agreement-card"]`;
  const offseasonOpen = () =>
    evaluate<boolean>(`document.querySelector('${OFFSEASON}')?.dataset.open === 'true'`);

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

    const talks = () =>
      evaluate<boolean>(
        `document.querySelector('${OFFSEASON}')?.dataset.open === 'true' && document.querySelector('${CARD}')?.dataset.talks === 'true'`,
      );
    let turnsPlayed = 0;
    while (!(await talks()) && turnsPlayed < 8) {
      await endTurn();
      turnsPlayed += 1;
    }
    if (!(await talks())) throw new Error("No offseason with the players' talks open.");
    await click(".game-nav [data-view=offseason]");
    await wait(`!document.querySelector('${OFFSEASON}').hidden`);

    // The offer the union counts as worth least: the lowest share, the longest term, a cap and
    // a low minimum wage. Its read must be a certain refusal.
    await evaluate(`(() => {
      const input = document.querySelector('${CARD} [data-testid="agreement-share"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, input.min);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const radios = [...document.querySelectorAll('${CARD} input[name="agreement-term"]')];
      radios.at(-1).click();
      document.querySelector('${CARD} [data-testid="agreement-cap-on"]').click();
      document.querySelector('${CARD} [data-testid="agreement-min-wage-low"]').click();
    })()`);
    await delay();
    const read = await evaluate<string>(
      `document.querySelector('${CARD} [data-testid="agreement-read"]')?.dataset.read ?? ""`,
    );
    if (read !== "refuse") throw new Error(`The stingiest offer must be refused: ${read}`);
    await click(`${CARD} [data-testid="agreement-review"]`);
    await wait(`!!document.querySelector('${CARD} [data-testid="agreement-confirm"]')`);
    await click(`${CARD} [data-testid="agreement-confirm"]`);
    await wait(`document.querySelector('${CARD}').dataset.talks === 'false'`);
    const refused = await textOf(CARD);
    checkText("The agreement card", refused);
    await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
    await screenshot("61a-stoppage-refused.png");

    // End Turn: the season is lost. Its headline waits among the turn's news.
    const lostTurn = (await turn()) + 1;
    await click(".game-nav [data-view=world]");
    await evaluate(COLLECT_NEWS);
    await click('[data-testid="end-turn"]');
    await wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${lostTurn}; })()`,
    );
    const LOST = '[data-testid="moment-window"][data-event-template="season-lost"]';
    for (let tries = 0; tries < 30 && !(await exists(LOST)); tries += 1) {
      // Read the news brings the first window up; any other news before it is collected.
      if (await exists('[data-testid="moment-window-collect"]'))
        await click('[data-testid="moment-window-collect"]');
      else await click('[data-testid="end-turn"]');
      await delay(120);
    }
    if (!(await exists(LOST))) throw new Error("No season-lost headline after the stoppage.");
    const card = await textOf(LOST);
    checkText("The season-lost card", card);
    const weight = await evaluate<string>(`document.querySelector('${LOST}').dataset.weight ?? ""`);
    if (weight !== "headline") throw new Error(`The season-lost card is not a headline: ${weight}`);
    // Let the window finish fading in.
    await delay(700);
    await screenshot("61b-season-lost.png");
    await evaluate(COLLECT_NEWS);

    await click(".game-nav [data-view=flagship]");
    await wait(`!!document.querySelector('[data-testid="flagship-stoppage"]')`);
    const notice = await textOf('[data-testid="flagship-stoppage"]');
    checkText("The Flagship tab's stoppage notice", notice);
    if (!(await exists('[data-testid="broadcast-dark"]')))
      throw new Error("The broadcast panel does not show the broadcast dark.");
    await screenshot("61c-flagship-stoppage.png");

    // A year on, the offseason opens with no champion; the Almanac keeps the lost season.
    let lostTurns = 0;
    while (!(await offseasonOpen()) && lostTurns < 6) {
      await endTurn();
      lostTurns += 1;
    }
    if (!(await offseasonOpen())) throw new Error("The lost season never ended.");
    await click(".game-nav [data-view=offseason]");
    await wait(`!document.querySelector('${OFFSEASON}').hidden`);
    const story = await evaluate<string>(
      `document.querySelector('${OFFSEASON} [data-testid="season-recap"]')?.dataset.story ?? ""`,
    );
    if (story !== "lost") throw new Error(`The season in review is not the lost season: ${story}`);
    const recap = await textOf(`${OFFSEASON} [data-testid="season-recap"]`);
    checkText("The lost season's review", recap);
    await evaluate(
      `document.querySelector('${OFFSEASON} [data-testid="season-recap"]').scrollIntoView({ block: "center" })`,
    );
    await screenshot("61d-stoppage-recap.png");

    await click(".game-nav [data-view=almanac]");
    await wait(`!!document.querySelector('[data-testid="almanac-lost-season"]')`);
    const roll = await textOf('[data-testid="almanac-lost-season"]');
    checkText("The Almanac's lost season", roll);
    await evaluate(
      `document.querySelector('[data-testid="almanac-lost-season"]').scrollIntoView({ block: "center" })`,
    );
    await screenshot("61e-almanac-lost-season.png");
    await click(".game-nav [data-view=world]");
    return { turnsPlayed, read, card, notice, lostTurns, recap, roll };
  } finally {
    Object.assign(prompts, original);
  }
}
