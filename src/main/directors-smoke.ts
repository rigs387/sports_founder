import type { BrowserWindow } from "electron";

/**
 * League directors (GDD v1.40, tech plan 2.26 step 1). Runs right after the agreement step, on
 * the late-game campaign with its offseason still open: the bot that played it held focus slots
 * abroad, so leagues there have directors. Finds the directors card on the offseason screen,
 * reviews a candidate (the review states the severance), appoints them, sees
 * the new director in place, and checks the narrow layout.
 */
export async function verifyDirectors(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Directors smoke timed out: ${condition}`);
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const CARD = `${OFFSEASON} [data-testid="directors-card"]`;
  const text = (selector: string) =>
    evaluate<string>(`document.querySelector('${selector}')?.textContent ?? ""`);
  const checkText = (value: string) => {
    if (value.includes("{{") || /\bdirectors\.[a-z]/.test(value))
      throw new Error(`The directors card shows a missing string: ${value.slice(0, 300)}`);
  };

  await click(".game-nav [data-view=offseason]");
  await wait(`!document.querySelector('${OFFSEASON}').hidden`);
  await wait(`!!document.querySelector('${CARD}')`);
  const serving = await evaluate<number>(
    `document.querySelectorAll('${CARD} [data-testid="director"]').length`,
  );
  if (serving === 0) throw new Error("The late-game campaign has no league directors.");
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  checkText(await text(CARD));
  await screenshot("61a-directors.png");

  // The first director whose league can pay the severance: review the first candidate.
  const countryId = await evaluate<string>(`(() => {
    const button = document.querySelector('${CARD} [data-testid="director-candidate"]:not([disabled])');
    return button ? button.closest('[data-testid="director"]').dataset.country : "";
  })()`);
  if (!countryId) throw new Error("No director can be replaced this offseason.");
  const ROW = `${CARD} [data-testid="director"][data-country="${countryId}"]`;
  const before = await text(`${ROW} strong`);
  await click(`${ROW} [data-testid="director-candidate"]`);
  await wait(`!!document.querySelector('${ROW} [data-testid="director-review"]')`);
  const review = await text(`${ROW} [data-testid="director-review"]`);
  checkText(review);
  await screenshot("61b-directors-review.png");
  await click(`${ROW} [data-testid="director-confirm"]`);
  await wait(
    `(document.querySelector('${ROW} strong')?.textContent ?? "") !== ${JSON.stringify(before)}`,
  );
  const after = await text(`${ROW} strong`);
  checkText(await text(CARD));

  win.setContentSize(390, 844);
  await delay();
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("61c-directors-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The directors card overflows on a narrow viewport.");
  await click(".game-nav [data-view=world]");
  return { serving, countryId, before, after, review, narrowOverflow };
}
