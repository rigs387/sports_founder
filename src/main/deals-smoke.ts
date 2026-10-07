import type { BrowserWindow } from "electron";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * Flagship deals (GDD v1.28, tech plan 2.15 step 7). Plays on to an offseason with offers, signs
 * one on the offseason screen (through the review step when it carries a demand, which must state
 * what a breach costs), checks the signed deal in its slot, both layouts, no unfilled words, and
 * that the Flagship tab's Deals card is read-only.
 */
export async function verifyDeals(win: BrowserWindow, screenshot: (name: string) => Promise<void>) {
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
    throw new Error(`Deals smoke timed out: ${condition}`);
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const FLAGSHIP = '[data-testid="flagship-screen"]';
  const offers = () =>
    evaluate<number>(`document.querySelectorAll('${OFFSEASON} [data-testid="deal-offer"]').length`);

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

  // Up to two years, until an offseason has offers on the table.
  while ((await offers()) === 0 && turnsPlayed < 8) await endTurn();
  if ((await offers()) === 0) throw new Error("No offseason with deal offers came.");
  await click(".game-nav [data-view=offseason]");
  await wait(`!document.querySelector('${OFFSEASON}').hidden`);
  const PANEL = `${OFFSEASON} [data-testid="deals-panel"]`;
  await evaluate(`document.querySelector('${PANEL}').scrollIntoView()`);
  await screenshot("41-deals.png");

  // Prefer an offer whose demand can break, to see the breach in the review; then exclusivity
  // (reviewed, nothing to break); else any offer.
  const pick = await evaluate<{ offer: string; demand: string; slot: string }>(`(() => {
    const all = [...document.querySelectorAll('${OFFSEASON} [data-testid="deal-offer"]')];
    const chosen =
      all.find((o) => !['none', 'exclusivity'].includes(o.dataset.demand)) ??
      all.find((o) => o.dataset.demand === 'exclusivity') ??
      all[0];
    return {
      offer: chosen.dataset.offer,
      demand: chosen.dataset.demand,
      slot: chosen.closest('.deal-slot').dataset.slot,
    };
  })()`);
  const OFFER = `${OFFSEASON} [data-testid="deal-offer"][data-offer="${pick.offer}"]`;
  const signedBefore = await evaluate<number>(
    `document.querySelectorAll('${PANEL} [data-testid="deal-signed"]').length`,
  );
  await click(`${OFFER} [data-testid="deal-sign"]`);
  let review = "";
  if (pick.demand !== "none") {
    await wait(`!!document.querySelector('${OFFER} [data-testid="deal-sign-confirm"]')`);
    review = await evaluate<string>(`document.querySelector('${OFFER} .deal-review').textContent`);
    const breakable = pick.demand !== "exclusivity";
    if (/deal ends/.test(review) !== breakable)
      throw new Error(`Only a demand that can break states a breach's cost: ${review}`);
    await evaluate(`document.querySelector('${OFFER}').scrollIntoView()`);
    await screenshot("42-deals-review.png");
    await click(`${OFFER} [data-testid="deal-sign-confirm"]`);
  }
  await wait(
    `document.querySelectorAll('${PANEL} [data-testid="deal-signed"]').length === ${signedBefore + 1}`,
  );
  const panelText = await evaluate<string>(`document.querySelector('${PANEL}').textContent`);
  if (panelText.includes("{{")) throw new Error(`Unfilled words in the Deals panel: ${panelText}`);
  await evaluate(`document.querySelector('${PANEL}').scrollIntoView()`);
  await screenshot("43-deals-signed.png");
  win.setContentSize(390, 844);
  await delay();
  await evaluate(`document.querySelector('${PANEL}').scrollIntoView()`);
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("44-deals-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The Deals panel overflows on a narrow viewport.");

  // The Flagship tab shows the deals read-only.
  await click(".game-nav [data-view=flagship]");
  await wait(`!document.querySelector('${FLAGSHIP}').hidden`);
  const flagshipView = await evaluate<{ signed: number; buttons: number }>(`(() => ({
    signed: document.querySelectorAll('${FLAGSHIP} [data-testid="deal-signed"]').length,
    buttons: document.querySelectorAll('${FLAGSHIP} [data-testid="deal-sign"]').length,
  }))()`);
  if (flagshipView.signed < 1 || flagshipView.buttons > 0)
    throw new Error(
      `The Flagship tab's Deals card must be read-only: ${JSON.stringify(flagshipView)}`,
    );
  await click(".game-nav [data-view=world]");
  return { ...pick, review, narrowOverflow, turnsPlayed, flagshipSigned: flagshipView.signed };
}
