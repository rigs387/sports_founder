import type { BrowserWindow } from "electron";

/**
 * The Hall of Fame and the Almanac (GDD v1.31, tech plan 2.18 step 5). Runs last, after many
 * seasons. Plays on until a Hall of Fame class is inducted, screenshotting its card when it pops
 * up; then the Almanac tab in both layouts, and a plaque's home on the map.
 */
export async function verifyAlmanac(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const exists = (selector: string) =>
    evaluate<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Almanac smoke timed out: ${condition}`);
  };
  const text = (selector: string) =>
    evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const checkText = (where: string, value: string) => {
    if (value.includes("{{") || /almanac\.|hall\.|events\.cards/.test(value))
      throw new Error(`${where} shows a missing string: ${value.slice(0, 300)}`);
  };
  const ALMANAC = '[data-testid="almanac-screen"]';
  const HALL_CARD = '.moment-window[data-family="hall"]';
  const inductees = async () =>
    Number(await evaluate<string>(`document.querySelector('${ALMANAC}').dataset.inductees`));

  // Collects the news one window at a time, shooting the first class card seen.
  let card = "";
  const collect = async () => {
    for (let tries = 0; tries < 60; tries += 1) {
      const waiting = await evaluate<string>(
        `document.querySelector('[data-testid="end-turn"]')?.dataset.news ?? "0"`,
      );
      if (waiting === "0") return;
      if (!(await exists('[data-testid="moment-window-collect"]'))) {
        await click('[data-testid="end-turn"]');
        await delay(80);
        continue;
      }
      if (!card && (await exists(HALL_CARD))) {
        card = await text(HALL_CARD);
        checkText("The Hall of Fame card", card);
        // Let the window finish fading in.
        await delay(700);
        await screenshot("55-hall-card.png");
      }
      await click('[data-testid="moment-window-collect"]');
      await delay(80);
    }
  };
  let turnsPlayed = 0;
  const endTurn = async () => {
    const next =
      Number(
        await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`),
      ) + 1;
    await collect();
    await click('[data-testid="end-turn"]');
    await wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${next}; })()`,
    );
    turnsPlayed += 1;
    await delay(120);
  };

  await click(".game-nav [data-view=world]");
  await delay();
  while (((await inductees()) === 0 || !card) && turnsPlayed < 60) await endTurn();
  await collect();
  if ((await inductees()) === 0) throw new Error("No Hall of Fame class after many seasons.");

  // The Almanac: the Hall's wings, the waiting list and the records, wide and narrow.
  await click(".game-nav [data-view=almanac]");
  await wait(`!document.querySelector('${ALMANAC}').hidden`);
  const page = await text(ALMANAC);
  checkText("The Almanac", page);
  const roll = await evaluate<number>(
    `document.querySelectorAll('[data-testid="almanac-roll"] li').length`,
  );
  if (roll < 1) throw new Error("The Almanac's roll of champions is empty after many seasons.");
  const players = await evaluate<number>(
    `document.querySelectorAll('[data-testid="hall-players"] .plaque').length`,
  );
  const moments = await evaluate<number>(
    `document.querySelectorAll('[data-testid="hall-moments"] li').length`,
  );
  await screenshot("56-almanac.png");
  win.setContentSize(390, 844);
  await delay();
  const overflow = await evaluate<boolean>("document.documentElement.scrollWidth > innerWidth");
  await screenshot("57-almanac-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (overflow) throw new Error("The Almanac overflows on a narrow viewport.");

  // A plaque's home: the country card names its Hall of Fame players.
  let country = "";
  if (players > 0) {
    await click(".plaque-home");
    await wait(`!!document.querySelector('[data-testid="country-hall"]')`);
    country = await text('[data-testid="country-hall"]');
    checkText("The country card's Hall of Fame line", country);
    await evaluate(
      `document.querySelector('[data-testid="country-hall"]').scrollIntoView({ block: "start" })`,
    );
    await screenshot("58-hall-country.png");
    await click(".card-close");
  } else await click(".game-nav [data-view=world]");
  return { turnsPlayed, players, moments, roll, card: card.slice(0, 200), country };
}
