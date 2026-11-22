import type { BrowserWindow } from "electron";
import { COLLECT_NEWS } from "./smoke-news";

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
  // The action step moved the anchor's focus slot to Tonga and nothing brought it back, so its
  // purists resent it (GDD v1.40) and can drag the seat league into trouble, which silences the
  // broadcast. Tend home as a player would, and play on until the broadcast reaches abroad again.
  const tended = await tendHome(win);
  let broadcastTooltip = await hoverBroadcast(win, screenshot);
  let recoveryTurns = 0;
  while (!broadcastTooltip?.includes("Flagship broadcast") && recoveryTurns < 20) {
    await advance(win);
    recoveryTurns += 1;
    broadcastTooltip = await hoverBroadcast(win, screenshot);
  }
  if (!broadcastTooltip?.includes("Flagship broadcast"))
    throw new Error(
      `The United States tooltip must name the flagship broadcast (GDD v1.23), even after tending home for ${recoveryTurns} turns.`,
    );
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
    broadcast: string;
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
      broadcast: document.querySelector('[data-testid="flagship-broadcast"]')?.dataset.interest ?? '',
    };
  })()`);
  if (!view.visible || view.dialog || !view.mapHidden)
    throw new Error(`The flagship must be a main screen: ${JSON.stringify(view)}`);
  if (view.rows < 8 || view.champions < 1 || view.seat !== "brazil")
    throw new Error(`The flagship screen is missing its season: ${JSON.stringify(view)}`);
  if (view.format === "american" && !view.playoffLine)
    throw new Error("The American format must mark the playoff places.");
  if (!view.broadcast) throw new Error("The flagship screen must show its broadcast (GDD v1.23).");
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
  return { ...view, narrowOverflow, broadcastTooltip, tended, recoveryTurns };
}

/** Puts focus slot 1 back on the anchor through its country card, if it is not focused yet. */
async function tendHome(win: BrowserWindow): Promise<boolean> {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  await evaluate(`document.querySelector('.game-nav [data-view=world]').click()`);
  await evaluate(`(() => {
    const anchor = document.querySelector('[data-testid="game"]').dataset.anchor;
    const picker = document.querySelector('[data-testid="market-picker"]');
    picker.value = anchor;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (await evaluate<boolean>(`!!document.querySelector('[data-testid="focused-market"]')`))
    return true;
  const assigned = await evaluate<boolean>(`(() => {
    const button = document.querySelector('[data-testid="assign-focus"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!assigned) return false;
  await waitReady(win);
  await evaluate(`document.querySelector('.card-close')?.click()`);
  return true;
}

async function waitReady(win: BrowserWindow, turn?: number) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const now = (await win.webContents.executeJavaScript(
      `(() => { const g = document.querySelector('[data-testid="game"]'); return { status: g.dataset.status, turn: Number(g.dataset.turn) }; })()`,
    )) as { status: string; turn: number };
    if (now.status === "ready" && (turn === undefined || now.turn === turn)) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw new Error("The game did not become ready");
}

/** Ends one turn from the world map. */
async function advance(win: BrowserWindow) {
  const turn = Number(
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-testid="game"]').dataset.turn`,
    ),
  );
  await win.webContents.executeJavaScript(COLLECT_NEWS, true);
  await win.webContents.executeJavaScript(
    `document.querySelector('[data-testid="end-turn"]').click()`,
  );
  await waitReady(win, turn + 1);
  await win.webContents.executeJavaScript(
    `document.querySelector('.game-nav [data-view=world]')?.click()`,
  );
}

/**
 * Hovers a market the seat's media reaches (Brazil's seat reaches the United States) and reads
 * the tooltip's broadcast line (GDD v1.23, v1.27), or null when it lifts media there too little to
 * name.
 */
async function hoverBroadcast(win: BrowserWindow, screenshot: (name: string) => Promise<void>) {
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code) as Promise<T>;
  const flush = async () => {
    await win.webContents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  // Pending decisions pop up over the map (GDD v1.25); set them aside so the tooltip shows.
  for (let i = 0; i < 6; i += 1) {
    const later = await evaluate<boolean>(
      `(() => { const b=document.querySelector('[data-testid="event-popup-later"]'); b?.click(); return !!b; })()`,
    );
    if (!later) break;
    await flush();
  }
  await evaluate(
    `(() => {const picker=document.querySelector('[data-testid="market-picker"]');picker.value='united-states';picker.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await flush();
  const at = await evaluate<{ x: number; y: number }>(
    `(() => {const map=document.querySelector('[data-testid="world-map"]');const box=map.getBoundingClientRect();return {x:Math.round(box.x+Number(map.dataset.selectedX)),y:Math.round(box.y+Number(map.dataset.selectedY))};})()`,
  );
  await evaluate(`document.querySelector('.card-close')?.click()`);
  await flush();
  win.webContents.sendInputEvent({ type: "mouseMove", x: at.x, y: at.y });
  await flush();
  const line = await evaluate<string | null>(
    `document.querySelector('[data-testid="map-tooltip-broadcast"]')?.textContent ?? null`,
  );
  await screenshot("34-broadcast-tooltip.png");
  win.webContents.sendInputEvent({ type: "mouseMove", x: 5, y: 5 });
  await flush();
  return line;
}
