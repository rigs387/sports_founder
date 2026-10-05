import type { BrowserWindow } from "electron";

/**
 * Traditions on screen (GDD v1.22, tech plan 2.11 step 8). Runs late, after many seasons, so the
 * flagship has at least its trophy. Checks and screenshots, in both layouts: the Rulebook's
 * Traditions section, the flagship's trophy card and tradition tags, and the seat country's card
 * on the map with its traditions and the map's pennants.
 */
export async function verifyTraditions(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
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
    throw new Error(`Traditions smoke timed out: ${condition}`);
  };
  const text = (selector: string) =>
    evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`);
  const show = (selector: string) =>
    evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "start" })`,
    );
  const overflows = () => evaluate<boolean>("document.documentElement.scrollWidth > innerWidth");
  const checkText = (where: string, value: string) => {
    if (value.includes("{{") || /culture\.|events\.cards/.test(value))
      throw new Error(`${where} shows a missing string: ${value.slice(0, 300)}`);
  };
  /** Shoots `selector` wide, then narrow (no horizontal overflow), then restores the window. */
  const bothLayouts = async (selector: string, wide: string, narrow: string) => {
    await show(selector);
    await screenshot(wide);
    win.setContentSize(390, 844);
    await delay();
    await show(selector);
    const overflow = await overflows();
    await screenshot(narrow);
    win.setContentSize(1280, 800);
    await delay();
    if (overflow) throw new Error(`${selector} overflows on a narrow viewport.`);
  };

  // The Rulebook's Traditions section.
  await click(".game-nav [data-view=sport]");
  await wait(`!!document.querySelector('[data-testid="rulebook-traditions"]')`);
  const traditions = await evaluate<number>(
    `document.querySelectorAll('[data-testid="rulebook-traditions"] [data-testid="tradition"]').length`,
  );
  if (traditions < 1) throw new Error("The Rulebook lists no tradition after many seasons.");
  const rulebook = await text('[data-testid="rulebook-traditions"]');
  checkText("The Rulebook's traditions", rulebook);
  // Strength is a bar described in words, never a number.
  if (/\d+\s*%/.test(rulebook))
    throw new Error(`Tradition strength shown as a number: ${rulebook}`);
  await bothLayouts(
    '[data-testid="rulebook-traditions"]',
    "43-traditions.png",
    "44-traditions-narrow.png",
  );
  await click(".overview-dialog > header .icon-button");

  // The flagship: the trophy card and tradition tags on club rows.
  await click(".game-nav [data-view=flagship]");
  await wait(`!!document.querySelector('[data-testid="flagship-trophy"]')`);
  const trophy = await text('[data-testid="flagship-trophy-name"]');
  checkText("The trophy card", trophy);
  const tags = await evaluate<number>(
    `document.querySelectorAll('[data-testid="flagship-tradition-tag"]').length`,
  );
  await bothLayouts('[data-testid="flagship-trophy"]', "45-trophy.png", "46-trophy-narrow.png");

  // The map: pennants, and the seat country's card listing its traditions.
  const seat = await evaluate<string>(
    `document.querySelector('[data-testid="flagship-screen"]').dataset.seat`,
  );
  await click(".game-nav [data-view=world]");
  await delay();
  await wait(
    `Number(document.querySelector('[data-testid="world-map"]').dataset.traditionMarkers) > 0`,
  );
  const markers = Number(
    await evaluate<string>(
      `document.querySelector('[data-testid="world-map"]').dataset.traditionMarkers`,
    ),
  );
  await evaluate(
    `(() => {const picker=document.querySelector('[data-testid="market-picker"]');picker.value=${JSON.stringify(seat)};picker.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await wait(`!!document.querySelector('[data-testid="country-traditions"]')`);
  const card = await text('[data-testid="country-traditions"]');
  checkText("The country card's traditions", card);
  await bothLayouts(
    '[data-testid="country-traditions"]',
    "47-map-traditions.png",
    "48-map-traditions-narrow.png",
  );
  await click(".card-close");
  return { traditions, trophy, tags, markers, card: card.slice(0, 200) };
}
