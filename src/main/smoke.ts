import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, type BrowserWindow } from "electron";

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

export function attachSmokeTest(win: BrowserWindow, outDir: string): void {
  win.webContents.on("console-message", (event) => {
    console.log(`[renderer:${event.level}] ${event.message}`);
  });
  win.webContents.once("did-finish-load", () => {
    run(win, outDir).then(
      () => app.exit(0),
      (error: unknown) => {
        console.error("[smoke] FAILED:", error instanceof Error ? error.message : error);
        app.exit(1);
      },
    );
  });
}

async function run(win: BrowserWindow, outDir: string): Promise<void> {
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
    await delay(300);
    const image = await win.webContents.capturePage();
    writeFileSync(join(outDir, name), image.toPNG());
  };

  const before = await waitFor((s) => s.status === "ready" && s.endTurnEnabled, "first snapshot");
  await screenshot("01-start.png");

  let current = before;
  for (let i = 0; i < TURNS_TO_PLAY; i += 1) {
    const expectedTurn = current.turn + 1;
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-testid="end-turn"]').click()`,
    );
    current = await waitFor(
      (s) => s.status === "ready" && s.turn === expectedTurn && s.endTurnEnabled,
      `turn ${expectedTurn}`,
    );
  }
  await screenshot("02-after-turns.png");

  const passed =
    current.turn === before.turn + TURNS_TO_PLAY &&
    current.quarter > before.quarter &&
    current.playerFandomScore !== before.playerFandomScore;
  const report = { passed, turnsPlayed: TURNS_TO_PLAY, before, after: current };
  writeFileSync(join(outDir, "smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[smoke] ${JSON.stringify(report)}`);
  if (!passed) throw new Error("The screen did not advance as expected after End Turn");
}
