import type { BrowserWindow } from "electron";

/**
 * Amending the rules (GDD v1.20): plays on to the offseason if needed, picks a rule and an
 * option the simulation allows, reviews it (price, purist loss, fit hints) and confirms, then checks
 * the Rulebook lists the dated amendment.
 */
export async function verifyAmendment(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    throw new Error(`Amendment smoke timed out: ${condition}`);
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const RULES = `${OFFSEASON} [data-testid="amend-rules"]`;
  const isOpen = () => evaluate<boolean>(`!!document.querySelector('${RULES} .amend-status.open')`);
  const closeOverview = () =>
    evaluate(`document.querySelector(".overview-dialog > header .icon-button")?.click()`);

  // The Rulebook is read-only (GDD v1.24): rules are amended on the offseason screen.
  await click(".game-nav [data-view=sport]");
  await wait(`!!document.querySelector('.overview-dialog [data-testid="amend-rules"]')`);
  if (await evaluate<boolean>(`!!document.querySelector('.overview-dialog .amend-pick')`))
    throw new Error("The Rulebook must not amend rules outside the offseason screen.");
  await closeOverview();
  let turnsPlayed = 0;
  while (!(await isOpen()) && turnsPlayed < 6) {
    await closeOverview();
    const next =
      Number(
        await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`),
      ) + 1;
    await click('[data-testid="end-turn"]');
    await wait(
      `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${next}; })()`,
    );
    turnsPlayed += 1;
  }
  if (!(await isOpen())) throw new Error("No offseason with an amendment left in 6 turns.");
  await click(".game-nav [data-view=offseason]");
  await wait(`!document.querySelector('${OFFSEASON}').hidden`);

  await click(`${RULES} .amend-pick:not(:disabled)`);
  await wait(`!!document.querySelector('[data-testid="amend-options"]')`);
  const picked = await evaluate<boolean>(`(() => {
    const free = [...document.querySelectorAll('[data-testid="amend-options"] label')]
      .find((label) => !label.querySelector('.amend-reason'));
    free?.querySelector('input').click();
    return !!free;
  })()`);
  if (!picked) throw new Error("No rule option was open to amend.");
  await wait(`!document.querySelector('[data-testid="amend-review"]').disabled`);
  await click('[data-testid="amend-review"]');
  await wait(`!!document.querySelector('[data-testid="amend-review-panel"]')`);
  const review = await evaluate<{ text: string; hints: number }>(`(() => {
    const panel = document.querySelector('[data-testid="amend-review-panel"]');
    return { text: panel.textContent, hints: panel.querySelectorAll('.amend-hints li').length };
  })()`);
  if (!review.text.includes("PP") || review.hints < 1 || review.text.includes("{{"))
    throw new Error(`The amendment review is incomplete: ${JSON.stringify(review)}`);
  await evaluate(
    `document.querySelector('[data-testid="amend-review-panel"]').scrollIntoView({ block: "center" })`,
  );
  await screenshot("41-amend-review.png");
  await click('[data-testid="amend-confirm"]');
  await wait(`!!document.querySelector('${RULES} [data-testid="amendments"] li')`);
  const listed = await evaluate<string>(
    `document.querySelector('${RULES} [data-testid="amendments"]').textContent`,
  );
  const done = await evaluate<string>(
    `document.querySelector('${RULES} .amend-status').textContent`,
  );
  if (!/amended \d{4}/.test(listed) || !/amended this year/.test(done))
    throw new Error(`The amendment was not recorded: ${listed} / ${done}`);
  await evaluate(
    `document.querySelector('${RULES} [data-testid="amendments"]').scrollIntoView({ block: "center" })`,
  );
  await screenshot("42-amendments.png");
  await click(".game-nav [data-view=world]");
  return { turnsPlayed, review: review.text.slice(0, 160), listed };
}
