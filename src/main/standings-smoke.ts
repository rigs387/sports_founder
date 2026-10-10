import type { BrowserWindow } from "electron";

/**
 * Standings (GDD v1.35): opens the panel from the top bar's Fandom Score, checks every modeled
 * sport has a row and the chart is drawn, then shows the map's "#1 sport" view.
 */
export async function verifyStandings(
  win: BrowserWindow,
  screenshot: (name: string) => Promise<void>,
) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (condition: string) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(condition)) return;
      await delay(60);
    }
    throw new Error(`Standings smoke timed out: ${condition}`);
  };
  await evaluate(`document.querySelector('.game-nav [data-view=world]')?.click()`);
  await evaluate(`document.querySelector('[data-testid="open-standings"]').click()`);
  await wait(`document.querySelector('[data-testid="standings"]').open`);
  const rows = await evaluate<number>(
    `document.querySelectorAll('[data-testid="standings"] tbody tr').length`,
  );
  if (rows !== 3) throw new Error(`Standings should list three sports, not ${rows}`);
  const text = await evaluate<string>(
    `document.querySelector('[data-testid="standings"]').textContent`,
  );
  if (text.includes("{{")) throw new Error("Standings show a raw template");
  await wait(`!!document.querySelector('[data-testid="standings-chart"] polyline')`);
  await screenshot("59-standings.png");
  win.setContentSize(390, 844);
  await delay();
  const overflow = await evaluate<boolean>("document.documentElement.scrollWidth > innerWidth");
  win.setContentSize(1280, 800);
  await delay();
  if (overflow) throw new Error("Standings overflow a narrow window");
  await evaluate(`document.querySelector('[data-testid="standings"] header button').click()`);
  await wait(`!document.querySelector('[data-testid="standings"]').open`);
  await evaluate(`document.querySelector('[data-testid="map-top-sport"]').click()`);
  await delay(500);
  await screenshot("60-map-top-sport.png");
  await evaluate(`document.querySelector('[data-testid="map-top-sport"]').click()`);
  return { rows, chart: true };
}
