import type { BrowserWindow } from "electron";

/**
 * The sport's identity in play (GDD v1.18): the Rulebook under "Your sport" names the sport, its
 * founding club and ground, uses the chosen terms and draws the field; both layouts fit.
 */
export async function verifyRulebook(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  await evaluate(`document.querySelector('.game-nav [data-view=sport]').click()`);
  await delay();
  const view = await evaluate<{
    text: string;
    players: number;
    overflow: boolean;
    emblem: boolean;
  }>(
    `(() => {
      const book = document.querySelector('[data-testid="rulebook"]');
      return {
        text: book?.textContent ?? '',
        players: Number(book?.querySelector('[data-testid="field-diagram"]')?.dataset.players),
        emblem: !!book?.querySelector('svg.emblem[data-icon="bolt"]'),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    })()`,
  );
  const expected = [
    "Kettleball",
    "Pioneers",
    "A score is called a goal.",
    "A match is called a fixture.",
  ];
  const missing = expected.filter((part) => !view.text.includes(part));
  if (missing.length || !view.emblem || view.players < 1 || view.text.includes("{{"))
    throw new Error(`The Rulebook is missing ${JSON.stringify(missing)}: ${JSON.stringify(view)}`);
  await screenshot("02c-rulebook.png");
  win.setContentSize(390, 844);
  await delay();
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("02d-rulebook-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The Rulebook overflows on a narrow viewport.");
  await evaluate(`document.querySelector('.overview-dialog > header .icon-button').click()`);
  await delay();
  return { players: view.players, emblem: view.emblem, narrowOverflow };
}
