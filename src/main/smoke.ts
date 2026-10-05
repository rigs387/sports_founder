import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, type BrowserWindow } from "electron";
import { verifyActions } from "./action-smoke";
import { verifyChampionshipCard } from "./contest-smoke";
import { verifyTraditions } from "./culture-smoke";
import { verifyEvents } from "./event-smoke";
import { verifyFlagship } from "./flagship-smoke";
import { verifyRulebook } from "./identity-smoke";
import { verifyLeagues } from "./league-smoke";
import { verifyMap } from "./map-smoke";
import { verifyPopups } from "./popup-smoke";
import { verifyAmendment } from "./rules-smoke";
import type { FilePrompts } from "./save-files";
import { verifySaves } from "./save-smoke";
import { verifySeasonCards } from "./season-smoke";
import { verifySetup } from "./setup-smoke";
import { COLLECT_NEWS } from "./smoke-news";
import { verifyStarCards } from "./star-smoke";
import { verifyStarsPanel } from "./stars-smoke";

// Development-only self-check, enabled by the SF_SMOKE_OUT environment variable (see
// `npm run smoke`). It drives the real window: waits for the first campaign snapshot from the
// simulation worker, clicks End Turn a few times, confirms the screen advanced, saves
// screenshots, and exits with code 0 (pass) or 1 (fail).

const TURNS_TO_PLAY = 3;
const TIMEOUT_MS = 20_000;

interface UiState {
  status: string;
  turn: number;
  quarter: number;
  playerFandomScore: number;
  endTurnEnabled: boolean;
}

const READ_UI_STATE = `(() => {
  const game = document.querySelector('[data-testid="game"]');
  const button = document.querySelector('[data-testid="end-turn"]');
  if (!game) return null;
  return {
    status: game.dataset.status ?? "",
    turn: Number(game.dataset.turn),
    quarter: Number(game.dataset.quarter),
    playerFandomScore: Number(game.dataset.playerFandomScore),
    endTurnEnabled: !!button && !button.disabled,
  };
})()`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function attachSmokeTest(
  win: BrowserWindow,
  outDir: string,
  filePrompts: FilePrompts,
): void {
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
    console.log(`[renderer:${event.level}] ${event.message}`);
  });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const remote = /^https?:/.test(details.url);
    if (remote) remoteRequests.push(details.url);
    callback({ cancel: remote });
  });
  win.webContents.once("did-finish-load", () => {
    run(win, outDir, errors, remoteRequests, filePrompts).then(
      () => app.exit(0),
      async (error: unknown) => {
        console.error("[smoke] FAILED:", error instanceof Error ? error.message : error);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "failure.png"), (await win.webContents.capturePage()).toPNG());
        app.exit(1);
      },
    );
  });
}

async function run(
  win: BrowserWindow,
  outDir: string,
  errors: string[],
  remoteRequests: string[],
  filePrompts: FilePrompts,
): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const read = async (): Promise<UiState | null> =>
    (await win.webContents.executeJavaScript(READ_UI_STATE)) as UiState | null;

  const waitFor = async (done: (state: UiState) => boolean, label: string): Promise<UiState> => {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await read();
      if (state && done(state)) return state;
      await delay(100);
    }
    throw new Error(
      `Timed out waiting for ${label}; last UI state: ${JSON.stringify(await read())}`,
    );
  };

  const screenshot = async (name: string) => {
    // Hidden Chromium windows can return the last composited frame on the first capture.
    await win.webContents.capturePage();
    await delay(300);
    const image = await win.webContents.capturePage();
    writeFileSync(join(outDir, name), image.toPNG());
  };

  const setup = await verifySetup(win, screenshot);
  const events = await verifyEvents(win, outDir, filePrompts, screenshot);
  const before = await waitFor((s) => s.status === "ready" && s.endTurnEnabled, "first snapshot");
  await screenshot("01-start.png");

  let current = before;
  for (let i = 0; i < TURNS_TO_PLAY; i += 1) {
    const expectedTurn = current.turn + 1;
    await win.webContents.executeJavaScript(COLLECT_NEWS, true);
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-testid="end-turn"]').click()`,
    );
    current = await waitFor(
      (s) => s.status === "ready" && s.turn === expectedTurn,
      `turn ${expectedTurn}`,
    );
  }
  await screenshot("02-after-turns.png");
  const championship = await verifyChampionshipCard(win, screenshot);
  const rulebook = await verifyRulebook(win, screenshot);

  const passed =
    current.turn === before.turn + TURNS_TO_PLAY &&
    current.quarter > before.quarter &&
    current.playerFandomScore !== before.playerFandomScore;
  const map = await verifyMap(win, screenshot);
  const popups = await verifyPopups(win, screenshot);
  const actions = await verifyActions(win, screenshot);
  const leagues = await verifyLeagues(win, screenshot);
  const flagship = await verifyFlagship(win, screenshot);
  const seasonCards = await verifySeasonCards(win, screenshot);
  const starCards = await verifyStarCards(win, screenshot);
  const starsPanel = await verifyStarsPanel(win, screenshot);
  const amendment = await verifyAmendment(win, screenshot);
  const traditions = await verifyTraditions(win, screenshot);
  const saves = await verifySaves(win, outDir, filePrompts, screenshot);
  if (errors.length || remoteRequests.length)
    throw new Error(JSON.stringify({ errors, remoteRequests }));
  const report = {
    passed,
    turnsPlayed: TURNS_TO_PLAY,
    before,
    after: current,
    map,
    popups,
    setup,
    events,
    championship,
    rulebook,
    actions,
    leagues,
    flagship,
    seasonCards,
    starCards,
    starsPanel,
    amendment,
    traditions,
    saves,
    errors,
    remoteRequests,
  };
  writeFileSync(join(outDir, "smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[smoke] ${JSON.stringify(report)}`);
  if (!passed) throw new Error("The screen did not advance as expected after End Turn");
}
