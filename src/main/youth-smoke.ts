import type { BrowserWindow } from "electron";

/**
 * Youth programs (GDD v1.40, v1.42; tech plan 2.28 step 1). Runs right after the directors step,
 * on the late-game campaign with its offseason still open: the seat and the bot's focus leagues
 * are rows. Reads the card, reviews and funds the first level that can be bought (the review
 * states the price, when it opens and that only later players benefit), checks no unfilled
 * words and the narrow layout, and that the Flagship tab's card is read-only.
 */
export async function verifyYouth(win: BrowserWindow, screenshot: (name: string) => Promise<void>) {
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
    throw new Error(`Youth smoke timed out: ${condition}`);
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const FLAGSHIP = '[data-testid="flagship-screen"]';
  const CARD = `${OFFSEASON} [data-testid="youth-card"]`;
  const text = (selector: string) =>
    evaluate<string>(`document.querySelector('${selector}')?.textContent ?? ""`);
  const checkText = (value: string) => {
    if (value.includes("{{") || /\byouth\.[a-z]/.test(value))
      throw new Error(`The youth card shows a missing string: ${value.slice(0, 300)}`);
  };

  await click(".game-nav [data-view=offseason]");
  await wait(`!document.querySelector('${OFFSEASON}').hidden`);
  await wait(`!!document.querySelector('${CARD}')`);
  const rows = await evaluate<{ country: string; level: number; buildable: boolean }[]>(
    `[...document.querySelectorAll('${CARD} [data-testid="youth-row"]')].map((row) => ({
      country: row.dataset.country,
      level: Number(/Level (\\d+)/.exec(row.textContent)?.[1] ?? 0),
      buildable: !!row.querySelector('[data-testid="youth-build"]:not([disabled])'),
    }))`,
  );
  if (rows.length === 0) throw new Error("The late-game youth card lists no league.");
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  checkText(await text(CARD));
  await screenshot("61d-youth.png");

  // Fund the first level that can be bought, if any (the builder bot may have filled them all).
  const target = rows.find((row) => row.buildable)?.country ?? "";
  let review = "";
  if (target) {
    const ROW = `${CARD} [data-testid="youth-row"][data-country="${target}"]`;
    await click(`${ROW} [data-testid="youth-build"]`);
    await wait(`!!document.querySelector('${ROW} [data-testid="youth-review"]')`);
    review = await text(`${ROW} [data-testid="youth-review"]`);
    checkText(review);
    if (
      !/pays \$[\d.,]+[KMB]? of its \$[\d.,]+[KMB]? now/.test(review) ||
      !/opens before/.test(review) ||
      !/only those who come through/.test(review)
    )
      throw new Error(`The youth review must state price, opening and who benefits: ${review}`);
    await evaluate(`document.querySelector('${ROW}').scrollIntoView()`);
    await screenshot("61e-youth-review.png");
    await click(`${ROW} [data-testid="youth-confirm"]`);
    await wait(`!!document.querySelector('${ROW} [data-testid="youth-building"]')`);
    checkText(await text(CARD));
  }

  win.setContentSize(390, 844);
  await delay();
  await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("61f-youth-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The youth card overflows on a narrow viewport.");

  // The Flagship tab shows the card read-only.
  await click(".game-nav [data-view=flagship]");
  await wait(`!document.querySelector('${FLAGSHIP}').hidden`);
  const flagshipView = await evaluate<{ card: number; buttons: number }>(`(() => ({
    card: document.querySelectorAll('${FLAGSHIP} [data-testid="youth-card"]').length,
    buttons: document.querySelectorAll('${FLAGSHIP} [data-testid="youth-build"]').length,
  }))()`);
  if (flagshipView.card !== 1 || flagshipView.buttons > 0)
    throw new Error(
      `The Flagship tab's youth card must be read-only: ${JSON.stringify(flagshipView)}`,
    );
  await click(".game-nav [data-view=world]");

  // The seat's country card has its youth line (the seat is the card's first row).
  const seat = rows[0]?.country ?? "";
  await evaluate(`(() => {
    const picker = document.querySelector('[data-testid="market-picker"]');
    picker.value = ${JSON.stringify(seat)};
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(
    `document.querySelector('[data-testid="country-card"]')?.dataset.country === ${JSON.stringify(seat)} && !!document.querySelector('[data-testid="country-youth"]')`,
  );
  const countryLine = await text('[data-testid="country-youth"]');
  checkText(countryLine);
  if (!/^Youth program: level \d/.test(countryLine))
    throw new Error(`The seat's country card must show its youth level: ${countryLine}`);
  await screenshot("61g-youth-country.png");

  // The anchor's country card shows its resentment and why (GDD v1.40, tech plan 2.32).
  const anchor = await evaluate<string>(
    `document.querySelector('[data-testid="game"]').dataset.anchor`,
  );
  await evaluate(`(() => {
    const picker = document.querySelector('[data-testid="market-picker"]');
    picker.value = ${JSON.stringify(anchor)};
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(
    `document.querySelector('[data-testid="country-card"]')?.dataset.country === ${JSON.stringify(anchor)} && !!document.querySelector('[data-testid="country-resentment"]')`,
  );
  const resentment = await text('[data-testid="country-resentment"]');
  checkText(resentment);
  if (!/Resentment at home|resentment at home/i.test(resentment))
    throw new Error(`The anchor's country card must show its resentment: ${resentment}`);
  await screenshot("61h-resentment-country.png");
  return { rows, target, review, narrowOverflow, countryLine, resentment };
}
