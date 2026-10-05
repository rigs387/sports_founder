import type { BrowserWindow } from "electron";

/**
 * The Stars panel (GDD v1.16, tech plan 2.6 step 8). Runs after the star cards, so the league has
 * a star. Screenshots the flagship's read-only panel in both layouts, then plays on to an offseason
 * with a star that can be backed, backs them on the offseason screen (GDD v1.24) through the review
 * step, and checks the influence bar and the backed star's name in the flagship country's map
 * tooltip.
 */
export async function verifyStarsPanel(
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
    throw new Error(`Stars panel smoke timed out: ${condition}`);
  };
  const FLAGSHIP = '[data-testid="flagship-screen"]';
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const panel = (root = FLAGSHIP) =>
    evaluate<{
      stars: number;
      slots: number;
      used: number;
      backable: number;
      reasons: string[];
      leaders: number;
      rows: number;
      text: string;
    }>(`(() => {
      const panel = document.querySelector('${root} [data-testid="flagship-stars"]');
      if (!panel) return { stars: 0, slots: 0, used: 0, backable: 0, reasons: [], leaders: 0, rows: 0, text: "" };
      return {
        stars: panel.querySelectorAll('[data-testid="flagship-star"]').length,
        slots: Number(panel.dataset.slots),
        used: Number(panel.dataset.used),
        backable: panel.querySelectorAll('[data-testid="flagship-star-back"]:not(:disabled)').length,
        reasons: [...panel.querySelectorAll('[data-testid="flagship-star-reason"]')].map((r) => r.textContent),
        leaders: document.querySelectorAll('[data-testid="flagship-leader"]').length,
        rows: document.querySelectorAll('[data-testid="flagship-table"] tbody tr').length,
        text: panel.textContent,
      };
    })()`);
  const showPanel = (root = FLAGSHIP) =>
    evaluate(`document.querySelector('${root} [data-testid="flagship-stars"]').scrollIntoView()`);

  let turnsPlayed = 0;
  const endTurn = async () => {
    const next =
      Number(
        await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`),
      ) + 1;
    await click('[data-testid="end-turn"]');
    await wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${next}; })()`,
    );
    turnsPlayed += 1;
    return panel();
  };
  const readOnlyButtons = () =>
    evaluate<number>(
      `document.querySelectorAll('${FLAGSHIP} [data-testid="flagship-star-back"], ${FLAGSHIP} [data-testid="flagship-star-drop"]').length`,
    );

  await click(".game-nav [data-view=flagship]");
  await wait(`!!document.querySelector('[data-testid="flagship-stars"]')`);
  // The star the cards announced may have retired since: play on until the league has one.
  let first = await panel();
  while (first.stars === 0 && turnsPlayed < 40) first = await endTurn();
  await showPanel();
  if (first.stars < 1 || first.slots < 1)
    throw new Error(`The Stars panel is missing its star: ${JSON.stringify(first)}`);
  if (first.leaders !== first.rows)
    throw new Error(`Every table row needs its leading player: ${JSON.stringify(first)}`);
  // Skill and strength never appear, as a number or a word.
  if (/skill|strength|rating/i.test(first.text) || first.text.includes("{{"))
    throw new Error(`The Stars panel shows something it must not: ${first.text}`);
  // The flagship's panel is read-only (GDD v1.24): backing happens on the offseason screen.
  if ((await readOnlyButtons()) > 0)
    throw new Error("The flagship's Stars panel must not back or drop stars.");
  await screenshot("36-stars.png");
  win.setContentSize(390, 844);
  await delay();
  await showPanel();
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("37-stars-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The Stars panel overflows on a narrow viewport.");

  // Play on (up to two years) until a star can be backed on the offseason screen: the offseason
  // open, a free slot, the PP.
  let current = await panel(OFFSEASON);
  for (let more = 0; current.backable === 0 && more < 8; more += 1) {
    await endTurn();
    current = await panel(OFFSEASON);
  }
  if (current.backable === 0) {
    // Nothing to back in this campaign (slots full or no PP): the reasons must say why.
    if (current.reasons.length === 0)
      throw new Error(`Disabled star buttons must say why: ${JSON.stringify(current)}`);
    await click(".game-nav [data-view=world]");
    return { ...first, narrowOverflow, backed: false, turnsPlayed, reasons: current.reasons };
  }

  await click(".game-nav [data-view=offseason]");
  await wait(`!document.querySelector('${OFFSEASON}').hidden`);
  const backButton = `${OFFSEASON} [data-testid="flagship-star-back"]:not(:disabled)`;
  const playerId = await evaluate<string>(
    `document.querySelector(${JSON.stringify(backButton)}).closest('[data-testid="flagship-star"]').dataset.player`,
  );
  const card = `${OFFSEASON} [data-testid="flagship-star"][data-player="${playerId}"]`;
  await click(backButton);
  await wait(`!!document.querySelector('${card} [data-testid="flagship-star-review"]')`);
  const review = await evaluate<string>(
    `document.querySelector('${card} [data-testid="flagship-star-review"]').textContent`,
  );
  if (!/PP/.test(review)) throw new Error(`The backing review must show the PP price: ${review}`);
  await evaluate(`document.querySelector('${card}').scrollIntoView()`);
  await screenshot("38-stars-review.png");
  await click(`${card} [data-testid="flagship-star-confirm"]`);
  await wait(`document.querySelector('${card}')?.dataset.backed === 'true'`);
  await wait(`!!document.querySelector('${card} [data-testid="flagship-star-influence"]')`);
  await showPanel(OFFSEASON);
  const backed = await panel(OFFSEASON);
  await screenshot("39-stars-backed.png");

  // The backed star's name in the flagship country's map tooltip.
  const name = await evaluate<string>(
    `document.querySelector('${card} .star-title strong').textContent`,
  );
  const seat = await evaluate<string>(
    `document.querySelector('[data-testid="flagship-screen"]').dataset.seat`,
  );
  await click(".game-nav [data-view=world]");
  await delay();
  await evaluate(
    `(() => {const picker=document.querySelector('[data-testid="market-picker"]');picker.value=${JSON.stringify(seat)};picker.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await delay();
  const target = await evaluate<{ x: number; y: number }>(
    `(() => {const map=document.querySelector('[data-testid="world-map"]');const box=map.getBoundingClientRect();return {x:Math.round(box.x+Number(map.dataset.selectedX)),y:Math.round(box.y+Number(map.dataset.selectedY))};})()`,
  );
  await click(".card-close");
  await delay();
  win.webContents.sendInputEvent({ type: "mouseMove", x: target.x, y: target.y });
  await wait(`!!document.querySelector('[data-testid="map-tooltip-stars"]')`);
  const tooltip = await evaluate<string>(
    `document.querySelector('[data-testid="map-tooltip-stars"]').textContent`,
  );
  if (!tooltip.includes(name))
    throw new Error(`The map tooltip must name the backed star ${name}: ${tooltip}`);
  await screenshot("40-stars-tooltip.png");
  win.webContents.sendInputEvent({ type: "mouseMove", x: 5, y: 5 });
  return {
    ...first,
    narrowOverflow,
    backed: true,
    turnsPlayed,
    player: name,
    usedAfter: backed.used,
    tooltip,
  };
}
