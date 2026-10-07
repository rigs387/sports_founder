import type { BrowserWindow } from "electron";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * Venues (GDD v1.30, tech plan 2.17 step 4). Plays on to an open offseason, reviews and builds the
 * seat's next venue level on the offseason screen (the review states the price and when it opens),
 * checks the level under construction, no unfilled words, the narrow layout, and that the Flagship
 * tab's venue card is read-only.
 */
export async function verifyVenue(win: BrowserWindow, screenshot: (name: string) => Promise<void>) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Venue smoke timed out: ${condition}`);
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const FLAGSHIP = '[data-testid="flagship-screen"]';
  const CARD = `${OFFSEASON} [data-testid="venue-card"]`;
  const open = () =>
    evaluate<boolean>(`document.querySelector('${OFFSEASON}').dataset.open === 'true'`);
  const buildable = () =>
    evaluate<boolean>(
      `(() => { const b = document.querySelector('${CARD} [data-testid="venue-build"]'); return !!b && !b.disabled; })()`,
    );

  let turnsPlayed = 0;
  const endTurn = async () => {
    const next =
      Number(
        await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`),
      ) + 1;
    await win.webContents.executeJavaScript(COLLECT_NEWS, true);
    await click('[data-testid="end-turn"]');
    await wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${next}; })()`,
    );
    turnsPlayed += 1;
  };

  // Up to two years, until an offseason where the next level can be built.
  while (!((await open()) && (await buildable())) && turnsPlayed < 8) await endTurn();
  if (!(await buildable())) throw new Error("No offseason where a venue level could be built.");
  await click(".game-nav [data-view=offseason]");
  await wait(`!document.querySelector('${OFFSEASON}').hidden`);
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  const levelBefore = Number(
    await evaluate<string>(`document.querySelector('${CARD}').dataset.level`),
  );
  await screenshot("51-venue.png");

  await click(`${CARD} [data-testid="venue-build"]`);
  await wait(`!!document.querySelector('${CARD} [data-testid="venue-confirm"]')`);
  const review = await evaluate<string>(
    `document.querySelector('${CARD} [data-testid="venue-review"]').textContent`,
  );
  if (!/pays .* cash now/.test(review) || !/opens before/.test(review))
    throw new Error(`The venue review must state the price and when it opens: ${review}`);
  await screenshot("52-venue-review.png");
  await click(`${CARD} [data-testid="venue-confirm"]`);
  await wait(`!!document.querySelector('${CARD} [data-testid="venue-building"]')`);
  const cardText = await evaluate<string>(`document.querySelector('${CARD}').textContent`);
  if (cardText.includes("{{")) throw new Error(`Unfilled words in the venue card: ${cardText}`);
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  await screenshot("53-venue-building.png");

  win.setContentSize(390, 844);
  await delay();
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("54-venue-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The venue card overflows on a narrow viewport.");

  // The Flagship tab shows the venue read-only.
  await click(".game-nav [data-view=flagship]");
  await wait(`!document.querySelector('${FLAGSHIP}').hidden`);
  const flagshipView = await evaluate<{
    card: number;
    buttons: number;
    building: number;
  }>(`(() => ({
    card: document.querySelectorAll('${FLAGSHIP} [data-testid="venue-card"]').length,
    buttons: document.querySelectorAll('${FLAGSHIP} [data-testid="venue-build"]').length,
    building: document.querySelectorAll('${FLAGSHIP} [data-testid="venue-building"]').length,
  }))()`);
  if (flagshipView.card !== 1 || flagshipView.buttons > 0 || flagshipView.building !== 1)
    throw new Error(
      `The Flagship tab's venue card must be read-only: ${JSON.stringify(flagshipView)}`,
    );
  await click(".game-nav [data-view=world]");
  return { levelBefore, review, narrowOverflow, turnsPlayed };
}
