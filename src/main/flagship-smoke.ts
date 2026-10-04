import type { BrowserWindow } from "electron";

/**
 * The flagship screen (GDD v1.14): a main screen, not a dialog. Late in the smoke campaign the
 * league has played many seasons, so the table, latest results and champions are all filled in.
 */
export async function verifyFlagship(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  await evaluate(`document.querySelector('.game-nav [data-view=flagship]').click()`);
  await delay();
  const view = await evaluate<{
    visible: boolean;
    dialog: boolean;
    mapHidden: boolean;
    rows: number;
    results: number;
    champions: number;
    playoffLine: boolean;
    seat: string;
    format: string;
    season: number;
    overflow: boolean;
  }>(`(() => {
    const screen = document.querySelector('[data-testid="flagship-screen"]');
    return {
      visible: !!screen && !screen.hidden,
      dialog: !!document.querySelector('dialog[open]'),
      mapHidden: document.querySelector('.world-stage').hidden,
      rows: document.querySelectorAll('[data-testid="flagship-table"] tbody tr').length,
      results: document.querySelectorAll('[data-testid="flagship-results"] li').length,
      champions: document.querySelectorAll('[data-testid="flagship-champions"] li').length,
      playoffLine: !!document.querySelector('[data-testid="flagship-table"] tr.playoff-line'),
      seat: screen?.dataset.seat ?? '',
      format: screen?.dataset.format ?? '',
      season: Number(screen?.dataset.season),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  })()`);
  if (!view.visible || view.dialog || !view.mapHidden)
    throw new Error(`The flagship must be a main screen: ${JSON.stringify(view)}`);
  if (view.rows < 8 || view.champions < 1 || view.seat !== "brazil")
    throw new Error(`The flagship screen is missing its season: ${JSON.stringify(view)}`);
  if (view.format === "american" && !view.playoffLine)
    throw new Error("The American format must mark the playoff places.");
  await screenshot("32-flagship.png");
  win.setContentSize(390, 844);
  await delay();
  const narrowOverflow = await evaluate<boolean>(
    "document.documentElement.scrollWidth > innerWidth",
  );
  await screenshot("33-flagship-narrow.png");
  win.setContentSize(1280, 800);
  await delay();
  if (narrowOverflow) throw new Error("The flagship screen overflows on a narrow viewport.");
  await evaluate(`document.querySelector('.game-nav [data-view=world]').click()`);
  await delay();
  return { ...view, narrowOverflow };
}
