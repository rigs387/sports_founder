import { join } from "node:path";
import type { BrowserWindow } from "electron";
import type { FilePrompts } from "./save-files";
import { COLLECT_NEWS } from "./smoke-news";

/**
 * The players' agreement (GDD v1.39, tech plan 2.25 step 2). The young smoke campaign's seat is
 * not Professional, so after the retirement step this loads the late-game campaign
 * (`late-game.sfsave`) again, not retired this time, plays on to an
 * offseason with talks open, moves the share below the union's ask to see its read change,
 * reviews the ask and puts it to the union, then checks the terms in force and the narrow layout.
 */
export async function verifyAgreement(
  win: BrowserWindow,
  outDir: string,
  prompts: FilePrompts,
  screenshot: (name: string) => Promise<void>,
) {
  const original = { ...prompts };
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector: string) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const exists = (selector: string) =>
    evaluate<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`);
  const wait = async (condition: string) => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Agreement smoke timed out: ${condition}`);
  };
  const OFFSEASON = '[data-testid="offseason-screen"]';
  const CARD = `${OFFSEASON} [data-testid="agreement-card"]`;
  const text = () => evaluate<string>(`document.querySelector('${CARD}')?.textContent ?? ""`);
  const read = () =>
    evaluate<string>(
      `document.querySelector('${CARD} [data-testid="agreement-read"]')?.dataset.read ?? ""`,
    );
  const checkText = (value: string) => {
    if (value.includes("{{") || /\bagreement\.[a-z]/.test(value))
      throw new Error(`The agreement card shows a missing string: ${value.slice(0, 300)}`);
  };

  try {
    // The retirement step leaves a retired campaign open on its retrospective, which closes when
    // this one loads.
    prompts.open = async () => join(outDir, "late-game.sfsave");
    await wait(`!document.querySelector('[data-testid="campaign-files"]').disabled`);
    await click('[data-testid="campaign-files"]');
    await wait(`document.querySelector('[data-testid="save-dialog"]').open`);
    await click('[data-testid="load-campaign"]');
    await delay();
    if (await exists('[data-testid="confirm-load"]')) await click('[data-testid="confirm-load"]');
    await wait(
      `(() => { const g = document.querySelector('[data-testid="game"]'); return g.dataset.status === "ready" && document.querySelector('[data-testid="retrospective-screen"]')?.hidden !== false; })()`,
    );
    await wait(`!document.querySelector(".save-dialog header button").disabled`);
    await click(".save-dialog header button");
    await click(".game-nav [data-view=world]");

    // Agreements run three to seven seasons: play on until talks open, at most eight turns.
    const talks = () =>
      evaluate<boolean>(
        `document.querySelector('${OFFSEASON}')?.dataset.open === 'true' && document.querySelector('${CARD}')?.dataset.talks === 'true'`,
      );
    let turnsPlayed = 0;
    while (!(await talks()) && turnsPlayed < 8) {
      const next =
        Number(
          await evaluate<string>(`document.querySelector('[data-testid="game"]').dataset.turn`),
        ) + 1;
      await click(".game-nav [data-view=world]");
      await evaluate(COLLECT_NEWS);
      await click('[data-testid="end-turn"]');
      await wait(
        `(() => { const g=document.querySelector('[data-testid="game"]'); return g.dataset.status === 'ready' && Number(g.dataset.turn) === ${next}; })()`,
      );
      turnsPlayed += 1;
    }
    if (!(await talks())) throw new Error("No offseason with the players' talks open.");
    await click(".game-nav [data-view=offseason]");
    await wait(`!document.querySelector('${OFFSEASON}').hidden`);
    await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
    const ask = await evaluate<string>(
      `document.querySelector('${CARD} [data-testid="agreement-ask"]').textContent`,
    );
    const askRead = await read();
    if (askRead !== "sign") throw new Error(`The union must sign its own ask: ${askRead}`);
    checkText(await text());
    await screenshot("60a-agreement.png");

    // The lowest share: the read turns to a risk or a refusal.
    await evaluate(`(() => {
      const input = document.querySelector('${CARD} [data-testid="agreement-share"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, input.min);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await delay();
    const lowRead = await read();
    if (lowRead === "sign") throw new Error("The union signs the lowest share: no risk to show.");
    checkText(await text());
    await screenshot("60b-agreement-risk.png");

    // Back to the ask, review it and put it to the union: it signs.
    await click(`${CARD} .flagship-back`);
    await delay();
    await click(`${CARD} [data-testid="agreement-review"]`);
    await wait(`!!document.querySelector('${CARD} [data-testid="agreement-confirm"]')`);
    const review = await evaluate<string>(
      `document.querySelector('${CARD} [data-testid="agreement-review-panel"]').textContent`,
    );
    checkText(review);
    await screenshot("60c-agreement-review.png");
    await click(`${CARD} [data-testid="agreement-confirm"]`);
    await wait(`document.querySelector('${CARD}').dataset.talks === 'false'`);
    const inForce = await evaluate<string>(
      `document.querySelector('${CARD} [data-testid="agreement-in-force"]')?.textContent ?? ""`,
    );
    if (!inForce) throw new Error("The signed agreement is not shown in force.");
    checkText(await text());

    win.setContentSize(390, 844);
    await delay();
    await evaluate(`document.querySelector('${CARD}').scrollIntoView()`);
    const narrowOverflow = await evaluate<boolean>(
      "document.documentElement.scrollWidth > innerWidth",
    );
    await screenshot("60d-agreement-narrow.png");
    win.setContentSize(1280, 800);
    await delay();
    if (narrowOverflow) throw new Error("The agreement card overflows on a narrow viewport.");
    await click(".game-nav [data-view=world]");
    return { turnsPlayed, ask, lowRead, review, inForce, narrowOverflow };
  } finally {
    Object.assign(prompts, original);
  }
}
