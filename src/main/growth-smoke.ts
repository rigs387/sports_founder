import type { BrowserWindow } from "electron";

/** Exercise the full Growth screen against the real worker; never inject campaign state. */
export async function verifyGrowth(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const delay = () => new Promise((resolve) => setTimeout(resolve, 80));
  const state = () =>
    evaluate<{ pp: number; turn: number; status: string }>(`(() => {
    const game = document.querySelector('[data-testid="game"]');
    return {pp:Number(game.dataset.pp),turn:Number(game.dataset.turn),status:game.dataset.status};
  })()`);
  const wait = async (turn?: number) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const current = await state();
      if (current.status === "ready" && (turn === undefined || current.turn === turn))
        return current;
      await delay();
    }
    throw new Error("Growth worker action did not finish.");
  };
  const assert = async (condition: string, message: string) => {
    if (!(await evaluate<boolean>(condition))) throw new Error(message);
  };
  await click(".game-nav button:last-child");
  await delay();
  await assert(
    'document.querySelectorAll("[data-testid=growth-picker] option").length === 20',
    "Every growth node must be keyboard selectable.",
  );
  await click('[data-category="media"]');
  await assert(
    'document.querySelector("[data-testid=growth-reason]").textContent.includes("tier") && document.querySelector("[data-testid=buy-node]").disabled',
    "Media tier lock must be explained.",
  );
  await screenshot("11-growth-media-locked.png");
  await click('[data-category="grassroots"]');
  await click('[data-node="street-courts"]');
  let turns = 0;
  while (
    (await evaluate<boolean>('document.querySelector("[data-testid=buy-node]").disabled')) &&
    turns++ < 80
  ) {
    const before = await state();
    await assert(
      '!document.querySelector("[data-testid=end-turn]").disabled',
      "Campaign ended before fork test.",
    );
    await click('[data-testid="end-turn"]');
    await wait(before.turn + 1);
  }
  await assert(
    '!document.querySelector("[data-testid=buy-node]").disabled',
    "Could not afford Street Courts.",
  );
  await assert(
    'document.querySelector("[data-testid=buy-node]").getBoundingClientRect().bottom < document.querySelector(".game-bottom").getBoundingClientRect().top',
    "Growth purchase must fit at 1280x800.",
  );
  await screenshot("12-growth-clubhouse.png");
  const before = await state();
  const price = await evaluate<number>(
    'Number(document.querySelector("[data-testid=buy-node]").dataset.cost)',
  );
  await click('[data-testid="buy-node"]');
  await assert(
    'document.querySelector(".growth-dialog").open && document.querySelector(".growth-comparison").textContent.includes("Club Grounds")',
    "Fork must compare both real alternatives.",
  );
  await screenshot("13-growth-choice.png");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await delay();
  await assert('!document.querySelector("dialog[open]")', "Escape must cancel the fork.");
  if ((await state()).pp !== before.pp) throw new Error("Cancelling a fork spent Prestige.");
  await click('[data-testid="buy-node"]');
  await evaluate(
    '(() => { const button = document.querySelector("[data-testid=confirm-growth]"); button.click(); button.click(); })()',
  );
  const after = await wait();
  if (Math.abs(before.pp - price - after.pp) > 0.000001 || before.turn !== after.turn)
    throw new Error("Fork must spend exactly once without advancing time.");
  await click('[data-node="club-grounds"]');
  await assert(
    'document.querySelector("[data-testid=buy-node]").disabled && document.querySelector("[data-testid=growth-reason]").textContent.includes("Street Courts")',
    "Sibling must remain inspectable and permanently locked.",
  );
  await screenshot("14-growth-chosen.png");
  await click('[data-node="street-courts"]');
  win.setContentSize(390, 844);
  await delay();
  await assert(
    "document.documentElement.scrollWidth <= innerWidth",
    "Growth must not overflow the narrow window.",
  );
  await screenshot("15-growth-narrow.png");
  await evaluate(
    'document.querySelector("[data-testid=growth-inspector]").scrollIntoView({block:"start"})',
  );
  await screenshot("16-growth-narrow-detail.png");
  win.setContentSize(1280, 800);
  await delay();
  await click(".game-nav button:first-child");
  await delay();
  return {
    nodes: 20,
    permanentForkVerified: true,
    cancelledWithoutSpend: true,
    doubleClickSpentOnce: true,
    nextTurnOnGrowth: true,
    narrowOverflow: false,
    price,
  };
}
