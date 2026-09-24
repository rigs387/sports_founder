import type { BrowserWindow } from "electron";

/** Real controls -> Comlink worker -> authoritative snapshot, without injecting simulation state. */
export async function verifyActions(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const delay = () => new Promise((resolve) => setTimeout(resolve, 60));
  const state = () =>
    evaluate<{ status: string; turn: number; pp: number; history: number }>(`(() => {
    const game = document.querySelector('[data-testid="game"]');
    const card = document.querySelector('[data-testid="country-card"]');
    return {status:game.dataset.status,turn:Number(game.dataset.turn),pp:Number(game.dataset.pp),history:Number(card?.dataset.historyPoints)};
  })()`);
  const waitReady = async (turn?: number) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const current = await state();
      if (current.status === "ready" && (turn === undefined || current.turn === turn))
        return current;
      await delay();
    }
    throw new Error(`Action did not complete: ${JSON.stringify(await state())}`);
  };
  const advance = async () => {
    const before = await state();
    const enabled = await evaluate<boolean>(
      `!document.querySelector('[data-testid="end-turn"]').disabled`,
    );
    if (!enabled) throw new Error("Campaign ended before action smoke could earn Prestige.");
    await evaluate(`document.querySelector('[data-testid="end-turn"]').click()`);
    return waitReady(before.turn + 1);
  };
  const openGrowth = () => evaluate(`document.querySelectorAll('.game-nav button')[3].click()`);
  const close = () => evaluate(`document.querySelector('dialog .icon-button').click()`);
  const purchase = () =>
    evaluate<{ cost: number; disabled: boolean; owned: boolean }>(`(() => {
    const row = document.querySelector('[data-node="backyard-clinics"]');
    return {cost:Number(row.dataset.cost),disabled:row.querySelector('button').disabled,owned:row.dataset.status==='owned'};
  })()`);

  await openGrowth();
  await delay();
  const locked = await evaluate<boolean>(
    `document.querySelector('[data-node="word-of-mouth"] button').disabled && document.querySelector('[data-node="word-of-mouth"]').textContent.includes('Requires Backyard Clinics')`,
  );
  if (!locked) throw new Error("Growth prerequisites are not explained and disabled.");
  let earnedTurns = 0;
  while ((await purchase()).disabled && earnedTurns++ < 80) {
    await close();
    await advance();
    await openGrowth();
    await delay();
  }
  const price = await purchase();
  if (price.disabled) throw new Error("Could not earn enough Prestige for the first purchase.");
  const beforeBuy = await state();
  await evaluate(
    `(() => { const button=document.querySelector('[data-node="backyard-clinics"] button');button.click();button.click(); })()`,
  );
  const afterBuy = await waitReady();
  if (
    !(await purchase()).owned ||
    Math.abs(afterBuy.pp - (beforeBuy.pp - price.cost)) > 0.000001 ||
    afterBuy.turn !== beforeBuy.turn ||
    afterBuy.history !== beforeBuy.history
  )
    throw new Error(
      `Purchase did not spend once without advancing time: ${JSON.stringify({ beforeBuy, afterBuy, price })}`,
    );
  await screenshot("08-growth-purchase.png");
  await close();
  await evaluate(
    `(() => {const picker=document.querySelector('[data-testid="market-picker"]');picker.value='tuvalu';picker.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await delay();
  const focus = () =>
    evaluate<{ cost: number; disabled: boolean }>(
      `(() => {const button=document.querySelector('[data-testid="assign-focus"]');return {cost:Number(button.dataset.cost),disabled:button.disabled};})()`,
    );
  earnedTurns = 0;
  while ((await focus()).disabled && earnedTurns++ < 80) await advance();
  const focusPrice = await focus();
  if (focusPrice.disabled) throw new Error("Could not earn enough Prestige to assign focus.");
  const beforeFocus = await state();
  await screenshot("09-focus-assignment.png");
  await evaluate(`document.querySelector('[data-testid="assign-focus"]').click()`);
  const afterFocus = await waitReady();
  const focused = await evaluate<boolean>(
    `!!document.querySelector('[data-testid="focused-market"]')`,
  );
  if (
    !focused ||
    Math.abs(afterFocus.pp - (beforeFocus.pp - focusPrice.cost)) > 0.000001 ||
    afterFocus.turn !== beforeFocus.turn ||
    afterFocus.history !== beforeFocus.history
  )
    throw new Error("Focus assignment did not spend the displayed cost or changed turn history.");
  await screenshot("10-focused-tuvalu.png");
  await evaluate(`document.querySelectorAll('.game-nav button')[1].click()`);
  await delay();
  const slots = await evaluate<string>(`document.querySelector('.focus-list').textContent`);
  if (!slots.includes("Tuvalu") || slots.includes("Albania"))
    throw new Error("Focus assignment did not replace the old slot.");
  await close();
  await advance();
  if (!(await evaluate<boolean>(`!!document.querySelector('[data-testid="focused-market"]')`)))
    throw new Error("Focus did not survive the next turn.");
  const validationMs = await evaluate<number | null>(
    `performance.getEntriesByName('map.geometry.validate')[0]?.duration ?? null`,
  );
  return {
    purchaseCost: price.cost,
    focusCost: focusPrice.cost,
    doubleClickSpentOnce: true,
    actionsDidNotAdvanceTime: true,
    focusPersisted: true,
    geometryValidationMs: validationMs,
  };
}
