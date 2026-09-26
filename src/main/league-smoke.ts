import type { BrowserWindow } from "electron";
import type { LeagueActionKind } from "../sim";

/** Grow the existing focused Tuvalu market naturally, then exercise all three league actions. */
export async function verifyLeagues(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const delay = () => new Promise((resolve) => setTimeout(resolve, 60));
  const scope = ".overview-dialog .league-management";
  // Native dialog close-watchers distinguish separate user gestures. Without this flag,
  // Chromium groups scripted nested dialogs and one Escape cancels both.
  const click = (selector: string) =>
    win.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
      true,
    );
  const open = async () => {
    await click(".game-nav button:nth-child(3)");
    await delay();
  };
  const close = () => click(".overview-dialog > header .icon-button");
  const assert = async (condition: string, message: string) => {
    if (!(await evaluate<boolean>(condition))) throw new Error(message);
  };
  const state = () =>
    evaluate<{
      pp: number;
      turn: number;
      status: string;
      tier: string;
      cash: number;
      hardcore: number;
    }>(`(() => {
    const game=document.querySelector('[data-testid="game"]');const league=document.querySelector('${scope}');
    return {pp:Number(game.dataset.pp),turn:Number(game.dataset.turn),status:game.dataset.status,tier:league?.dataset.tier,cash:Number(league?.dataset.cash),hardcore:Number(league?.dataset.hardcore)};
  })()`);
  const wait = async (turn?: number) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const current = await state();
      if (current.status === "ready" && (turn === undefined || current.turn === turn))
        return current;
      await delay();
    }
    throw new Error("League action did not finish");
  };
  const advance = async () => {
    const before = await state();
    await close();
    await assert(
      '!document.querySelector("[data-testid=end-turn]").disabled',
      "Campaign ended before league smoke finished",
    );
    await click('[data-testid="end-turn"]');
    await wait(before.turn + 1);
    await open();
  };
  const select = (id: string) =>
    evaluate(
      `(() => {const picker=document.querySelector('[data-testid="league-picker"]');picker.value=${JSON.stringify(id)};picker.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  const expand = (kind: LeagueActionKind) =>
    evaluate(`document.querySelector('${scope} [data-league-action="${kind}"]').open=true`);
  const ready = (kind: LeagueActionKind) =>
    evaluate<boolean>(
      `!document.querySelector('${scope} [data-testid="review-${kind}"]').disabled`,
    );
  await open();
  await select("brazil");
  await delay();
  await expand("promoteLeague");
  await screenshot("17-leagues-overview.png");
  await click(".league-overview-heading .action-button");
  await evaluate(
    'document.querySelector("[data-testid=country-league-controls]").open=true;document.querySelector(".country-league-controls [data-league-action=promoteLeague]").open=true;document.querySelector(".country-league-controls").scrollIntoView({block:"nearest"})',
  );
  await screenshot("18-country-league-controls.png");
  await assert(
    'document.querySelector(".country-league-controls [data-testid=review-promoteLeague]") !== null',
    "Country card must expose management controls",
  );
  await evaluate('document.querySelector("[data-testid=country-league-controls]").open=false');
  await open();
  let turns = 0;
  while (turns++ < 160) {
    const exists = await evaluate<boolean>(
      '!!document.querySelector("[data-testid=league-picker] option[value=tuvalu]")',
    );
    if (exists) {
      await select("tuvalu");
      await delay();
      if (await ready("promoteLeague")) break;
    }
    await advance();
  }
  if (!(await ready("promoteLeague"))) throw new Error("Tuvalu never qualified for promotion");
  const receipts: Record<string, unknown> = {};
  for (const kind of ["promoteLeague", "bailoutLeague", "stepDownLeague"] as const) {
    let waited = 0;
    while (!(await ready(kind)) && waited++ < 40) {
      await advance();
      await select("tuvalu");
      await delay();
    }
    if (!(await ready(kind))) throw new Error(`Could not reach a legal ${kind}`);
    await expand(kind);
    const before = await state();
    const quote = await evaluate<{
      cashCost: number;
      ppCost: number;
      cashGrant: number;
      hardcoreDemoted: number;
    }>(
      `(() => {const row=document.querySelector('${scope} [data-league-action="${kind}"]');return {cashCost:Number(row.dataset.cashCost??0),ppCost:Number(row.dataset.ppCost??0),cashGrant:Number(row.dataset.cashGrant??0),hardcoreDemoted:Number(row.dataset.hardcoreDemoted??0)};})()`,
    );
    await click(`${scope} [data-testid="review-${kind}"]`);
    await screenshot(`19-${kind}-confirm.png`);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await delay();
    await assert(
      'document.querySelector(".overview-dialog").open && !document.querySelector(".league-confirm[open]")',
      "Escape must close only the confirmation",
    );
    if ((await state()).pp !== before.pp || (await state()).cash !== before.cash)
      throw new Error("Cancel changed league finances");
    await click(`${scope} [data-testid="review-${kind}"]`);
    await evaluate(
      `(() => {const button=document.querySelector('${scope} [data-testid="confirm-league-action"]');button.click();button.click();})()`,
    );
    const after = await wait();
    if (
      after.turn !== before.turn ||
      Math.abs(after.pp - (before.pp - quote.ppCost)) > 0.000001 ||
      Math.abs(after.cash - (before.cash - quote.cashCost + quote.cashGrant)) > 0.000001 ||
      after.hardcore !== before.hardcore - quote.hardcoreDemoted
    )
      throw new Error(
        `League action did not apply quoted terms once: ${JSON.stringify({ kind, before, quote, after })}`,
      );
    if (kind === "promoteLeague" && after.tier !== "semi-pro")
      throw new Error("Promotion did not change league tier");
    if (kind === "bailoutLeague")
      await assert(
        `document.querySelector('${scope} [data-league-action="bailoutLeague"] [data-testid="league-blocker"]').textContent.includes('cooldown')`,
        "Bailout cooldown missing",
      );
    if (kind === "stepDownLeague" && after.tier !== "amateur")
      throw new Error("Restructuring did not lower league tier");
    receipts[kind] = { before, quote, after };
  }
  await screenshot("20-league-restructured.png");
  win.setContentSize(390, 844);
  await delay();
  await assert(
    'document.documentElement.scrollWidth<=innerWidth && document.querySelector(".overview-dialog").scrollWidth<=document.querySelector(".overview-dialog").clientWidth',
    "League screen overflows narrow viewport",
  );
  await screenshot("21-leagues-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  await close();
  return {
    receipts,
    allActionsSpentOnce: true,
    cancelPreservedParent: true,
    narrowOverflow: false,
  };
}
