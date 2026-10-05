import type { BrowserWindow } from "electron";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * Event windows and the offseason screen (GDD v1.24, v1.25; tech plan 2.13 step 6). Plays on the
 * world map to a pending decision: its window names the card's country, the map outlines that
 * country without moving the player's selection, a choice's full effects show on hover, a paid
 * choice asks to confirm, a free one answers at once, and Decide later sets the next card aside.
 * A moment toast collects with a click. Then plays to the next offseason from the world map and
 * checks its screen opens on the season in review. Screenshots in both layouts.
 */
export async function verifyPopups(
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
    throw new Error(`Pop-up smoke timed out: ${condition}`);
  };
  const decisions = () =>
    evaluate<number>(
      `Number(document.querySelector('[data-testid="events-open"]').dataset.decisions)`,
    );
  const moments = () =>
    evaluate<number>(
      `Number(document.querySelector('[data-testid="events-open"]').dataset.pending) - Number(document.querySelector('[data-testid="events-open"]').dataset.decisions)`,
    );
  const ready = () =>
    evaluate<boolean>(`document.querySelector('[data-testid="game"]').dataset.status === 'ready'`);
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
  const toWorld = async () => {
    await evaluate(`document.querySelector(".overview-dialog > header .icon-button")?.click()`);
    await click(".game-nav [data-view=world]");
    await delay();
  };

  // Big news comes before decisions (GDD v1.26): collect it, then look for a decision.
  const collectNews = () => win.webContents.executeJavaScript(COLLECT_NEWS, true);
  await toWorld();

  // A headline (the first star is always one) is a front page; Next Turn waits for it.
  const windowWeight = () =>
    evaluate<string | null>(
      `document.querySelector('[data-testid="moment-window"]')?.dataset.weight ?? null`,
    );
  let headline = false;
  let bigSeen = false;
  for (let more = 0; !headline && more < 30; more += 1) {
    for (let k = 0; k < 10; k += 1) {
      const weight = await windowWeight();
      if (!weight) break;
      bigSeen = true;
      if (weight === "headline") {
        headline = true;
        if (
          !(await evaluate<boolean>(`document.querySelector('[data-testid="end-turn"]').disabled`))
        )
          throw new Error("Next Turn must wait while a headline is uncollected.");
        await delay(400);
        await screenshot("27f-headline.png");
        win.setContentSize(390, 844);
        await delay(300);
        const overflow = await evaluate<boolean>(
          "document.documentElement.scrollWidth > innerWidth",
        );
        await screenshot("27g-headline-narrow.png");
        win.setContentSize(1280, 800);
        await delay(300);
        if (overflow) throw new Error("The headline overflows on a narrow viewport.");
      }
      const country = await evaluate<string>(
        `document.querySelector('[data-testid="moment-window"]').dataset.country`,
      );
      if (
        (await evaluate<string>(
          `document.querySelector('[data-testid="world-map"]').dataset.highlighted`,
        )) !== country
      )
        throw new Error("A big moment must outline its country on the map.");
      await click('[data-testid="moment-window-collect"]');
      await wait(`document.querySelector('[data-testid="game"]').dataset.status === 'ready'`);
      await delay();
    }
    if (headline) break;
    while (await exists('[data-testid="event-popup-later"]'))
      await click('[data-testid="event-popup-later"]');
    await endTurn();
  }
  if (!headline) throw new Error("No headline moment came up in 30 turns.");

  for (;;) {
    await collectNews();
    if ((await exists('[data-testid="event-popup"]')) || turnsPlayed >= 30) break;
    await endTurn();
  }
  if (!(await exists('[data-testid="event-popup"]')))
    throw new Error("No decision popped up over the map in 30 turns.");
  const map = '[data-testid="world-map"]';
  const card = await evaluate<{ country: string; template: string; text: string }>(`(() => {
    const p = document.querySelector('[data-testid="event-popup"]');
    return { country: p.dataset.country, template: p.dataset.eventTemplate, text: p.textContent };
  })()`);
  if (card.text.includes("{{")) throw new Error(`The pop-up shows a raw template: ${card.text}`);
  await wait(`document.querySelector('${map}').dataset.highlighted === '${card.country}'`);
  const selected = await evaluate<string>(`document.querySelector('${map}').dataset.selected`);

  // The full effects on hover.
  const choice = await evaluate<{ x: number; y: number }>(`(() => {
    const r = document.querySelector('[data-testid="event-popup-choice"]').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  win.webContents.sendInputEvent({ type: "mouseMove", x: choice.x, y: choice.y });
  await wait(
    `getComputedStyle(document.querySelector('.event-popup-choice .event-popup-detail')).display === 'block'`,
  );
  await screenshot("27b-popup.png");
  win.webContents.sendInputEvent({ type: "mouseMove", x: 5, y: 5 });

  // A paid choice asks first; cancelling changes nothing.
  const before = await decisions();
  const paid = '[data-testid="event-popup-choice"]:not([data-cost="0"]):not(:disabled)';
  let confirmChecked = false;
  if (await exists(paid)) {
    await click(paid);
    await wait(`!!document.querySelector('[data-testid="event-popup-confirm"]')`);
    await evaluate(
      `document.querySelector('[data-testid="event-popup-confirm"] button:not([data-testid])').click()`,
    );
    await wait(`!document.querySelector('[data-testid="event-popup-confirm"]')`);
    if ((await decisions()) !== before) throw new Error("Cancelling a paid choice spent it.");
    confirmChecked = true;
  }

  // Narrow layout: the window becomes a sheet at the bottom, with no sideways overflow.
  win.setContentSize(390, 844);
  await delay(300);
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("27c-popup-narrow.png");
  win.setContentSize(1280, 800);
  await delay(300);
  if (narrowOverflow) throw new Error("The pop-up overflows on a narrow viewport.");

  // A free choice answers at once.
  const free = '[data-testid="event-popup-choice"][data-cost="0"]:not(:disabled)';
  if (!(await exists(free))) throw new Error("The pop-up has no free choice to answer.");
  await click(free);
  await wait(
    `document.querySelector('[data-testid="game"]').dataset.status === 'ready' && Number(document.querySelector('[data-testid="events-open"]').dataset.decisions) === ${before - 1}`,
  );
  if ((await evaluate<string>(`document.querySelector('${map}').dataset.selected`)) !== selected)
    throw new Error("A pop-up card must not change the player's selection.");

  // Decide later sets a card aside for the turn; it stays on the board. Play on until one comes up.
  let setAside = 0;
  for (let more = 0; setAside === 0 && more < 10; more += 1) {
    await collectNews();
    while (await exists('[data-testid="event-popup-later"]')) {
      const waiting = await decisions();
      await click('[data-testid="event-popup-later"]');
      await delay();
      if ((await decisions()) !== waiting) throw new Error("Decide later must not answer a card.");
      setAside += 1;
    }
    if (setAside === 0) await endTurn();
  }
  if (setAside === 0) throw new Error("No second card came up to set aside in 10 turns.");
  if ((await evaluate<string>(`document.querySelector('${map}').dataset.highlighted`)) !== "")
    throw new Error("The map must drop its outline once no card is up.");

  // A moment toast collects with a click (toasts wait until no decision is up).
  let collected = false;
  for (let more = 0; !collected && more < 10; more += 1) {
    await collectNews();
    while (await exists('[data-testid="event-popup-later"]'))
      await click('[data-testid="event-popup-later"]');
    if (await exists(".moment-toast")) {
      const pending = await moments();
      await click(".moment-toast");
      await wait(
        `document.querySelector('[data-testid="game"]').dataset.status === 'ready' && Number(document.querySelector('[data-testid="events-open"]').dataset.pending) - Number(document.querySelector('[data-testid="events-open"]').dataset.decisions) === ${pending - 1}`,
      );
      collected = true;
    } else await endTurn();
  }
  if (!collected) throw new Error("No moment toast came up to collect in 10 turns.");

  // The next offseason opens its own screen from the world map, on the season in review.
  const offseason = '[data-testid="offseason-screen"]';
  let guard = 0;
  while (guard++ < 12) {
    if (!(await ready())) await delay();
    // The offseason screen opens once the season's big news is collected.
    await toWorld();
    await collectNews();
    await delay(300);
    if (await evaluate<boolean>(`!document.querySelector('${offseason}').hidden`)) break;
    await toWorld();
    while (await exists('[data-testid="event-popup-later"]'))
      await click('[data-testid="event-popup-later"]');
    await endTurn();
  }
  if (!(await evaluate<boolean>(`!document.querySelector('${offseason}').hidden`)))
    throw new Error("The offseason screen did not open from the world map.");
  const review = await evaluate<string>(
    `document.querySelector('${offseason} [data-testid="offseason-champion"]')?.textContent ?? ""`,
  );
  if (!review) throw new Error("The offseason screen must open on the season's champion.");
  await screenshot("27d-offseason.png");
  win.setContentSize(390, 844);
  await delay(300);
  const offseasonOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("27e-offseason-narrow.png");
  win.setContentSize(1280, 800);
  await delay(300);
  if (offseasonOverflow) throw new Error("The offseason screen overflows on a narrow viewport.");
  await toWorld();

  return {
    headline,
    bigSeen,
    template: card.template,
    country: card.country,
    confirmChecked,
    setAside,
    collected,
    review,
    turnsPlayed,
  };
}
